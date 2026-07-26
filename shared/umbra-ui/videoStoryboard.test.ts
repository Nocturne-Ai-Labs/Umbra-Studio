import { describe, expect, test } from 'bun:test';
import {
  buildUmbraLtxDirectorInputContract,
  normalizeUmbraLtxStoryboardControls,
  resolveUmbraLtxStoryboardTimeline,
  resolveUmbraVideoDurationSeconds,
  resolveUmbraVideoFrameIndexForSeconds,
  resolveUmbraVideoFramesForDuration,
  snapUmbraLtxFrameCount,
} from './videoStoryboard';

describe('Umbra LTX storyboard timeline', () => {
  test('snaps total duration to the LTX 8n+1 frame rule', () => {
    const timeline = resolveUmbraLtxStoryboardTimeline({
      enabled: true,
      shots: [
        { id: 'a', prompt: 'first shot', durationSeconds: 2 },
        { id: 'b', prompt: 'second shot', durationSeconds: 3 },
      ],
    }, 25, 121);

    expect(timeline.enabled).toBe(true);
    expect(timeline.frames).toBe(129);
    expect((timeline.frames - 1) % 8).toBe(0);
    expect(timeline.timelineFrames).toBe(timeline.frames - 1);
    expect(timeline.shots.reduce((sum, shot) => sum + shot.lengthFrames, 0)).toBe(timeline.timelineFrames);
    expect(timeline.shots[1].startFrame).toBe(timeline.shots[0].lengthFrames);
    expect(timeline.localPrompts).toBe('first shot|second shot');
  });

  test('normalizes unsafe prompt delimiters and shot controls', () => {
    const storyboard = normalizeUmbraLtxStoryboardControls({
      enabled: true,
      epsilon: 4,
      shots: [{
        id: 'shot',
        prompt: 'camera pans | subject turns',
        durationSeconds: 0,
        strength: 3,
        agentEnabled: true,
      }],
    });

    expect(storyboard.epsilon).toBe(0.99);
    expect(storyboard.shots[0].prompt).toBe('camera pans , subject turns');
    expect(storyboard.shots[0].durationSeconds).toBe(0.5);
    expect(storyboard.shots[0].strength).toBe(1);
    expect(storyboard.shots[0].agentEnabled).toBe(true);
  });

  test('uses the existing frame count when storyboard mode is disabled', () => {
    const timeline = resolveUmbraLtxStoryboardTimeline({ enabled: false }, 25, 122);
    expect(timeline.enabled).toBe(false);
    expect(timeline.frames).toBe(snapUmbraLtxFrameCount(122));
    expect(timeline.shots).toEqual([]);
  });

  test('round-trips user-facing seconds through model frame constraints', () => {
    const ltxFrames = resolveUmbraVideoFramesForDuration(10, 25, 8);
    const wanFrames = resolveUmbraVideoFramesForDuration(10, 16, 4);

    expect((ltxFrames - 1) % 8).toBe(0);
    expect((wanFrames - 1) % 4).toBe(0);
    expect(Math.abs(resolveUmbraVideoDurationSeconds(ltxFrames, 25) - 10)).toBeLessThanOrEqual(0.16);
    expect(Math.abs(resolveUmbraVideoDurationSeconds(wanFrames, 16) - 10)).toBeLessThanOrEqual(0.13);
  });

  test('retimes guide positions when output FPS changes', () => {
    const originalSeconds = 48 / 24;
    const retimedFrame = resolveUmbraVideoFrameIndexForSeconds(originalSeconds, 30, 8, 240);
    expect(retimedFrame).toBe(64);
    expect(Math.abs(retimedFrame / 30 - originalSeconds)).toBeLessThanOrEqual(8 / 30);
  });

  test('builds the exact Umbra Director temporal prompt contract', () => {
    const contract = buildUmbraLtxDirectorInputContract({
      enabled: true,
      epsilon: 0.25,
      shots: [
        { id: 'one', prompt: 'camera pushes in', durationSeconds: 2 },
        { id: 'two', prompt: 'subject turns', durationSeconds: 3 },
      ],
    }, 25, 121, 'same character, same room');

    expect(contract.inputs.global_prompt).toBe('same character, same room');
    expect(JSON.parse(String(contract.inputs.storyboard_json))).toMatchObject({
      version: 1,
      fps: 25,
      outputFrames: contract.timeline.frames,
      timelineFrames: contract.timeline.frames - 1,
      shots: [
        { id: 'one', startFrame: 0, prompt: 'camera pushes in' },
        { id: 'two', prompt: 'subject turns' },
      ],
    });
    expect(contract.inputs.transition_epsilon).toBe(0.25);
  });
});
