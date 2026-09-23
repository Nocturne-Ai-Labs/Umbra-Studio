import assert from 'node:assert/strict';
import { saveUmbraCanvasRequiredRevision } from '../frontend/src/features/canvas/canvasProjectSaveGate';

let finishAutosave!: (result: { id: string; revision: number }) => void;
const autosave = new Promise<{ id: string; revision: number }>((resolve) => { finishAutosave = resolve; });
const required = { id: 'canvas-a', revision: 12 };
let activeSave: Promise<typeof required> | null = autosave;
void autosave.finally(() => { if (activeSave === autosave) activeSave = null; });
let freshWrites = 0;
const queuedSave = saveUmbraCanvasRequiredRevision(
  required,
  () => {
    if (activeSave) return activeSave;
    freshWrites += 1;
    const request = Promise.resolve(required);
    activeSave = request;
    void request.finally(() => { if (activeSave === request) activeSave = null; });
    return request;
  },
  () => true,
);
assert.equal(freshWrites, 0, 'the required save should join the in-flight autosave');
finishAutosave({ id: 'canvas-a', revision: 11 });
assert.deepEqual(await queuedSave, required);
assert.equal(freshWrites, 1, 'a stale autosave requires exactly one fresh save');

let attempts = 0;
const edited = await saveUmbraCanvasRequiredRevision(
  required,
  async () => { attempts += 1; return { id: 'canvas-a', revision: 11 }; },
  () => false,
);
assert.deepEqual(edited, { id: 'canvas-a', revision: 11 });
assert.equal(attempts, 1, 'an intervening project edit must block the retry');

attempts = 0;
assert.equal(await saveUmbraCanvasRequiredRevision(
  required,
  async () => { attempts += 1; return null; },
  () => true,
), null);
assert.equal(attempts, 1, 'a failed save must not be retried implicitly');

attempts = 0;
assert.deepEqual(await saveUmbraCanvasRequiredRevision(
  required,
  async () => { attempts += 1; return required; },
  () => true,
), required);
assert.equal(attempts, 1, 'a current save must not be repeated');

console.log('Canvas save gate synthetic drill passed.');
