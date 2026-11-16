import {neon} from '../../lib/db.js';
import {clearSession,tokenHash} from '../../lib/auth.js';

// Only revoke the session whose HttpOnly cookie is presented. No account-wide
// deletion: logging out one device must leave other devices signed in.
function sessionCookie(req) {
  const cookie=String(req.headers?.cookie||'');
  const pair=cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('ecg_session='));
  if(!pair)return null;
  try{return decodeURIComponent(pair.slice('ecg_session='.length))||null;}
  catch{return null;}
}

export async function logoutWithSql(req,res,sql) {
  const token=sessionCookie(req);
  if(token) {
    // Database failure must not be reported as a successful revocation.
    await sql`DELETE FROM ecg_app_sessions WHERE token_hash=${tokenHash(token)}`;
  }
  clearSession(res);
  return res.status(200).json({ok:true});
}

export default async function handler(req,res) {
  if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt'});
  if(!sessionCookie(req)) {
    clearSession(res);
    return res.status(200).json({ok:true});
  }
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Abmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.'});
  try {
    return await logoutWithSql(req,res,neon(process.env.DATABASE_URL));
  }catch {
    return res.status(503).json({error:'Abmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.'});
  }
}
