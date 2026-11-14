// Keep discovery and attribute sampling in one bounded stream. Only completed
// character records are published; interrupted discovery can be replayed safely.
export function createCombinedCollector({ initialRows = [], concurrency, enrich, save, report, checkpointMs = 5000 }) {
  const rows = new Map(initialRows.map(row => [row.tag, row]));
  const scheduled = new Set();
  const active = new Set();
  let failure;
  let completed = initialRows.filter(row => row.category === 4 && row.attributesCollected).length;
  let characters = initialRows.filter(row => row.category === 4).length;
  let lastSave = 0;
  let writes = Promise.resolve();
  const notify = () => report({ stage: 'combined', total: null, catalogRows: rows.size, completed, characters, current: '' });
  const checkpoint = (force = false) => {
    if (!force && Date.now() - lastSave < checkpointMs) return writes;
    lastSave = Date.now();
    // A failed publication must not prevent the final recovery checkpoint.
    writes = writes.catch(() => {}).then(() => save([...rows.values()].filter(row => row.category !== 4 || row.attributesCollected)));
    return writes;
  };
  async function accept(batch) {
    for (const incoming of batch) {
      if (failure) throw failure;
      let row = rows.get(incoming.tag);
      if (!row) {
        row = incoming;
        rows.set(row.tag, row);
        if (row.category === 4) characters += 1;
      }
      if (row.category !== 4 || row.attributesCollected || scheduled.has(row.tag)) continue;
      while (active.size >= Math.max(1, concurrency)) {
        await Promise.race(active);
        if (failure) throw failure;
      }
      scheduled.add(row.tag);
      const task = Promise.resolve().then(async () => {
        row.attributes = await enrich(row);
        row.attributesCollected = true;
        completed += 1;
        notify();
        await checkpoint();
      }).catch(error => { failure ||= error; }).finally(() => active.delete(task));
      active.add(task);
    }
    notify();
    await checkpoint();
    if (failure) throw failure;
  }
  async function finish() {
    await Promise.all(active);
    await checkpoint(true);
    if (failure) throw failure;
    return [...rows.values()].filter(row => row.category !== 4 || row.attributesCollected);
  }
  return { accept, finish };
}

// Discovery runs in large batches; network sampling begins only after a batch
// is full. The final short batch is also enriched before completion.
export function createBatchedCombinedCollector(options) {
  const batchSize = options.batchSize ?? 50000;
  const initialRows = options.initialRows || [];
  const seen = new Set(initialRows.filter(row => row.category !== 4 || row.attributesCollected).map(row => row.tag));
  let pending = [];
  let batchNumber = 1;
  let scanned = 0;
  let checked = initialRows.filter(row => row.category === 4 && row.attributesCollected).length;
  let characters = initialRows.filter(row => row.category === 4 && row.attributesCollected).length;
  let batchStart = checked;
  let batchCharacters = 0;
  const inner = createCombinedCollector({
    ...options,
    initialRows: initialRows.filter(row => row.category !== 4 || row.attributesCollected),
    checkpointMs: options.checkpointMs ?? 60000,
    report: update => {
      checked = update.completed;
      options.report({ ...update, stage: 'batch-attributes', batchNumber, batchSize,
        catalogRows: seen.size, characters, charactersChecked: checked,
        completed: checked - batchStart, total: batchCharacters, scanned });
    },
  });
  const discoveryProgress = () => options.report({ stage: 'batch-discovery', batchNumber, batchSize,
    completed: pending.length, total: batchSize, catalogRows: seen.size, characters,
    charactersChecked: checked, scanned, current: '' });
  async function flush() {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    batchStart = checked;
    batchCharacters = batch.filter(row => row.category === 4).length;
    await inner.accept(batch);
    await inner.finish();
    batchNumber += 1;
  }
  async function accept(rows) {
    for (const row of rows) {
      scanned += 1;
      if (seen.has(row.tag)) continue;
      seen.add(row.tag);
      pending.push(row);
      if (row.category === 4) characters += 1;
      if (pending.length >= batchSize) await flush();
    }
    discoveryProgress();
  }
  async function finish() {
    await flush();
    return inner.finish();
  }
  async function checkpoint() {
    // No new sampling during cancellation. Discovered ordinary tags can still
    // be saved; unfinished characters are rediscovered on resume.
    await inner.accept(pending.filter(row => row.category !== 4)).catch(() => {});
    return inner.finish();
  }
  return { accept, finish, checkpoint };
}
