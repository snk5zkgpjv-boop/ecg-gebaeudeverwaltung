import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL fehlt' });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT data, revision, updated_at
        FROM app_state
        WHERE id = 'main'
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Kein App-Zustand vorhanden' });
      return res.status(200).json(row.data || {});
    }

    if (req.method === 'PUT') {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Ungültige Daten' });
      }
      const payload = JSON.stringify(req.body);
      const rows = await sql`
        UPDATE app_state
        SET data = ${payload}::jsonb,
            revision = revision + 1,
            updated_at = now()
        WHERE id = 'main'
        RETURNING revision, updated_at
      `;
      return res.status(200).json({ ok: true, ...rows[0] });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (error) {
    console.error('state api error', error);
    return res.status(500).json({ error: 'Datenbankfehler' });
  }
}
