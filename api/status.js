import { neon } from '@neondatabase/serverless';
import { requireUser } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });
  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireUser(req, res, sql);
  if (!auth) return;
  if (auth.profile.role !== 'admin') return res.status(403).json({ error: 'Nur für Administratoren.' });

  return res.status(200).json({
    database: true,
    passwordLogin: true,
    ai: Boolean(process.env.OPENAI_API_KEY),
    passwordResetEmail: Boolean(process.env.RESEND_API_KEY && process.env.AUTH_FROM_EMAIL),
    calendar: Boolean(process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_CALENDAR_API_KEY),
    organizationSync: Boolean(
      process.env.ORGANIZATION_API_URL
      && process.env.ORGANIZATION_SYNC_TOKEN
      && process.env.ORGANIZATION_SYNC_USER_EMAIL
    ),
  });
}
