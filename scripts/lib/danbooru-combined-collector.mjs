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
