import {randomBytes,scryptSync,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';

// Legacy Neon Auth JWT support is separate from the ECG-owned account/session tables.
// Region-specific origin may be changed only together with the validated target Auth deployment.
const AUTH_ORIGIN=(process.env.NEON_AUTH_ORIGIN||'https://ep-floral-math-au4tbbf1.neonauth.c-10.us-east-1.aws.neon.tech').replace(/\/+$/,'');
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

// Bind sessions to the credential verified at login. Password updates invalidate
// even an in-flight login that inserts its session after a concurrent revocation.
function sessionSignature(passwordHash,userId,nonce){
  return createHmac('sha256',passwordHash).update(`ecg-session:v1:${userId}:${nonce}`).digest('base64url');
}
export async function sessionUser(req,sql){
  let token;
  try{token=cookies(req).ecg_session;}catch{return null;}
  const match=/^v1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token||'');
  if(!match)return null; // Unbound legacy cookies require a fresh login.
  try{
    const rows=await sql`SELECT u.id,u.app_user_id,u.email,u.name,u.must_change_password,u.active,u.password_hash
      FROM ecg_app_sessions s JOIN ecg_app_users u ON u.id=s.user_id
      WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND u.active=true LIMIT 1`;
    const user=rows[0];
    if(!user?.password_hash || user.active!==true)return null;
    const expected=sessionSignature(user.password_hash,user.id,match[1]);
    if(!timingSafeEqual(Buffer.from(match[2]),Buffer.from(expected)))return null;
    const {password_hash,...safeUser}=user;
    return safeUser;
  }catch(error){if(error.code==='42P01')return null;throw error;}
}
export async function createSession(res,sql,userId,verifiedPasswordHash){
  if(!verifiedPasswordHash)return false;
  const nonce=randomBytes(32).toString('base64url');
  const token=`v1.${nonce}.${sessionSignature(verifiedPasswordHash,userId,nonce)}`;
  const rows=await sql`INSERT INTO ecg_app_sessions(user_id,token_hash,expires_at)
    SELECT id,${tokenHash(token)},now()+interval '30 days' FROM ecg_app_users
    WHERE id=${userId} AND active=true AND password_hash=${verifiedPasswordHash} RETURNING id`;
  if(!rows[0])return false;
  res.setHeader('Set-Cookie',`ecg_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
  return true;
}
export function clearSession(res){res.setHeader('Set-Cookie','ecg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')}
export async function legacyJwtUser(req,sql){
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;
  try{const{payload}=await jwtVerify(h.slice(7),JWKS,{issuer:AUTH_ORIGIN,audience:AUTH_ORIGIN});if(!payload.sub)return null;const rows=await sql`SELECT id,email,name,role,banned FROM neon_auth."user" WHERE id=${String(payload.sub)} LIMIT 1`;return rows[0]&&!rows[0].banned?rows[0]:null}catch{return null}
}
export async function appState(sql){const rows=await sql`SELECT data FROM app_state WHERE id='main' LIMIT 1`;return rows[0]?.data||{}}
export function profileFor(state,user){
  // A session is bound to one immutable profile ID, never to the first email match.
  if(!user?.app_user_id)return null;
  const matches=(state.users||[]).filter(x=>x.id===user.app_user_id);
  return matches.length===1?matches[0]:null;
}
export function publicUser(user,profile){return{id:user.id,appUserId:profile?.id||user.app_user_id,email:user.email,name:profile?.name||user.name,role:profile?.role||'cleaner',permissions:profile?.permissions||{},mustChangePassword:!!user.must_change_password}}
export async function requireUser(req,res,sql){const user=await sessionUser(req,sql);if(!user){res.status(401).json({error:'Anmeldung erforderlich'});return null}if(user.must_change_password){res.status(403).json({error:'Bitte zuerst das vorläufige Kennwort ändern.',code:'PASSWORD_CHANGE_REQUIRED'});return null}const state=await appState(sql),profile=profileFor(state,user);if(!profile||profile.active===false){res.status(403).json({error:'Benutzer ist nicht freigeschaltet'});return null}if(req.headers['x-ecg-user-id']&&req.headers['x-ecg-user-id']!==profile.id){res.status(409).json({error:'Das angemeldete Konto wurde in einem anderen Fenster gewechselt. Bitte neu anmelden.'});return null}if(profile.role==='member'){res.status(403).json({error:'Nur für den Gebäudedienst freigegeben'});return null}return{user,state,profile}}
