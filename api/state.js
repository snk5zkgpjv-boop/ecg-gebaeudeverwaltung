import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_ORIGIN = 'https://ep-floral-math-au4tbbf1.neonauth.c-10.us-east-1.aws.neon.tech';
const JWKS = createRemoteJWKSet(new URL('https://ep-floral-math-au4tbbf1.neonauth.c-10.us-east-1.aws.neon.tech/ecg_gebaeudeverwaltung/auth/.well-known/jwks.json'));

async function authenticatedUser(req, sql) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const { payload } = await jwtVerify(h.slice(7), JWKS, { issuer: AUTH_ORIGIN, audience: AUTH_ORIGIN });
    if (!payload.sub) return null;
    const rows = await sql`SELECT id, email, name, role, banned FROM neon_auth."user" WHERE id = ${String(payload.sub)} LIMIT 1`;
    const user = rows[0];
    if (!user || user.banned) return null;
    return user;
  } catch (e) {
    console.error('auth verify error', e?.code || e?.message || e);
    return null;
  }
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });
  const sql = neon(process.env.DATABASE_URL);
  const user = await authenticatedUser(req, sql);
  if (!user) return res.status(401).json({ error: 'Anmeldung erforderlich' });

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT data, revision, updated_at FROM app_state WHERE id = 'main' LIMIT 1`;
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Kein App-Zustand vorhanden' });
      return res.status(200).json(row.data || {});
    }
    if (req.method === 'PUT') {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Ungültige Daten' });
      const payload = JSON.stringify(req.body);
      const rows = await sql`UPDATE app_state SET data = ${payload}::jsonb, revision = revision + 1, updated_at = now() WHERE id = 'main' RETURNING revision, updated_at`;
      // Nur die Zeiten der ausdrücklich konfigurierten Person an die private
      // Organisationszentrale spiegeln. Fehler blockieren das ECG-Speichern nicht.
      const syncUrl = process.env.ORGANIZATION_API_URL;
      const syncToken = process.env.ORGANIZATION_SYNC_TOKEN;
      const syncEmail = (process.env.ORGANIZATION_SYNC_USER_EMAIL || '').trim().toLowerCase();
      if (syncUrl && syncToken && syncEmail) {
        const matchedUsers = (req.body.users || []).filter(u => (u.email || '').trim().toLowerCase() === syncEmail);
        const ids = new Set(matchedUsers.map(u => u.id));
        const entries = (req.body.timeEntries || []).filter(e => ids.has(e.userId));
        await fetch(`${syncUrl.replace(/\/$/, '')}/api/organization/ecg-sync`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${syncToken}` }, body: JSON.stringify({ entries })
        }).catch(error => console.error('organization sync error', error?.message || error));
      }
      return res.status(200).json({ ok: true, ...rows[0] });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (error) {
    console.error('state api error', error);
    return res.status(500).json({ error: 'Datenbankfehler' });
  }
}
