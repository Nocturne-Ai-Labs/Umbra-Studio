import { describe, expect, test } from 'bun:test';
import { isUmbraExtendedVideoOutputPath } from './UmbraUiExtendedVideoService';

describe('Umbra extended video service', () => {
  test('recognizes supported video outputs', () => {
    expect(isUmbraExtendedVideoOutputPath('clip.mp4')).toBe(true);
    expect(isUmbraExtendedVideoOutputPath('clip.webm')).toBe(true);
    expect(isUmbraExtendedVideoOutputPath('frame.png')).toBe(false);
  });
});
