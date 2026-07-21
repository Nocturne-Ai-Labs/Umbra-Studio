import { Database } from 'bun:sqlite';
try {
  const db = new Database(':memory:');
  console.log('Bun SQLite works!');
  db.close();
} catch (e) {
  console.error('Bun SQLite failed:', e);
}
