import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { ensureAuthRateLimitSchema, consumeAuthAttempt, clearAuthAttempts } from '../lib/auth-rate-limit.js';

const db = new PGlite();
const sql = async (strings, ...values) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  const result = await db.query(text, values);
  return result.rows;
};

try {
  await ensureAuthRateLimitSchema(sql);
  for (let i = 0; i < 5; i++) {
    assert.equal(await consumeAuthAttempt(sql, 'login', ' User@Example.Test ', 5, 15), true);
  }
  assert.equal(await consumeAuthAttempt(sql, 'login', 'user@example.test', 5, 15), false, 'sixth attempt must be rejected');
  assert.equal(await consumeAuthAttempt(sql, 'login', 'another@example.test', 5, 15), true, 'different accounts are independent');
  assert.equal(await consumeAuthAttempt(sql, 'reset', 'user@example.test', 3, 60), true, 'reset and login have separate buckets');
  assert.equal(await consumeAuthAttempt(sql, 'reset', 'user@example.test', 3, 60), true);
  assert.equal(await consumeAuthAttempt(sql, 'reset', 'user@example.test', 3, 60), true);
  assert.equal(await consumeAuthAttempt(sql, 'reset', 'user@example.test', 3, 60), false);
  const id = createHash('sha256').update('ecg:login:user@example.test').digest('hex');
  await sql`UPDATE ecg_auth_rate_limits SET window_start=now()-interval '16 minutes' WHERE id=${id}`;
  assert.equal(await consumeAuthAttempt(sql, 'login', 'user@example.test', 5, 15), true, 'expired window resets');
  await clearAuthAttempts(sql, 'login', 'user@example.test');
  const rows = await sql`SELECT count(*)::integer AS count FROM ecg_auth_rate_limits WHERE id=${id}`;
  assert.equal(rows[0].count, 0, 'successful login clears bucket');
  assert.equal(await consumeAuthAttempt(sql, 'login', 'user@example.test', 5, 15), true);
  assert.equal(await consumeAuthAttempt(sql, 'login', '', 5, 15), false);
  console.log('PASS: PostgreSQL-backed auth limits, sixth attempt rejection, reset isolation, expiry, successful clearing, normalized identifiers. Synthetic data only.');
} finally {
  await db.close();
}
