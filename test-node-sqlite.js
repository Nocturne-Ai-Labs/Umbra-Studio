const Database = require('better-sqlite3');
try {
  const db = new Database(':memory:');
  console.log('Better-SQLite3 works with Node!');
  db.close();
} catch (e) {
  console.error('Better-SQLite3 check skipped/failed with Node:', e?.message || e);
}
