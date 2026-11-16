import {randomBytes} from 'node:crypto';
import {neon} from '../../lib/db.js';
import {ensureAuthSchema,tokenHash} from '../../lib/auth.js';
import {ensureAuthRateLimitSchema,consumeAuthAttempt} from '../../lib/auth-rate-limit.js';

const NEUTRAL_RESPONSE={ok:true,message:'Falls ein aktives Konto existiert, wurde eine E-Mail versendet.'};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Never derive reset links from Host or forwarding headers: those fields may
// be supplied by a client. Only the configured, HTTPS production URL is trusted.
export function resetBaseUrl(value){
  if(typeof value!=='string'||!value.trim())return null;
  try{
    const url=new URL(value.trim());
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash)return null;
    return url.href.replace(/\/$/,'');
  }catch{return null;}
}

export async function forgotPasswordWithDependencies(req,res,{sql,env=process.env,send=fetch,logger=console}={}){
  if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt'});
  const base=resetBaseUrl(env.PUBLIC_APP_URL);
  if(!base){
    logger.error('ECG Kennwort-Reset: PUBLIC_APP_URL fehlt oder ist keine gültige HTTPS-Adresse.');
    return res.status(200).json(NEUTRAL_RESPONSE);
  }
  const email=String(req.body?.email||'').trim().toLowerCase();
  if(!email||email.length>254)return res.status(200).json(NEUTRAL_RESPONSE);
  await ensureAuthSchema(sql);
  await ensureAuthRateLimitSchema(sql);
  if(!await consumeAuthAttempt(sql,'reset',email,3,60)){
    res.setHeader('Retry-After','3600');
    return res.status(429).json({error:'Zu viele Anfragen. Bitte später erneut versuchen.'});
  }
  const rows=await sql`SELECT id,email,name FROM ecg_app_users WHERE lower(email)=${email} AND active=true LIMIT 1`;
  if(rows[0]){
    if(!env.RESEND_API_KEY||!env.AUTH_FROM_EMAIL){
      logger.error('ECG Kennwort-Reset: E-Mail-Versand ist nicht konfiguriert.');
      return res.status(200).json(NEUTRAL_RESPONSE);
    }
    const token=randomBytes(32).toString('base64url');
    await sql`INSERT INTO ecg_password_resets(user_id,token_hash,expires_at) VALUES(${rows[0].id},${tokenHash(token)},now()+interval '30 minutes')`;
    const link=base+'/?reset='+encodeURIComponent(token);
    try{
      const r=await send('https://api.resend.com/emails',{
        method:'POST',
        headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},
        body:JSON.stringify({
          from:env.AUTH_FROM_EMAIL,to:[rows[0].email],
          subject:'ECG Gebäudeverwaltung – Kennwort zurücksetzen',
          html:`<p>Hallo ${escapeHtml(rows[0].name)},</p><p><a href="${link}">Kennwort zurücksetzen</a></p><p>Der Link gilt 30 Minuten.</p>`
        })
      });
      if(!r.ok)logger.error('ECG Kennwort-Reset: E-Mail-Dienst hat den Versand abgelehnt.');
    }catch{
      logger.error('ECG Kennwort-Reset: E-Mail-Dienst ist nicht erreichbar.');
    }
  }
  return res.status(200).json(NEUTRAL_RESPONSE);
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt'});
  if(!process.env.DATABASE_URL)return res.status(500).json({error:'DATABASE_URL fehlt'});
  return forgotPasswordWithDependencies(req,res,{
    sql:neon(process.env.DATABASE_URL),
    env:process.env,
    send:fetch,
    logger:console,
  });
}
