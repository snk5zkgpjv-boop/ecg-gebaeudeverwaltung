import { createHash, randomInt } from 'node:crypto';

// All persisted bucket identifiers are digests, never raw email or IP.
const digest = value => createHash('sha256').update(value).digest('hex');
const normalizedEmail = value => String(value || '').trim().toLowerCase();
const identifier = (kind, email, clientIp = '') =>
  digest(`ecg:${kind}:${normalizedEmail(email)}${kind === 'login-ip' ? ':' + clientIp : ''}`);
const accountIdentifier = email => digest(`ecg:account:${normalizedEmail(email)}`);

// x-forwarded-for is trustworthy only behind a trusted reverse proxy which
// strips or overwrites user-supplied forwarding headers. Without that trust,
// callers could choose arbitrary IP buckets and bypass per-IP limits.
export function clientIpFromRequest(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  if (first) return first;
  const real = req.headers?.['x-real-ip'];
  return String(Array.isArray(real) ? real[0] : real || '').trim() || 'unknown';
}

export async function ensureAuthRateLimitSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS ecg_auth_rate_limits (
    id text PRIMARY KEY,
    attempts integer NOT NULL,
    window_start timestamptz NOT NULL DEFAULT now(),
    account_id text
  )`;
  await sql`ALTER TABLE ecg_auth_rate_limits ADD COLUMN IF NOT EXISTS account_id text`;
  await sql`CREATE INDEX IF NOT EXISTS ecg_auth_rate_limits_account_id_idx ON ecg_auth_rate_limits(account_id)`;
}

export async function pruneExpiredAuthAttempts(sql) {
  await sql`DELETE FROM ecg_auth_rate_limits WHERE window_start < now() - interval '24 hours'`;
}

// Atomic failure reservation across serverless instances. Call this ONLY
// after verifying an incorrect password; valid credentials must never be
// blocked by failures submitted by another client.
export async function consumeAuthAttempt(sql, kind, email, maxAttempts, windowMinutes, ip = '') {
  email = normalizedEmail(email);
  if (!email || email.length > 254) return false;
  // Opportunistic cleanup rather than an extra DELETE on every request.
  if (randomInt(16) === 0) await pruneExpiredAuthAttempts(sql);
  const accountId = kind === 'login-ip' || kind === 'login-global' ? accountIdentifier(email) : null;
  const id = identifier(kind, email, kind === 'login-ip' ? ip : '');
  const rows = await sql`INSERT INTO ecg_auth_rate_limits (id, attempts, window_start, account_id)
    VALUES (${id}, 1, now(), ${accountId})
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
  email = normalizedEmail(email);
  if (!email || email.length > 254) return;
  await sql`DELETE FROM ecg_auth_rate_limits WHERE id=${identifier(kind, email)}`;
}

// Clear every per-IP and global login bucket for a credential after a successful
// password reset or new temporary password; the account digest permits this
// without storing any plaintext email/IP and without touching reset buckets.
export async function clearLoginAttempts(sql, email) {
  email = normalizedEmail(email);
  if (!email || email.length > 254) return;
  const accountId = accountIdentifier(email);
  // Also remove the pre-migration one-bucket login rate limit.
  const oldId = digest(`ecg:login:${email}`);
  await sql`DELETE FROM ecg_auth_rate_limits WHERE account_id=${accountId} OR id=${oldId}`;
}
