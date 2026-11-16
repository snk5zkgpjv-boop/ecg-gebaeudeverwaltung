import { neon } from '../../lib/db.js';
import {
  ensureAuthSchema, verifyPassword, createSession, appState, profileFor, publicUser,
} from '../../lib/auth.js';
import {
  ensureAuthRateLimitSchema, consumeAuthAttempt, clearAuthAttempts,
} from '../../lib/auth-rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });

  const sql = neon(process.env.DATABASE_URL);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || email.length > 254) {
    return res.status(401).json({ error: 'E-Mail-Adresse oder Kennwort ist falsch.' });
  }

  await ensureAuthSchema(sql);
  await ensureAuthRateLimitSchema(sql);

  // Reserve the attempt atomically before verifying, so concurrent requests
  // cannot bypass the five-attempt limit. Successful login clears its bucket.
  if (!await consumeAuthAttempt(sql, 'login', email, 5, 15)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' });
  }

  const rows = await sql`SELECT * FROM ecg_app_users WHERE lower(email)=${email} AND active=true LIMIT 1`;
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
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

  await clearAuthAttempts(sql, 'login', email);
  return res.status(200).json({ ok: true, user: publicUser(user, profile) });
}
