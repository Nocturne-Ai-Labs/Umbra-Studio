import React from 'react';

export interface H3ForgeResponse {
  simple_prompt?: string;
  message?: string;
  error?: string;
  raw?: string;
  warnings?: string[];
}

const BASE_FIELDS = ['integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music'];
const REFERENCE_FIELDS = [
  'subject_definitions', 'summary', 'retention_analysis', 'detailed_description',
  'overall_soundscape', 'non_diegetic_music',
];

export function recoverH3ForgeDraft(response: H3ForgeResponse, mode: string): string | null {
  if (response.error !== 'no_segments' || !response.raw?.trim()) return null;
  const raw = response.raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!raw || /<think>/i.test(raw)) return null;
  const fenced = raw.match(/^```(?:text)?\s*\n([\s\S]*?)\n```$/i);
  const draft = (fenced?.[1] || raw).trim();
  const fields = mode === 'REF2VA' ? REFERENCE_FIELDS : BASE_FIELDS;
  const firstLine = draft.split(/\r?\n/, 1)[0].trim();
  const startsWithField = firstLine.toLowerCase().startsWith(`${fields[0]}:`);
  const startsWithAlignment = mode !== 'T2VA' && mode !== 'REF2VA'
    && /^(?:For the target video|How the reference pictures align)\b/i.test(firstLine);
  if (!startsWithField && !startsWithAlignment) return null;
  const headings = [...draft.matchAll(/^\s*([a-z_]+)\s*:/gim)];
  let previous = -1;
  for (const field of fields) {
    const index = headings.findIndex((match, position) => position > previous && match[1].toLowerCase() === field);
    if (index < 0) return null;
    const body = draft.slice(headings[index].index! + headings[index][0].length, headings[index + 1]?.index ?? draft.length).trim();
    if (!body) return null;
    previous = index;
  }
  return draft;
}

export function h3ForgeFailureMessage(response: H3ForgeResponse): string {
  if (response.error === 'no_segments') {
    return response.raw?.trim()
      ? 'Llama returned a reply without the required Prompt Forge sections. View its response below before retrying.'
      : 'The model returned no text. Check that it loaded correctly and has enough context to write a prompt.';
  }
  return response.message || 'Prompt Forge did not return a draft.';
}

export function H3ForgeRawResponse({ raw }: { raw: string }) {
  if (!raw.trim()) return null;
  return (
    <details className="min-w-0 rounded border border-white/15 bg-black/30 p-2 text-xs text-zinc-300">
      <summary className="cursor-pointer">View model response</summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-400">{raw}</pre>
    </details>
  );
}
