export function requestIntervalMs(percent) {
  const value = Number.isFinite(Number(percent)) ? Math.max(10, Math.min(100, Number(percent))) : 100;
  return 1000 / (3 * value / 100);
}

export function parseCombinedCheckpoint(csv, options) {
  const records = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (c === '\r' || c === '\n')) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell); if (row.some(Boolean)) records.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Saved CSV is incomplete. Restore a completed checkpoint before resuming.');
  if (cell || row.length) { row.push(cell); records.push(row); }
  const headers = records.shift() || [];
  for (const required of ['tag', 'category', 'type', 'attributes']) {
    if (!headers.includes(required)) throw new Error('Resume requires a combined CSV.');
  }
  const seen = new Set();
  return records.map(cells => {
    if (cells.length !== headers.length) throw new Error('Saved CSV contains an incomplete row.');
    const data = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    const category = Number(data.category);
    if (!data.tag || ![0, 1, 3, 4, 5].includes(category) || seen.has(data.tag)) throw new Error('Saved CSV contains invalid or duplicate entries.');
    seen.add(data.tag);
    const attributes = data.attributes.split(',').map(s => s.trim()).filter(Boolean).map(t => [t, 0]);
    return { tag: data.tag, category, color: data.color, postCount: Number(data.post_count) || 0,
      classifiers: (data.classifiers || '').split('|').filter(Boolean), attributes,
      attributesCollected: data.attributes_collected === '1' || attributes.length > 0, options };
  });
}
