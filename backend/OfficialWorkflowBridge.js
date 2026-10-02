/* Same-origin ComfyUI iframe bridge. Loading and capture never enqueue a prompt. */
(() => {
  'use strict';
  if (window.__umbraOfficialWorkflowBridgeInstalled) return;
  window.__umbraOfficialWorkflowBridgeInstalled = true;

  const REQUESTS = new Set(['UMBRA_OFFICIAL_WORKFLOW_LOAD', 'UMBRA_OFFICIAL_WORKFLOW_SERIALIZE']);
  const WORKFLOWS = new Set(['h3-26', 'ltx23-50']);
  const TIMEOUT_MS = 15000;
  const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
  const MAX_NODES = 8192;
  let active = null;
  let loaded = null;
  let runtimeFaulted = false;

  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const stable = value => JSON.stringify(value, (_key, item) => record(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const sortedIds = values => [...new Set(values || [])].sort((a, b) => String(a).localeCompare(String(b)));
  // graphToPrompt compresses unlabeled, unconnected widget slots in its UI
  // result. Compare the same representation while retaining all linked slots.
  const nativeInputs = values => (values || []).filter(input => !(input.widget && input.link === null && !input.label));
  const nodeId = value => {
    if (typeof value === 'string' && value.length > 0 && value.length <= 128) return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    return fail('The official workflow contains an invalid node or link ID.');
  };

  // Compare the UI graph, including nested definitions, without building an API graph.
  function inspectWorkflow(workflow) {
    if (!record(workflow) || !Array.isArray(workflow.nodes) || !workflow.nodes.length) {
      fail('Expected the original ComfyUI UI workflow, including its nodes and subgraphs.');
    }
    const graphs = [];
    const types = new Set();
    const definitionIds = new Set();
    let totalNodes = 0;
    const ports = (values, graphPorts = false) => (values || []).map(port => {
      if (!record(port) || typeof port.name !== 'string') fail('The workflow has invalid connection slots.');
      return graphPorts
        ? { id: port.id, name: port.name, type: port.type, links: sortedIds(port.linkIds) }
        : { name: port.name, type: port.type, link: port.link ?? null, links: sortedIds(port.links) };
    });
    const walk = (graph, scope, depth) => {
      if (depth > 32 || !record(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
        fail('The workflow has invalid or unsupported nested graph data.');
      }
      const ids = new Set();
      const nodes = graph.nodes.map(node => {
        if (!record(node) || typeof node.type !== 'string' || !node.type) fail('The workflow has an invalid node class.');
        const id = nodeId(node.id);
        if (ids.has(String(id))) fail('The workflow contains duplicate node IDs.');
        ids.add(String(id));
        if (++totalNodes > MAX_NODES) fail('The workflow exceeds the supported graph size.');
        types.add(node.type);
        if (node.subgraph) walk(node.subgraph, `${scope}/node:${id}`, depth + 1);
        return { id, type: node.type, inputs: ports(nativeInputs(node.inputs)), outputs: ports(node.outputs) };
      }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const links = graph.links.map(link => {
        const values = Array.isArray(link) ? link : record(link)
          ? [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot, link.type] : [];
        if (values.length < 6 || !Number.isSafeInteger(values[2]) || !Number.isSafeInteger(values[4])) {
          fail('The workflow has an invalid connection.');
        }
        const target = graph.nodes.find(node => String(node.id) === String(values[3]));
        let slot = values[4];
        if (target) {
          const input = target.inputs?.[slot];
          slot = input ? nativeInputs(target.inputs).indexOf(input) : -1;
          if (slot < 0) fail('The workflow topology targets a missing native input slot.');
        }
        return [nodeId(values[0]), nodeId(values[1]), values[2], nodeId(values[3]), slot, values[5]];
      }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      graphs.push({ scope, nodes, links, inputs: ports(graph.inputs, true), outputs: ports(graph.outputs, true),
        inputNode: graph.inputNode?.id ?? null, outputNode: graph.outputNode?.id ?? null });
      const definitions = graph.definitions?.subgraphs || [];
      if (!Array.isArray(definitions)) fail('The workflow has invalid subgraph definitions.');
      for (const definition of definitions) {
        const id = nodeId(definition?.id);
        if (definitionIds.has(String(id))) fail('The workflow contains duplicate subgraph definitions.');
        definitionIds.add(String(id));
        walk(definition, `definition:${id}`, depth + 1);
      }
    };
    walk(workflow, 'root', 0);
    const nodeTypes = [...types].filter(type => !definitionIds.has(type)).sort();
    return { topology: stable(graphs.sort((a, b) => a.scope.localeCompare(b.scope))), nodeTypes };
  }

  function checkAbort(operation) {
    if (operation.controller.signal.aborted) throw operation.controller.signal.reason;
  }
  function bounded(promise, operation) {
    checkAbort(operation);
    const signal = operation.controller.signal;
    return new Promise((resolve, reject) => {
      const onAbort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  }
  const pause = operation => bounded(new Promise(resolve => setTimeout(resolve, 100)), operation);

  async function manifestItem(workflowId, operation) {
    const response = await bounded(fetch('/api/video/official-workflows', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: operation.controller.signal,
    }), operation);
    if (!response.ok) fail('Could not verify the pinned workflow manifest. Reload Umbra and try again.');
    const manifest = await bounded(response.json(), operation);
    const item = Array.isArray(manifest?.items) && manifest.items.find(entry => entry?.id === workflowId);
    if (!item || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(item.sha256)
      || !Array.isArray(item.nodeTypes) || item.nodeTypes.some(type => typeof type !== 'string' || !type)) {
      fail('The pinned workflow manifest is unavailable or incompatible. Update Umbra before loading.');
    }
    if (item.readiness?.ready !== true) {
      const issues = Array.isArray(item.readiness?.issues)
        ? item.readiness.issues.filter(issue => typeof issue === 'string').join(' ') : '';
      fail(`Official workflow dependencies are not ready. ${issues || item.readiness?.error || item.readiness?.reason || 'Start the managed ComfyUI instance and install the required nodes through Umbra Setup.'}`);
    }
    return item;
  }

  async function sourceHash(sourceText, operation) {
    if (typeof sourceText !== 'string' || !sourceText.length || sourceText.length > MAX_SOURCE_BYTES) {
      fail('The original workflow source is missing or too large.');
    }
    const bytes = new TextEncoder().encode(sourceText);
    if (bytes.byteLength > MAX_SOURCE_BYTES) fail('The original workflow source is too large.');
    if (!crypto.subtle) fail('Secure SHA-256 verification is unavailable. Open Umbra over localhost or HTTPS.');
    const digest = await bounded(crypto.subtle.digest('SHA-256', bytes), operation);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  function runtimeProblem(app, api, nodeTypes) {
    if (!app || typeof app.loadGraphData !== 'function' || typeof app.graphToPrompt !== 'function'
      || app.isGraphReady === false || !app.graph || typeof app.graph.serialize !== 'function') {
      return 'ComfyUI native graph loading and serialization are not ready.';
    }
    const registered = window.LiteGraph?.registered_node_types;
    if (!registered) return 'ComfyUI frontend node registration is unavailable. Update the managed frontend.';
    const missing = nodeTypes.filter(type => !Object.hasOwn(registered, type));
    if (missing.length) return `Missing ComfyUI frontend node classes: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}.`;
    if (app.__dasiwaNodeStatusSwitchGraphToPromptPatched !== true || api?.__dasiwaNodeStatusSwitchQueuePatched !== true) {
      return 'DaSiWa Node Status Switch native serialization hooks are missing.';
    }
    if (nodeTypes.includes('DaSiWa_SeedControl') && app.__dasiwaSeedGraphPromptPatched !== true) {
      return 'DaSiWa lossless Seed Control native serialization hook is missing.';
    }
    const required = ['DaSiWa.NodeStatusSwitch'];
    if (nodeTypes.includes('DaSiWa_SeedControl')) required.push('DaSiWa.SeedControl');
    if (nodeTypes.includes('MiniMaxH3Director')) required.push('DaSiWa.MiniMaxH3Director');
    if (nodeTypes.includes('DaSiWa_LTX2LoraLoader')) required.push('DaSiWa.LTX2LoraLoader');
    if (nodeTypes.includes('DaSiWa_EnhancedVideoCombine')) required.push('DaSiWa.EnhancedVideoCombinePreview');
    const extensions = Array.isArray(app.extensions) ? app.extensions : [];
    const missingExtensions = required.filter(name => !extensions.some(extension => extension?.name === name));
    if (missingExtensions.length) return `Missing registered DaSiWa frontend extensions: ${missingExtensions.join(', ')}.`;
    return '';
  }

  async function runtime(nodeTypes, operation) {
    let modules;
    try {
      modules = await bounded(Promise.all([import('/comfy/scripts/app.js'), import('/comfy/scripts/api.js')]), operation);
    } catch (error) {
      checkAbort(operation);
      fail(`Could not access this ComfyUI instance's native frontend. Reload its iframe. ${error?.message || ''}`);
    }
    const [{ app }, { api }] = modules;
    let problem;
    while ((problem = runtimeProblem(app, api, nodeTypes))) {
      operation.waitReason = `${problem} Update the managed ComfyUI/DaSiWa nodes and reload this iframe; no fallback serializer is used.`;
      await pause(operation);
    }
    operation.waitReason = '';
    return { app, api };
  }

  function assertTopology(workflow, expected) {
    if (inspectWorkflow(workflow).topology !== expected) {
      fail('The native ComfyUI workflow topology differs from the pinned original. Restore the original workflow before capture; only widgets, layout and modes may change.');
    }
  }
  function assertLiveNodes(app, nodeTypes) {
    const visited = new Set();
    const walk = graph => {
      if (!graph || visited.has(graph)) return;
      visited.add(graph);
      const nodes = graph._nodes || graph.nodes;
      if (!Array.isArray(nodes)) fail('ComfyUI native graph nodes are not accessible. Reload the iframe.');
      for (const node of nodes) {
        if (node.has_errors || node.flags?.missing || node.isMissingNode || node.constructor?.name === 'MissingNode') {
          fail(`ComfyUI could not load node ${node.type || node.id}. Install the required frontend node and reload the original workflow.`);
        }
        if (nodeTypes.includes(node.type) && !Object.hasOwn(window.LiteGraph.registered_node_types, node.type)) {
          fail(`ComfyUI frontend node ${node.type} is no longer registered. Reload the iframe.`);
        }
        if ((node.type === 'DaSiWa_SeedControl' || node.comfyClass === 'DaSiWa_SeedControl')
          && (node.__dasiwaSeedInstalled !== true || typeof node.__dasiwaSeedRestorePersistedState !== 'function')) {
          fail('DaSiWa Seed Control did not install its native lossless widget hooks. Update DaSiWa and reload the iframe.');
        }
        if (node.subgraph) walk(node.subgraph);
      }
      if (graph.subgraphs && typeof graph.subgraphs.values === 'function') {
        for (const subgraph of graph.subgraphs.values()) walk(subgraph);
      }
    };
    walk(app.graph);
  }

  function assertPrompt(promptGraph) {
    if (!record(promptGraph) || !Object.keys(promptGraph).length || Object.keys(promptGraph).length > MAX_NODES) {
      fail('The native serializer did not return a usable API prompt graph.');
    }
    const walk = (value, key, depth) => {
      if (depth > 64) fail('The native prompt contains unsupported nested input data.');
      if (typeof value === 'number' && (!Number.isFinite(value) || (/seed/i.test(key) && !Number.isSafeInteger(value)))) {
        fail('A native API seed is not a safe integer. Use the DaSiWa lossless seed control or a safe numeric seed; the bridge never coerces uint64 values.');
      }
      if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
        fail('The native serializer returned unsupported API input data.');
      }
      if (Array.isArray(value)) value.forEach(item => walk(item, key, depth + 1));
      else if (record(value)) Object.entries(value).forEach(([name, item]) => walk(item, name, depth + 1));
    };
    for (const node of Object.values(promptGraph)) {
      if (!record(node) || typeof node.class_type !== 'string' || !record(node.inputs)) {
        fail('The native serializer returned an invalid API node.');
      }
      if (node.class_type === 'DaSiWa_NodeStatusSwitch' || Object.keys(node.inputs).some(key => /^target_\d+$/.test(key))) {
        fail('DaSiWa status-switch hooks did not sanitize the native API graph. Update DaSiWa and reload the iframe.');
      }
      walk(node.inputs, '', 0);
    }
  }

  async function nativeCall(operation, callback) {
    checkAbort(operation);
    operation.nativePending = true;
    const result = Promise.resolve().then(() => { checkAbort(operation); return callback(); });
    result.then(() => { operation.nativePending = false; }, () => { operation.nativePending = false; });
    return bounded(result, operation);
  }
  async function load(message, operation) {
    if (typeof message.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(message.sourceSha256)) {
      fail('The original workflow SHA-256 is missing or invalid. Load the pinned source supplied by Umbra.');
    }
    const item = await manifestItem(message.workflowId, operation);
    const sha256 = await sourceHash(message.sourceText, operation);
    if (sha256 !== item.sha256.toLowerCase() || sha256 !== message.sourceSha256.toLowerCase()) {
      fail('Original workflow SHA-256 verification failed. Load the pinned source supplied by Umbra.');
    }
    let workflow;
    try { workflow = JSON.parse(message.sourceText.replace(/^\uFEFF/, '')); }
    catch { fail('The original workflow is not valid JSON. Reload the pinned source.'); }
    const inspection = inspectWorkflow(workflow);
    if (stable([...item.nodeTypes].sort()) !== stable(inspection.nodeTypes)) {
      fail('The pinned manifest node classes do not match the original workflow. Update Umbra.');
    }
    const { app } = await runtime(inspection.nodeTypes, operation);
    loaded = null;
    const result = await nativeCall(operation, () => app.loadGraphData(workflow, true, true, null,
      { checkForRerouteMigration: false, skipAssetScans: true }));
    if (result === false) fail('ComfyUI refused to load the original workflow. Check its missing-node dialog.');
    checkAbort(operation);
    assertLiveNodes(app, inspection.nodeTypes);
    assertTopology(app.graph.serialize(), inspection.topology);
    loaded = { workflowId: message.workflowId, sourceText: message.sourceText, sourceSha256: sha256, ...inspection };
    return { ok: true };
  }
  async function serialize(message, operation) {
    if (!loaded || loaded.workflowId !== message.workflowId) fail('Load this pinned original workflow explicitly before capture.');
    const source = loaded;
    const item = await manifestItem(message.workflowId, operation);
    if (item.sha256.toLowerCase() !== source.sourceSha256) fail('The pinned workflow changed. Explicitly load its current original before capture.');
    const { app, api } = await runtime(source.nodeTypes, operation);
    assertLiveNodes(app, source.nodeTypes);
    assertTopology(app.graph.serialize(), source.topology);
    const result = await nativeCall(operation, () => app.graphToPrompt());
    checkAbort(operation);
    const problem = runtimeProblem(app, api, source.nodeTypes);
    if (problem) fail(`${problem} Reload the iframe before capture.`);
    assertLiveNodes(app, source.nodeTypes);
    assertTopology(app.graph.serialize(), source.topology);
    assertTopology(result?.workflow, source.topology);
    assertPrompt(result?.output);
    return { ok: true, workflow: result.workflow, promptGraph: result.output, sourceSha256: source.sourceSha256, serializer: 'comfy-native-v1' };
  }

  const reply = (message, result) => window.parent.postMessage({ type: `${message.type}_RESULT`, requestId: message.requestId, ...result }, location.origin);
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== window.parent || event.origin !== location.origin || !record(message)
      || !REQUESTS.has(message.type) || typeof message.requestId !== 'string' || !message.requestId || message.requestId.length > 200) return;
    if (active) { reply(message, { ok: false, error: 'Another official workflow operation is still in progress. Wait for its result before retrying.' }); return; }
    if (runtimeFaulted) { reply(message, { ok: false, error: 'A native ComfyUI operation timed out. Reload the iframe before loading or capturing another workflow.' }); return; }
    if (!WORKFLOWS.has(message.workflowId)) { reply(message, { ok: false, error: 'Unknown official workflow. Choose a pinned Umbra workflow.' }); return; }
    const operation = { controller: new AbortController(), nativePending: false, waitReason: '' };
    active = operation;
    const timer = setTimeout(() => operation.controller.abort(new Error(operation.waitReason || 'The official workflow operation exceeded 15 seconds. Reload the iframe and try again.')), TIMEOUT_MS);
    try {
      reply(message, await (message.type === 'UMBRA_OFFICIAL_WORKFLOW_LOAD' ? load(message, operation) : serialize(message, operation)));
    } catch (error) {
      if (operation.controller.signal.aborted && operation.nativePending) { runtimeFaulted = true; loaded = null; }
      reply(message, { ok: false, error: error?.message || 'Official workflow operation failed. Reload the original and try again.' });
    } finally {
      clearTimeout(timer);
      operation.controller.abort(new Error('Operation completed.'));
      active = null;
    }
  });
  window.addEventListener('pagehide', () => active?.controller.abort(new Error('The ComfyUI iframe was closed or reloaded.')));
})();
