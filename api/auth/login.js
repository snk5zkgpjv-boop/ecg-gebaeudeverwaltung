import { neon } from '../../lib/db.js';
import {
  ensureAuthSchema, verifyPassword, hashPassword, createSession,
  appState, profileFor, publicUser,
} from '../../lib/auth.js';
import {
  ensureAuthRateLimitSchema, consumeAuthAttempt, clearLoginAttempts,
  clientIpFromRequest,
} from '../../lib/auth-rate-limit.js';

// The same scrypt verification is performed for non-existent and inactive
// accounts; timing must not disclose whether an address has a credential.
const DUMMY_PASSWORD_HASH = hashPassword('no-account-matches-this-credential');

export async function loginWithSql(req, res, sql) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || email.length > 254) {
    return res.status(401).json({ error: 'E-Mail-Adresse oder Kennwort ist falsch.' });
  }

  await ensureAuthSchema(sql);
  await ensureAuthRateLimitSchema(sql);
  const rows = await sql`SELECT * FROM ecg_app_users WHERE lower(email)=${email} AND active=true LIMIT 1`;
  const user = rows[0];
  const passwordMatches = verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    // Count only failed credentials. A valid password must remain usable even
    // if a third party has saturated either of the failure-only buckets.
    const clientIp = clientIpFromRequest(req);
    const [localAllowed, globalAllowed] = await Promise.all([
      consumeAuthAttempt(sql, 'login-ip', email, 5, 15, clientIp),
      consumeAuthAttempt(sql, 'login-global', email, 30, 15),
    ]);
    if (!localAllowed || !globalAllowed) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' });
    }
    return res.status(401).json({ error: 'E-Mail-Adresse oder Kennwort ist falsch.' });
  }

  const state = await appState(sql, { usersOnly: true });
  const profile = profileFor(state, user);
  if (!profile || profile.active === false) {
    return res.status(403).json({ error: 'Dieses Konto ist nicht freigeschaltet.' });
  }

  if (!await createSession(res, sql, user.id, user.password_hash)) {
    return res.status(401).json({ error: 'Der Zugang wurde zwischenzeitlich geändert. Bitte erneut anmelden.' });
  }

  await clearLoginAttempts(sql, email);
  return res.status(200).json({ ok: true, user: publicUser(user, profile) });
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });
  return loginWithSql(req, res, neon(process.env.DATABASE_URL));
}
