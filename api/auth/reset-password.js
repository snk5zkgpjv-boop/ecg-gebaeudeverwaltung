import {neon} from '@neondatabase/serverless';
import {ensureAuthSchema,tokenHash,hashPassword} from '../../lib/auth.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt'});
  if(!process.env.DATABASE_URL)return res.status(500).json({error:'DATABASE_URL fehlt'});
  const token=String(req.body?.token||''),pw=String(req.body?.newPassword||'');
  if(pw.length<10)return res.status(400).json({error:'Das Kennwort muss mindestens 10 Zeichen haben.'});
  const sql=neon(process.env.DATABASE_URL);
  await ensureAuthSchema(sql);
  // One statement claims the token, changes the password and revokes sessions.
  // A concurrent request waits on the token row and rechecks used_at afterwards.
  const rows=await sql`WITH claimed AS (
    UPDATE ecg_password_resets SET used_at=now()
    WHERE token_hash=${tokenHash(token)} AND used_at IS NULL AND expires_at>now()
    RETURNING user_id
  ), changed AS (
    UPDATE ecg_app_users SET password_hash=${hashPassword(pw)},must_change_password=false,updated_at=now()
    WHERE id IN (SELECT user_id FROM claimed) RETURNING id
  ), revoked AS (
    DELETE FROM ecg_app_sessions WHERE user_id IN (SELECT id FROM changed)
  ) SELECT id FROM changed`;
  if(!rows[0])return res.status(400).json({error:'Der Link ist ungültig oder abgelaufen.'});
  return res.status(200).json({ok:true});
}
