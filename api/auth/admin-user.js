import { neon } from '@neondatabase/serverless';
import { ensureAuthSchema, hashPassword, requireUser } from '../../lib/auth.js';

function canManageUsers(profile) {
  return profile.role === 'admin' || profile.permissions?.manageUsers === true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireUser(req, res, sql);
  if (!auth) return;
  if (!canManageUsers(auth.profile)) {
    return res.status(403).json({ error: 'Die Benutzerverwaltung ist für dieses Konto nicht freigeschaltet.' });
  }

  const id = String(req.body?.appUserId || '');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.temporaryPassword || '');
  const active = req.body?.active !== false;
  const profile = (auth.state.users || []).find((user) => user.id === id);
  if (!profile || profile.email?.toLowerCase() !== email) {
    return res.status(400).json({ error: 'Benutzerprofil zuerst speichern.' });
  }

  await ensureAuthSchema(sql);
  const rows = await sql`SELECT id FROM ecg_app_users WHERE app_user_id=${id} OR lower(email)=${email} LIMIT 1`;
  if (rows[0]) {
    if (password && password.length < 10) {
      return res.status(400).json({ error: 'Das vorläufige Kennwort muss mindestens 10 Zeichen haben.' });
    }
    if (password) {
      await sql`UPDATE ecg_app_users SET app_user_id=${id},email=${email},name=${name},password_hash=${hashPassword(password)},must_change_password=true,active=${active},updated_at=now() WHERE id=${rows[0].id}`;
    } else {
      await sql`UPDATE ecg_app_users SET app_user_id=${id},email=${email},name=${name},active=${active},updated_at=now() WHERE id=${rows[0].id}`;
    }
    if (!active) await sql`DELETE FROM ecg_app_sessions WHERE user_id=${rows[0].id}`;
    return res.status(200).json({ ok: true });
  }

  if (password.length < 10) {
    return res.status(400).json({ error: 'Für neue Benutzer ist ein vorläufiges Kennwort mit mindestens 10 Zeichen nötig.' });
  }
  await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active) VALUES(${id},${email},${name},${hashPassword(password)},true,${active})`;
  return res.status(201).json({ ok: true });
}
