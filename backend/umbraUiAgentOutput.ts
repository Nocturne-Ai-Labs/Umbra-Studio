function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.flatMap((part) => (
    part && (part.type === 'text' || part.type === 'output_text') && typeof part.text === 'string'
      ? [part.text]
      : []
  )).join('\n');
}

export function extractAgentResponseText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const data = payload as Record<string, any>;
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length' || data.done_reason === 'length' || data.status === 'incomplete') {
    throw new Error('The agent response was cut off before completion. Increase the agent output-token limit or retry with a shorter request. Your original prompt has not been replaced.');
  }
  if (choice?.message) return textContent(choice.message.content);
  if (choice && 'text' in choice) return textContent(choice.text);
  if (data.message) return textContent(data.message.content);
  if ('response' in data) return textContent(data.response);
  if (typeof data.output_text === 'string') return data.output_text;
  if (Array.isArray(data.output)) {
    return data.output.filter((item: any) => item?.type === 'message' && item.role === 'assistant')
      .map((item: any) => textContent(item.content)).filter(Boolean).join('\n');
  }
  // Unknown JSON envelopes and reasoning-only responses are never prompt text.
  return '';
}

function removeReasoningBlocks(value: string): string {
  const tags = /<\s*(\/?)\s*(think|thinking|reasoning|analysis)\b[^>]*>/gi;
  let output = '', cursor = 0, depth = 0;
  for (const match of value.matchAll(tags)) {
    const index = match.index!;
    if (!depth) output += value.slice(cursor, index);
    if (match[1]) {
      // Some local templates emit the closing thinking tag without its opener.
      if (!depth) output = '';
      else depth--;
    } else depth++;
    cursor = index + match[0].length;
  }
  return output + (depth ? '' : value.slice(cursor));
}

export function cleanUmbraUiAgentPromptOutput(value: string, maxLength = 40_000): string {
  let output = String(value || '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n?/g, '\n').trim();
  output = removeReasoningBlocks(output);
  let reasoningBox = false;
  output = output.split('\n').filter(line => {
    if (/^[ \t]*[\u250c\u256d][\u2500\u2501].*\b(?:reasoning|thinking|analysis)\b/i.test(line)) {
      reasoningBox = true;
      return false;
    }
    if (reasoningBox) {
      if (/^[ \t]*[\u2514\u2570][\u2500\u2501]/.test(line)) reasoningBox = false;
      return false;
    }
    return true;
  }).map(line => line.replace(/^[ \t]*\u2502[ \t]?/, '').replace(/[ \t]*\u2502[ \t]*$/, '')).join('\n');

  // Prefer the explicit final-answer contract; never select a paragraph by length.
  const wrapped = [...output.matchAll(/<umbra_prompt\s*>([\s\S]*?)<\/umbra_prompt\s*>/gi)];
  if (wrapped.length) output = wrapped.at(-1)![1];
  else if (/<\/?umbra_prompt\b/i.test(output)) return '';
  {
    const lines = output.split('\n');
    const result: string[] = [];
    let inReasoning = false;
    for (const line of lines) {
      const heading = line.trim().replace(/^#{1,6}[ \t]+/, '')
        .replace(/^(?:\*\*|__)(.+?)(?:\*\*|__)(?=[ \t:]|$)/, '$1');
      if (/^(?:reasoning|thinking|analysis|chain of thought|explanation|rationale)(?:[ \t]*[:\uff1a][\s\S]*|[ \t]*\.{0,3})$/i.test(heading)) {
        inReasoning = true;
        continue;
      }
      const final = heading.match(/^(?:final(?: (?:answer|response|prompt))?|answer|response|(?:positive |enhanced |revised )?prompt)[ \t]*[:\uff1a][ \t]*(.*)$/i)
        || heading.match(/^(?:final answer|final prompt|final response)[ \t]*$/i);
      if (final) {
        result.length = 0;
        inReasoning = false;
        if (final[1]) result.push(final[1]);
        continue;
      }
      if (!inReasoning) result.push(line);
    }
    output = result.join('\n');
  }
  output = output.trim().replace(/^```(?:text|markdown|md|prompt)?[ \t]*\n/i, '').replace(/\n```[ \t]*$/, '').trim();
  // Retain compatibility with older Hermes stage-command responses.
  if (/^umbra_ui_stage_prompt\b/i.test(output)) {
    const segments = output.match(/\bsegments\s*=\s*\[([\s\S]*?)\](?:\s+\w+\s*=|$)/i)?.[1];
    if (!segments) return '';
    output = segments.replace(/(^|;\s*)(?:subject|identity|pose|action|composition|camera|setting|environment|lighting(?:\s+and\s+style)?|style|quality(?:\s+details)?)\s*:\s*/gi, '$1').replace(/;\s*/g, ', ');
  }
  output = output.replace(/(?:^|\n)[ \t]*(?:\*\*)?(?:restrained[ \t]+)?negative prompt[ \t]*:[\s\S]*$/i, '').trim();
  return output.slice(0, maxLength);
}

export const AGENT_PROMPT_RESPONSE_FORMAT = 'Return your final generation prompt inside <umbra_prompt> and </umbra_prompt>. Put only the usable prompt inside these tags, with no reasoning, explanations, headings, or commentary. These tags are a response envelope, not part of the image/video prompt.';
