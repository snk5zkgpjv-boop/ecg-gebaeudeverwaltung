import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';

const AUTH_ORIGIN='https://ep-floral-math-au4tbbf1.neonauth.c-10.us-east-1.aws.neon.tech';
const JWKS=createRemoteJWKSet(new URL(`${AUTH_ORIGIN}/ecg_gebaeudeverwaltung/auth/.well-known/jwks.json`));

export async function ensureAuthSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS ecg_app_users(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), app_user_id text NOT NULL UNIQUE,
    email text NOT NULL, name text NOT NULL, password_hash text NOT NULL,
    must_change_password boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS ecg_app_users_email_lower_uq ON ecg_app_users((lower(email)))`;
  await sql`CREATE TABLE IF NOT EXISTS ecg_app_sessions(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES ecg_app_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS ecg_password_resets(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES ecg_app_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
}

export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`}
export function verifyPassword(password,stored){try{const[alg,salt,digest]=String(stored).split('$');if(alg!=='scrypt'||!salt||!digest)return false;const a=scryptSync(password,salt,64),b=Buffer.from(digest,'hex');return a.length===b.length&&timingSafeEqual(a,b)}catch{return false}}
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}

export async function sessionUser(req,sql){
  await ensureAuthSchema(sql);const token=cookies(req).ecg_session;if(!token)return null;
  const rows=await sql`SELECT u.id,u.app_user_id,u.email,u.name,u.must_change_password,u.active
    FROM ecg_app_sessions s JOIN ecg_app_users u ON u.id=s.user_id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND u.active=true LIMIT 1`;
  return rows[0]||null;
}
export async function createSession(res,sql,userId){
  const token=randomBytes(32).toString('base64url');await sql`INSERT INTO ecg_app_sessions(user_id,token_hash,expires_at) VALUES(${userId},${tokenHash(token)},now()+interval '30 days')`;
  res.setHeader('Set-Cookie',`ecg_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
}
export function clearSession(res){res.setHeader('Set-Cookie','ecg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')}
export async function legacyJwtUser(req,sql){
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;
  try{const{payload}=await jwtVerify(h.slice(7),JWKS,{issuer:AUTH_ORIGIN,audience:AUTH_ORIGIN});if(!payload.sub)return null;const rows=await sql`SELECT id,email,name,role,banned FROM neon_auth."user" WHERE id=${String(payload.sub)} LIMIT 1`;return rows[0]&&!rows[0].banned?rows[0]:null}catch{return null}
}
export async function appState(sql){const rows=await sql`SELECT data FROM app_state WHERE id='main' LIMIT 1`;return rows[0]?.data||{}}
export function profileFor(state,user){return(state.users||[]).find(x=>x.id===user?.app_user_id||(x.email||'').trim().toLowerCase()===(user?.email||'').trim().toLowerCase())||null}
export function publicUser(user,profile){return{id:user.id,appUserId:profile?.id||user.app_user_id,email:user.email,name:profile?.name||user.name,role:profile?.role||'cleaner',permissions:profile?.permissions||{},mustChangePassword:!!user.must_change_password}}
export async function requireUser(req,res,sql){const user=await sessionUser(req,sql);if(!user){res.status(401).json({error:'Anmeldung erforderlich'});return null}const state=await appState(sql),profile=profileFor(state,user);if(!profile||profile.active===false){res.status(403).json({error:'Benutzer ist nicht freigeschaltet'});return null}return{user,state,profile}}
