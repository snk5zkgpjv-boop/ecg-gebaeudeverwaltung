import { createHash } from 'node:crypto';

// Shared across Vercel instances; only an irreversible account-key digest is stored.
const identifier = (kind, email) => createHash('sha256')
  .update(`ecg:${kind}:${String(email).trim().toLowerCase()}`)
  .digest('hex');

export async function ensureAuthRateLimitSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS ecg_auth_rate_limits (
    id text PRIMARY KEY,
    attempts integer NOT NULL,
    window_start timestamptz NOT NULL DEFAULT now()
  )`;
}

// A failed login consumes one attempt; a successful login clears the bucket.
// The atomic UPSERT also handles concurrent serverless invocations.
export async function consumeAuthAttempt(sql, kind, email, maxAttempts, windowMinutes) {
  if (!email || email.length > 254) return false;
  const id = identifier(kind, email);
  const rows = await sql`INSERT INTO ecg_auth_rate_limits (id, attempts, window_start)
    VALUES (${id}, 1, now())
    ON CONFLICT (id) DO UPDATE SET
      attempts = CASE
        WHEN ecg_auth_rate_limits.window_start <= now() - (${windowMinutes}::integer * interval '1 minute')
        THEN 1 ELSE ecg_auth_rate_limits.attempts + 1 END,
      window_start = CASE
        WHEN ecg_auth_rate_limits.window_start <= now() - (${windowMinutes}::integer * interval '1 minute')
        THEN now() ELSE ecg_auth_rate_limits.window_start END
    RETURNING attempts`;
  return Number(rows[0]?.attempts) <= maxAttempts;
}

export async function clearAuthAttempts(sql, kind, email) {
  if (!email || email.length > 254) return;
  await sql`DELETE FROM ecg_auth_rate_limits WHERE id=${identifier(kind, email)}`;
}
