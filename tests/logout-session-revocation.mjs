import {readFileSync as readCanonicalSchema} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createSession,hashPassword,tokenHash} from '../lib/auth.js';
import logoutHandler,{logoutWithSql} from '../api/auth/logout.js';
import {sessionWithSql} from '../api/auth/session.js';

const db=new PGlite();
const sql=async(strings,...values)=>{
  let query=strings[0];
  for(let i=0;i<values.length;i++)query+='$'+(i+1)+strings[i+1];
  return (await db.query(query,values)).rows;
};
const response=()=>({
  code:200,headers:{},
  setHeader(key,value){this.headers[key]=value},
  status(code){this.code=code;return this},
  json(body){this.body=body;return this}
});
const request=(method,cookie='')=>({method,headers:{cookie}});
const issuedCookie=res=>res.headers['Set-Cookie'].split(';')[0];

try {
  await db.exec(readCanonicalSchema(new URL('../scripts/schema.sql',import.meta.url),'utf8'));
  const passwordHash=hashPassword('synthetic-only-password');
  const email='session-fixture@example.test';
  const [user]=await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active)
    VALUES('fixture-profile',${email},'Synthetic Test',${passwordHash},false,true) RETURNING id`;
  await sql`INSERT INTO app_state(id,data) VALUES('main',${JSON.stringify({users:[{id:'fixture-profile',role:'admin',active:true,name:'Synthetic Test'}]})}::jsonb)`;

  // Real session issuing function: equivalent to a successful credential login.
  const loginResponse=response();
  assert.equal(await createSession(loginResponse,sql,user.id,passwordHash),true);
  const savedCookie=issuedCookie(loginResponse);
  assert.match(savedCookie,/^ecg_session=v1\./);
  const liveToken=decodeURIComponent(savedCookie.slice('ecg_session='.length));
  const before=response();
  await sessionWithSql(request('GET',savedCookie),before,sql);
  assert.equal(before.code,200,'session route accepts the login cookie before logout');
  assert.equal(before.body.user.appUserId,'fixture-profile');

  // Revoke *exactly* the saved session, not all sessions for this user.
  const otherLogin=response();
  assert.equal(await createSession(otherLogin,sql,user.id,passwordHash),true);
  const anotherCookie=issuedCookie(otherLogin);
  const logoutResponse=response();
  await logoutWithSql(request('POST',savedCookie),logoutResponse,sql);
  assert.equal(logoutResponse.code,200,'logout succeeds');
  assert.match(logoutResponse.headers['Set-Cookie'],/Max-Age=0/,'browser cookie is expired');
  const rows=await sql`SELECT token_hash FROM ecg_app_sessions WHERE token_hash=${tokenHash(liveToken)}`;
  assert.equal(rows.length,0,'session row has been deleted');

  const after=response();
  await sessionWithSql(request('GET',savedCookie),after,sql);
  assert.equal(after.code,401,'old saved cookie is rejected after logout');
  const otherSession=response();
  await sessionWithSql(request('GET',anotherCookie),otherSession,sql);
  assert.equal(otherSession.code,200,'other devices retain their active session');

  // Exercise the default HTTP handler without a cookie, without a database URL.
  const noCookie=response();
  await logoutHandler(request('POST'),noCookie);
  assert.equal(noCookie.code,200);
  assert.equal(noCookie.body.ok,true);
  assert.match(noCookie.headers['Set-Cookie'],/Max-Age=0/);

  const wrongMethod=response();
  await logoutHandler(request('GET'),wrongMethod);
  assert.equal(wrongMethod.code,405,'only POST may log out');

  const expiredAgain=response();
  await logoutWithSql(request('POST',savedCookie),expiredAgain,sql);
  assert.equal(expiredAgain.code,200,'logout is idempotent even when session row is gone');
  console.log('PASS: real session-issuing function, logout and session endpoint on synthetic PostgreSQL; saved cookie 200 -> logout -> 401, another session remains valid, cookie-less POST returns 200.');
} finally {
  await db.close();
}
