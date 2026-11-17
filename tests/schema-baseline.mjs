import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await fs.readFile(new URL('../scripts/schema.sql', import.meta.url), 'utf8');
const db = new PGlite();
try {
  await db.exec(sql);
  await db.exec(sql); // Bootstrap is idempotent for an empty/test database.
  const rows = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const tables = rows.map(row => row.tablename);
  const expected=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS\\s+(\\w+)/gi)].map(match=>match[1]).sort();
  assert.equal(expected.length,18,'canonical schema contains all 18 application tables');
  assert.deepEqual(tables,expected,'exact canonical table inventory');
  const columns = (await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='app_state'")).rows;
  assert.ok(columns.some(c => c.column_name === 'revision' && c.data_type === 'bigint'));
  assert.ok((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='ecg_auth_rate_limits'")).rows.some(row=>row.column_name==='account_id'));
  console.log('PASS: canonical PostgreSQL schema bootstraps all 18 application tables idempotently with bigint revisions and current auth buckets. Synthetic database only.');
} finally {
  await db.close();
}
