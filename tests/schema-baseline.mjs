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
  for (const table of [
    'app_state', 'ecg_app_users', 'ecg_app_sessions', 'ecg_password_resets',
    'ecg_auth_rate_limits', 'ecg_absences', 'ecg_staff', 'ecg_members',
    'ecg_event_duties', 'ecg_demo_expenses', 'ecg_maintenance_documents', 'ecg_data_repairs',
  ]) assert.ok(tables.includes(table), `Missing bootstrap table: ${table}`);
  const columns = (await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='app_state'")).rows;
  assert.ok(columns.some(c => c.column_name === 'revision' && c.data_type === 'bigint'));
  console.log('PASS: consolidated PostgreSQL schema bootstraps 12 application tables idempotently with bigint app_state revisions. Synthetic database only.');
} finally {
  await db.close();
}
