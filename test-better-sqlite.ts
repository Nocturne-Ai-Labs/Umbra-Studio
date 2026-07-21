async function run() {
  // Bun does not support better-sqlite3 native bindings yet.
  if (typeof Bun !== 'undefined') {
    const { Database } = await import('bun:sqlite');
    const db = new Database(':memory:');
    const row = db.query('select 1 as ok').get() as { ok: number };
    db.close();
    if (row?.ok === 1) {
      console.log('Bun SQLite works!');
      return;
    }
    throw new Error('Unexpected Bun SQLite result');
  }

  try {
    const mod = await import('better-sqlite3');
    const Database = (mod as any).default || mod;
    const db = new Database(':memory:');
    const row = db.prepare('select 1 as ok').get();
    db.close();
    if (row?.ok === 1) {
      console.log('better-sqlite3 works!');
      return;
    }
    throw new Error('Unexpected better-sqlite3 result');
  } catch (error: any) {
    console.error('better-sqlite3 check skipped/failed:', error?.message || error);
  }
}

run();
