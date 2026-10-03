import { DEFAULT_MINIMAX_H3_CONTINUITY, type MiniMaxH3DirectorContinuity, type MiniMaxH3DirectorRefMod } from './minimaxH3Director';

export interface OfficialH3DirectorSettings {
  continuity: MiniMaxH3DirectorContinuity & { nextPrompt: string };
  refMods: MiniMaxH3DirectorRefMod[];
}

const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const fail = (message: string): never => { throw new Error(`H3 Director: ${message}`); };

export function readOfficialH3DirectorSettings(state: Record<string, any>): OfficialH3DirectorSettings {
  const raw = state.continuity || {};
  return {
    continuity: { ...DEFAULT_MINIMAX_H3_CONTINUITY, capture: raw.capture === true,
      session: raw.session || DEFAULT_MINIMAX_H3_CONTINUITY.session,
      sourceKind: raw.source_kind === 'video' ? 'video' : 'checkpoint', sourceId: raw.source_id || '',
      sourceVideoId: raw.source_video_id || '', overlapFrames: raw.overlap_frames ?? 22,
      useReferences: raw.use_references === true, idea: raw.idea || '', nextPrompt: raw.continuation_prompt || '' },
    refMods: Array.isArray(state.refmods) ? structuredClone(state.refmods) : [],
  };
}

export function hasOfficialH3Continuity(settings?: OfficialH3DirectorSettings): boolean {
  return !!(settings?.continuity.sourceKind === 'video' ? settings.continuity.sourceVideoId : settings?.continuity.sourceId);
}

export function configureOfficialH3DirectorSettings(state: Record<string, any>, settings: OfficialH3DirectorSettings,
  context: { durationSeconds: number; frameRate: number; mode: string }): Record<string, any> {
  const c = settings?.continuity;
  if (!c || typeof c !== 'object' || !idPattern.test(c.session) || c.session === '_imports') fail('choose a valid continuity session.');
  if (!['checkpoint', 'video'].includes(c.sourceKind) || typeof c.sourceId !== 'string' || typeof c.sourceVideoId !== 'string'
    || [c.sourceId, c.sourceVideoId].some(id => id && !idPattern.test(id))) fail('select a valid continuity source.');
  if (typeof c.capture !== 'boolean' || typeof c.useReferences !== 'boolean' || ![5, 22, 39, 56, 73].includes(c.overlapFrames)) fail('invalid continuity controls.');
  if (typeof c.idea !== 'string' || c.idea.length > 12000 || typeof c.nextPrompt !== 'string' || c.nextPrompt.length > 50000) fail('invalid continuation prompt.');
  const continuing = hasOfficialH3Continuity(settings);
  if ((continuing || c.capture) && context.frameRate !== 24) fail('continuity requires native 24 fps.');
  if (continuing && (!(context.durationSeconds > 0) || context.durationSeconds > 15)) fail('new visible duration must be greater than zero and at most 15 seconds.');
  if (!Array.isArray(settings.refMods) || settings.refMods.length > 8) fail('at most eight RefMod slots are supported.');
  const slots = new Set<number>();
  for (const row of settings.refMods) {
    if (!row || !Number.isInteger(row.slot) || row.slot < 1 || row.slot > 8 || slots.has(row.slot)) fail('RefMod slots must be unique numbers from 1 to 8.');
    slots.add(row.slot);
    if (typeof row.enabled !== 'boolean' || typeof row.name !== 'string' || /[\x00-\x1f:]|^[\\/]|(^|[\\/])\.\.?([\\/]|$)/.test(row.name)
      || typeof row.strength !== 'number' || !Number.isFinite(row.strength) || row.strength < 0 || row.strength > 1
      || typeof row.description !== 'string' || row.description.length > 50000) fail(`invalid RefMod ${row.slot}.`);
    if (row.enabled && !row.name) fail(`choose a file for RefMod ${row.slot}, or disable it.`);
  }
  return { ...state, refmods: structuredClone(settings.refMods), continuity: {
    ...state.continuity, version: 3, operation: continuing ? 'continue' : 'new', capture: c.capture || continuing,
    session: c.session, source_kind: c.sourceKind, source_id: c.sourceId, source_video_id: c.sourceVideoId,
    overlap_frames: c.overlapFrames, use_references: c.useReferences, continuation_prompt: c.nextPrompt, idea: c.idea,
  } };
}
