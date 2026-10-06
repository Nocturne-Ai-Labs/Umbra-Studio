// Exact, numeric-only legacy action forms. No user strings are wildcard matches.
export const NUMERIC_UI_TEMPLATES = [
  'Move {count} Items Here',
  'Copy {count} Items Here',
  'Move {count} Selected Here',
  'Copy {count} Selected Here',
  'Download {count} Originals',
  'Download {count} JPEGs + Metadata',
  'Download {count} Clean JPEGs',
  'Copy {count} Paths',
  'Restore {count} Items',
  'Delete Permanently ({count})',
  'Delete {count} Items',
  'Reorder {count} Before',
  'Reorder {count} After',
  'Edit Tags ({count})',
  'Upscale ({count})',
  'Image Censor ({count})',
  'Image Watermark ({count})',
  'Video Watermark ({count})',
  'Video to GIF ({count})',
  'Metadata Scanner ({count})',
  'Visual Analysis ({count})',
  'Expires in {count} days',
  'Rename {count} Items',
  'Place {count} Items Before',
  'Place {count} Items After',
  'Copy {count} Files',
  'Cut {count} Files',
  'Mark NSFW ({count})',
  'Remove NSFW Mark ({count})',
  'Edit Tags ({count})...',
  'Move {count} Items to Trash',
  'Position {current} of {total}',
  'Running position {current} of {total}',
  'Generating {current}/{total}',
  '{count} queued',
  '{count} queued groups',
  '{count} recent',
  '{count} visible',
  '{count} known media',
  '{count} subfolders',
  '{loaded}/{total} media loaded',
  '{count} metadata matches',
  '{count} metadata matches - searching...',
  '{count} matches in current folder',
  '{count} media in {sets} sets',
  '{count} media, {folders} folders - {scanned} scanned',
  '{count} media, {folders} folders - searching...',
  '{count} media, {folders} folders - {scanned} scanned - searching...',
  '{count} media, {folders} folders, {archives} ZIPs',
  'Shot {count}',
  'Cleared {count} video review jobs.',
  'Copied {count} prompts',
  'Queue selected combinations for the chosen set ({prompts} prompts, {images} images)',
  'Queue selected combinations for the chosen set ({prompts} prompts, {images} images, capped)',
  'Queue selected combinations across all sets ({prompts} prompts, {images} images)',
  'Queue selected combinations across all sets ({prompts} prompts, {images} images, capped)',
  'Enter a whole-number width from {min} to {max} pixels.',
  'Enter a whole-number height from {min} to {max} pixels.',
] as const;

export const NUMERIC_UI_PATTERNS = NUMERIC_UI_TEMPLATES.map(template => {
  const slots: string[] = [];
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // These controlled count labels are pluralized at existing call sites.
    .replace(/\bfolders\b/g, 'folders?').replace(/\bsets\b/g, 'sets?')
    .replace(/\bmatches\b/g, 'match(?:es)?').replace(/\bZIPs\b/g, 'ZIPs?')
    .replace(/\bgroups\b/g, 'groups?').replace(/\bsubfolders\b/g, 'subfolders?')
    .replace(/\bjobs\b/g, 'jobs?');
  let previous = 0;
  let pattern = '^';
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    pattern += escape(template.slice(previous, match.index)) + '(\\d[\\d,.]*)';
    slots.push(match[1]);
    previous = match.index + match[0].length;
  }
  pattern += escape(template.slice(previous)) + '$';
  return { template, slots, pattern: new RegExp(pattern) };
});
