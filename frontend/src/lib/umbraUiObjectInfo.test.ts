import { describe, expect, test } from 'bun:test';
import { readUmbraObjectInfoRequiredInputs } from './umbraUiObjectInfo';

describe('Umbra ComfyUI object-info discovery', () => {
  test('rejects ComfyUI\'s successful empty payload for an unregistered node', () => {
    expect(() => readUmbraObjectInfoRequiredInputs({}, 'MissingNode')).toThrow('MissingNode is not registered');
  });

  test('accepts a registered node even when it has no required inputs', () => {
    expect(readUmbraObjectInfoRequiredInputs({
      RegisteredNode: { input: { required: {} } },
    }, 'RegisteredNode')).toEqual({});
  });

  test('returns the exact registered required-input descriptors', () => {
    const required = { model_name: [['model.safetensors']] };
    expect(readUmbraObjectInfoRequiredInputs({
      ModelNode: { input: { required } },
    }, 'ModelNode')).toBe(required);
  });
});
