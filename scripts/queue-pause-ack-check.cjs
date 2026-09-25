const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');

const file = path.resolve(__dirname, '../frontend/src/components/layout/PowerPrompter.tsx');
const code = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, label) {
  let match;
  function walk(node) {
    if (predicate(node)) match = node;
    if (!match) ts.forEachChild(node, walk);
  }
  walk(source);
  assert.ok(match, `Missing ${label}`);
  return match.getText(source);
}
function variable(name) {
  return find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((declaration) => declaration.name.getText(source) === name), name);
}
const resultHandler = find((node) => ts.isIfStatement(node)
  && node.expression.getText(source) === "messageType === 'queue_pause_result'", 'queue_pause_result handler');
const snippet = `function build() {
${variable('rejectAllPendingQueueRequests')}
${variable('requestQueuePauseToggleThroughWebSocket')}
${variable('pauseQueueForQueueEditor')}
function handlePauseResult(payload) { const messageType = 'queue_pause_result'; ${resultHandler} }
return { rejectAllPendingQueueRequests, requestQueuePauseToggleThroughWebSocket, pauseQueueForQueueEditor, handlePauseResult };
}`;
const compiled = ts.transpileModule(snippet, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function makeHarness({ initialPaused = false, connected = true, liveQueue = true, currentSnapshot = true, emptyStack = false,
  targetType = 'pipeline', resolvedTargetBridgeId = 'pipeline:x' } = {}) {
  let paused = initialPaused;
  let busy = null;
  let nextId = 0;
  let sendOkay = true;
  const sent = [];
  const toasts = [];
  const timers = [];
  const ws = { readyState: connected ? 1 : 3 };
  const pendingQueuePauseControlsRef = { current: new Map() };
  const backendQueuePauseRequestedRef = { current: false };
  const backendQueueSnapshotRequestIdsRef = { current: new Set(liveQueue ? ['live'] : []) };
  const queueStackItemsRef = { current: liveQueue && !emptyStack ? [{ requestId: 'live', status: 'pending', exiting: false }] : [] };
  const queuePausedRef = { get current() { return paused; } };
  const env = {
    pendingQueuePauseControlsRef,
    pendingBackendQueueControlsRef: { current: new Map() },
    pendingQueueInterruptsRef: { current: new Map() },
    pendingQueueRequestsRef: { current: new Map() },
    backendQueuePauseRequestedRef,
    backendQueueSnapshotRequestIdsRef,
    backendQueueSnapshotPausedRef: { current: initialPaused && currentSnapshot },
    queueStackItemsRef,
    queuePausedRef,
    queueVisualStateRef: { current: { requestId: 'live' } },
    queueRequestMetaRef: { current: new Map([['live', { queueTargetType: 'pipeline', targetBridgeId: 'pipeline:x' }]]) },
    selectedQueueTargetTypeRef: { current: 'pipeline' },
    effectiveQueueTargetBridgeIdRef: { current: 'pipeline:x' },
    prompterWsReadyRef: { current: connected },
    prompterWsRef: { current: connected ? ws : null },
    WebSocket: { OPEN: 1 },
    resolveQueueControlTarget: () => ({ targetBridgeId: resolvedTargetBridgeId, queueTargetType: targetType }),
    createRequestId: () => `control-${++nextId}`,
    sendPrompterWsMessage: (message) => { if (!sendOkay) return false; sent.push(message); return true; },
    setQueuePaused: (value) => { paused = value; },
    setQueueControlBusy: (value) => { busy = typeof value === 'function' ? value(busy) : value; },
    showToast: (message, type) => { toasts.push({ message, type }); },
    hasCurrentBackendQueueSnapshot: () => currentSnapshot && connected,
    isLocalStagedQueueRequestId: () => false,
    scheduleRecoverableQueueSnapshotPersist: () => {},
    useCallback: (callback) => callback,
    setTimeout: (callback) => { const timer = { callback, active: true }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { timer.active = false; },
  };
  const operations = new Function(...Object.keys(env), `${compiled}\nreturn build();`)(...Object.values(env));
  return {
    ...operations, sent, toasts, timers, pendingQueuePauseControlsRef, backendQueuePauseRequestedRef,
    get paused() { return paused; }, get busy() { return busy; },
    setSendOkay(value) { sendOkay = value; },
    expire() { const timer = timers.find((item) => item.active); assert.ok(timer); timer.callback(); },
  };
}

(async () => {
  const resume = makeHarness({ initialPaused: true });
  const resumePromise = resume.requestQueuePauseToggleThroughWebSocket(false, 'pipeline:x', 'pipeline');
  assert.equal(resume.paused, true, 'Resume must wait for ACK before unpausing');
  resume.handlePauseResult({ requestId: 'foreign', success: true, backendHandled: true, paused: false });
  assert.equal(resume.paused, true, 'Foreign ACK must not change state');
  resume.handlePauseResult({ requestId: 'control-1', success: true, backendHandled: true, paused: false });
  await resumePromise;
  assert.equal(resume.paused, false);
  assert.equal(resume.pendingQueuePauseControlsRef.current.size, 0);

  const pause = makeHarness();
  const pausePromise = pause.requestQueuePauseToggleThroughWebSocket(true, 'pipeline:x', 'pipeline');
  assert.equal(pause.paused, true, 'Pause keeps a local safety hold while awaiting ACK');
  assert.equal(pause.backendQueuePauseRequestedRef.current, true);
  pause.handlePauseResult({ requestId: 'control-1', success: true, backendHandled: true, paused: true });
  await pausePromise;

  const pipelineMissingBackendAck = makeHarness();
  const pipelineMissingBackendAckPromise = pipelineMissingBackendAck.requestQueuePauseToggleThroughWebSocket(true);
  pipelineMissingBackendAck.handlePauseResult({ requestId: 'control-1', success: true, paused: true });
  await assert.rejects(pipelineMissingBackendAckPromise, /not confirmed/,
    'A pipeline control must not accept a bridge-style result without backendHandled');

  const bridge = makeHarness({ targetType: 'bridge', resolvedTargetBridgeId: '' });
  const bridgePromise = bridge.requestQueuePauseToggleThroughWebSocket(true);
  assert.equal(bridge.sent[0].queueTargetType, 'bridge');
  assert.equal(bridge.backendQueuePauseRequestedRef.current, false,
    'A bridge pause must not claim backend ownership while waiting');
  bridge.handlePauseResult({ requestId: 'control-1', success: true, paused: true });
  await bridgePromise;
  assert.equal(bridge.backendQueuePauseRequestedRef.current, false,
    'A valid bridge ACK must not claim backend ownership');

  const bridgeMismatch = makeHarness({ targetType: 'bridge', resolvedTargetBridgeId: '' });
  const bridgeMismatchPromise = bridgeMismatch.requestQueuePauseToggleThroughWebSocket(true);
  bridgeMismatch.handlePauseResult({ requestId: 'control-1', success: true, paused: false });
  await assert.rejects(bridgeMismatchPromise, /not confirmed/,
    'A bridge result must confirm the requested pause state');

  const explicitBridgeId = makeHarness({ targetType: 'bridge', resolvedTargetBridgeId: 'bridge:x' });
  const explicitBridgeIdPromise = explicitBridgeId.requestQueuePauseToggleThroughWebSocket(true);
  explicitBridgeId.handlePauseResult({ requestId: 'control-1', success: true, paused: true });
  await assert.rejects(explicitBridgeIdPromise, /not confirmed/,
    'The server currently handles controls with an explicit target ID in the backend');

  const failed = makeHarness();
  const failedPromise = failed.requestQueuePauseToggleThroughWebSocket(true, 'pipeline:x', 'pipeline');
  failed.handlePauseResult({ requestId: 'control-1', success: false, backendHandled: true, paused: true, error: 'rejected' });
  await assert.rejects(failedPromise, /rejected/);
  assert.equal(failed.pendingQueuePauseControlsRef.current.size, 0);
  assert.ok(failed.sent.some((message) => message.type === 'bridge_catalog_request'));

  const timeout = makeHarness({ initialPaused: true });
  const timeoutPromise = timeout.requestQueuePauseToggleThroughWebSocket(false, 'pipeline:x', 'pipeline');
  timeout.expire();
  await assert.rejects(timeoutPromise, /Timed out/);
  timeout.handlePauseResult({ requestId: 'control-1', success: true, backendHandled: true, paused: false });
  assert.equal(timeout.paused, true, 'Late ACK must not override state after timeout');

  const disconnected = makeHarness();
  const disconnectedPromise = disconnected.requestQueuePauseToggleThroughWebSocket(true, 'pipeline:x', 'pipeline');
  disconnected.rejectAllPendingQueueRequests('Power Prompter websocket disconnected.');
  await assert.rejects(disconnectedPromise, /disconnected/);
  assert.equal(disconnected.pendingQueuePauseControlsRef.current.size, 0);

  const sendFailure = makeHarness();
  sendFailure.setSendOkay(false);
  await assert.rejects(sendFailure.requestQueuePauseToggleThroughWebSocket(true, 'pipeline:x', 'pipeline'), /disconnected/);
  assert.equal(sendFailure.pendingQueuePauseControlsRef.current.size, 0);

  const editorDisconnected = makeHarness({ initialPaused: true, connected: false, currentSnapshot: false });
  assert.equal(await editorDisconnected.pauseQueueForQueueEditor(), false,
    'Disconnect safety hold must not authorize editor mutation');
  assert.ok(editorDisconnected.toasts.every((toast) => toast.type !== 'success'));
  const editorBackendIdWithoutRows = makeHarness({ initialPaused: true, connected: false, currentSnapshot: false, emptyStack: true });
  assert.equal(await editorBackendIdWithoutRows.pauseQueueForQueueEditor(), false,
    'Backend request IDs must still require confirmation when local rows are temporarily absent');

  const editor = makeHarness();
  let editorResolved = false;
  const editorPromise = editor.pauseQueueForQueueEditor().then((result) => { editorResolved = true; return result; });
  await Promise.resolve();
  assert.equal(editorResolved, false, 'Editor must wait for pause ACK');
  assert.ok(editor.toasts.every((toast) => toast.type !== 'success'));
  editor.handlePauseResult({ requestId: 'control-1', success: true, backendHandled: true, paused: true });
  assert.equal(await editorPromise, true);
  assert.ok(editor.toasts.some((toast) => toast.type === 'success'));

  assert.equal((code.match(/await pauseQueueForQueueEditor\(/g) || []).length, 3,
    'Editor open, save, and add-group must all await pause ACK');
  console.log('PASS: pipeline and bridge pause/resume ACK correlation, timeout, disconnect, editor gate, and stale ACK handling.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
