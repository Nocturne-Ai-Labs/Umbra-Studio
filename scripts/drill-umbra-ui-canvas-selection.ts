import {
  createUmbraCanvasProjectDocument,
  createUmbraCanvasShapeEntity,
  createUmbraCanvasTextEntity,
} from '../frontend/src/features/canvas/canvasModel';
import { useUmbraCanvasStore } from '../frontend/src/features/canvas/useUmbraCanvasStore';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const project = createUmbraCanvasProjectDocument('Selection qualification');
const rectangle = createUmbraCanvasShapeEntity('rectangle', { x: 32, y: 48, width: 320, height: 240 });
const label = createUmbraCanvasTextEntity({ x: 400, y: 64, width: 480, height: 160 });
project.entities = [rectangle, label];
project.activeEntityId = label.id;
useUmbraCanvasStore.getState().replaceProject(project);

const duplicateIds = useUmbraCanvasStore.getState().duplicateEntities([rectangle.id, label.id]);
let state = useUmbraCanvasStore.getState();
assert(duplicateIds.length === 2, 'Grouped duplicate did not create every selected layer.');
assert(state.present.entities.length === 4, 'Grouped duplicate produced an unexpected entity count.');
assert(state.past.length === 1, 'Grouped duplicate must create exactly one undo entry.');

state.undo();
state = useUmbraCanvasStore.getState();
assert(state.present.entities.length === 2, 'One undo did not remove the complete grouped duplicate.');
state.redo();

const beforeTransform = useUmbraCanvasStore.getState();
const duplicateBefore = duplicateIds.map((id) => beforeTransform.present.entities.find((entity) => entity.id === id)!);
beforeTransform.updateDrawableTransforms(duplicateIds.map((entityId, index) => ({
  entityId,
  transform: { x: 960 + index * 128, y: 512 + index * 64, rotation: 15 + index * 5 },
})));
state = useUmbraCanvasStore.getState();
assert(state.past.length === 2, 'Grouped transform must create exactly one additional undo entry.');
assert(duplicateIds.every((id, index) => state.present.entities.find((entity) => entity.id === id && 'x' in entity)?.x === 960 + index * 128), 'Grouped transform did not update every selected layer.');

state.undo();
state = useUmbraCanvasStore.getState();
assert(duplicateIds.every((id, index) => state.present.entities.find((entity) => entity.id === id && 'x' in entity)?.x === duplicateBefore[index].x), 'One undo did not restore the complete grouped transform.');

state.deleteEntities(duplicateIds);
state = useUmbraCanvasStore.getState();
assert(state.present.entities.length === 2, 'Grouped delete did not remove every selected layer.');
assert(state.past.length === 2, 'Grouped delete must create exactly one additional undo entry.');
state.undo();
state = useUmbraCanvasStore.getState();
assert(state.present.entities.length === 4, 'One undo did not restore the complete grouped delete.');

console.log('PASSED Umbra Canvas selection transaction drill.');
console.log(JSON.stringify({ duplicated: duplicateIds.length, finalEntities: state.present.entities.length, undoEntries: state.past.length }));
