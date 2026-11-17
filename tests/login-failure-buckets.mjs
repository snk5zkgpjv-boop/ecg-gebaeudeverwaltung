import {readFileSync as readCanonicalSchema} from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { hashPassword, tokenHash } from '../lib/auth.js';
import { loginWithSql } from '../api/auth/login.js';
import { resetPasswordWithSql } from '../api/auth/reset-password.js';
import {
  clientIpFromRequest,
  pruneExpiredAuthAttempts,
} from '../lib/auth-rate-limit.js';

const db=new PGlite();
const observedSql=[];
const sql=async(strings,...values)=>{
 let query=strings[0];
 for(let i=0;i<values.length;i++)query+='
};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(data){this.body=data;return this}});
const email='fixture@example.test';
const original='synthetic-correct-password';
const replacement='synthetic-new-password';
const req=(ip,password,account=email)=>({method:'POST',headers:{'x-forwarded-for':ip+', 198.51.100.44'},body:{email:account,password}});
async function signIn(ip,password,account=email){const res=response();await loginWithSql(req(ip,password,account),res,sql);return res;}
try{
 await db.exec(readCanonicalSchema(new URL('../scripts/schema.sql',import.meta.url),'utf8'));
 
 const hash=hashPassword(original);
 const users=await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active) VALUES ('fixture-admin',${email},'Synthetic',${hash},false,true) RETURNING id`;
 const userId=users[0].id;
 await sql`INSERT INTO app_state(id,data) VALUES('main',${JSON.stringify({users:[{id:'fixture-admin',name:'Synthetic',role:'admin',active:true}]})}::jsonb)`;
 assert.equal(clientIpFromRequest({headers:{'x-forwarded-for':' 203.0.113.1 , 203.0.113.2','x-real-ip':'198.51.100.1'}}),'203.0.113.1');
 assert.equal(clientIpFromRequest({headers:{'x-real-ip':'198.51.100.1'}}),'198.51.100.1');
 assert.equal(clientIpFromRequest({headers:{}}),'unknown');

 observedSql.length=0;
 for(let i=0;i<5;i++)assert.equal((await signIn('203.0.113.10','wrong-password')).code,401);
 assert.equal(observedSql.filter(query=>/^\s*(?:CREATE|ALTER|DROP)\b/i.test(query)).length,0,
   'real login handler must not execute schema DDL');
 const blocked=await signIn('203.0.113.10','wrong-password');
 assert.equal(blocked.code,429,'sixth failure from same IP is throttled');
 assert.equal(blocked.headers['Retry-After'],'900');
 const otherIp=await signIn('203.0.113.11',original);
 assert.equal(otherIp.code,200,'correct password from another IP still works');
 assert.ok(otherIp.headers['Set-Cookie'],'valid login must issue a session');
 assert.equal((await signIn('203.0.113.10','wrong-password')).code,401,'successful login clears all old counters');
 assert.equal((await signIn('203.0.113.11',original)).code,200,'clear the one new failure before checking the independent global threshold');

 for(let i=0;i<30;i++){
  const result=await signIn('198.51.100.'+(i+1),'invalid-password');
  assert.equal(result.code,401,'failure '+(i+1)+' from distinct IP is within global allowance');
 }
 assert.equal((await signIn('198.51.100.40','invalid-password')).code,429,'31st failure is globally blocked');
 // No attacker who knows only the address can deny a real owner a valid login.
 assert.equal((await signIn('198.51.100.41',original)).code,200,
   'correct password remains usable even when global failures were saturated');

 // Recreate an all-IP block, then prove reset clears *every* login bucket.
 for(let i=0;i<31;i++)await signIn('192.0.2.'+(i+1),'wrong-password');
 assert.equal((await signIn('192.0.2.50','wrong-password')).code,429);
 const resetToken='only-synthetic-reset-token';
 await sql`INSERT INTO ecg_password_resets(user_id,token_hash,expires_at) VALUES(${userId},${tokenHash(resetToken)},now()+interval '1 hour')`;
 let r=response();
 await resetPasswordWithSql({method:'POST',body:{token:resetToken,newPassword:replacement}},r,sql);
 assert.equal(r.code,200,'real password reset handler succeeds');
 assert.equal((await signIn('192.0.2.1','wrong-password')).code,401,
   'old per-IP block is removed after password reset');
 assert.equal((await signIn('192.0.2.50',replacement)).code,200,
   'new credential works immediately after reset');
 assert.equal((await signIn('192.0.2.50',original)).code,401,'old credential no longer works');

 // Unknown addresses always trigger the same scrypt verification, and
 // respond without disclosing whether an account exists.
 const nonexistent=await signIn('203.0.113.55','wrong-password','absent@example.test');
 assert.equal(nonexistent.code,401);
 assert.equal(nonexistent.body.error,'E-Mail-Adresse oder Kennwort ist falsch.');

 await sql`INSERT INTO ecg_auth_rate_limits(id,attempts,window_start) VALUES('synthetic-expired-record',2,now()-interval '25 hours')`;
 await pruneExpiredAuthAttempts(sql);
 const old=await sql`SELECT id FROM ecg_auth_rate_limits WHERE id='synthetic-expired-record'`;
 assert.equal(old.length,0,'records older than 24 hours are removed');

 console.log('PASS: real login and reset handlers on isolated PostgreSQL engine, per-IP and global bounds, correct credentials immune to remote failures, password reset clearance, dummy verification and 24h pruning.');
}finally{await db.close();}
+(i+1)+strings[i+1];
 observedSql.push(query);
 return (await db.query(query,values)).rows;
};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(data){this.body=data;return this}});
const email='fixture@example.test';
const original='synthetic-correct-password';
const replacement='synthetic-new-password';
const req=(ip,password,account=email)=>({method:'POST',headers:{'x-forwarded-for':ip+', 198.51.100.44'},body:{email:account,password}});
async function signIn(ip,password,account=email){const res=response();await loginWithSql(req(ip,password,account),res,sql);return res;}
try{
 await db.exec(readCanonicalSchema(new URL('../scripts/schema.sql',import.meta.url),'utf8'));
 
 const hash=hashPassword(original);
 const users=await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active) VALUES ('fixture-admin',${email},'Synthetic',${hash},false,true) RETURNING id`;
 const userId=users[0].id;
 await sql`INSERT INTO app_state(id,data) VALUES('main',${JSON.stringify({users:[{id:'fixture-admin',name:'Synthetic',role:'admin',active:true}]})}::jsonb)`;
 assert.equal(clientIpFromRequest({headers:{'x-forwarded-for':' 203.0.113.1 , 203.0.113.2','x-real-ip':'198.51.100.1'}}),'203.0.113.1');
 assert.equal(clientIpFromRequest({headers:{'x-real-ip':'198.51.100.1'}}),'198.51.100.1');
 assert.equal(clientIpFromRequest({headers:{}}),'unknown');

 for(let i=0;i<5;i++)assert.equal((await signIn('203.0.113.10','wrong-password')).code,401);
 const blocked=await signIn('203.0.113.10','wrong-password');
 assert.equal(blocked.code,429,'sixth failure from same IP is throttled');
 assert.equal(blocked.headers['Retry-After'],'900');
 const otherIp=await signIn('203.0.113.11',original);
 assert.equal(otherIp.code,200,'correct password from another IP still works');
 assert.ok(otherIp.headers['Set-Cookie'],'valid login must issue a session');
 assert.equal((await signIn('203.0.113.10','wrong-password')).code,401,'successful login clears all old counters');
 assert.equal((await signIn('203.0.113.11',original)).code,200,'clear the one new failure before checking the independent global threshold');

 for(let i=0;i<30;i++){
  const result=await signIn('198.51.100.'+(i+1),'invalid-password');
  assert.equal(result.code,401,'failure '+(i+1)+' from distinct IP is within global allowance');
 }
 assert.equal((await signIn('198.51.100.40','invalid-password')).code,429,'31st failure is globally blocked');
 // No attacker who knows only the address can deny a real owner a valid login.
 assert.equal((await signIn('198.51.100.41',original)).code,200,
   'correct password remains usable even when global failures were saturated');

 // Recreate an all-IP block, then prove reset clears *every* login bucket.
 for(let i=0;i<31;i++)await signIn('192.0.2.'+(i+1),'wrong-password');
 assert.equal((await signIn('192.0.2.50','wrong-password')).code,429);
 const resetToken='only-synthetic-reset-token';
 await sql`INSERT INTO ecg_password_resets(user_id,token_hash,expires_at) VALUES(${userId},${tokenHash(resetToken)},now()+interval '1 hour')`;
 let r=response();
 await resetPasswordWithSql({method:'POST',body:{token:resetToken,newPassword:replacement}},r,sql);
 assert.equal(r.code,200,'real password reset handler succeeds');
 assert.equal((await signIn('192.0.2.1','wrong-password')).code,401,
   'old per-IP block is removed after password reset');
 assert.equal((await signIn('192.0.2.50',replacement)).code,200,
   'new credential works immediately after reset');
 assert.equal((await signIn('192.0.2.50',original)).code,401,'old credential no longer works');

 // Unknown addresses always trigger the same scrypt verification, and
 // respond without disclosing whether an account exists.
 const nonexistent=await signIn('203.0.113.55','wrong-password','absent@example.test');
 assert.equal(nonexistent.code,401);
 assert.equal(nonexistent.body.error,'E-Mail-Adresse oder Kennwort ist falsch.');

 await sql`INSERT INTO ecg_auth_rate_limits(id,attempts,window_start) VALUES('synthetic-expired-record',2,now()-interval '25 hours')`;
 await pruneExpiredAuthAttempts(sql);
 const old=await sql`SELECT id FROM ecg_auth_rate_limits WHERE id='synthetic-expired-record'`;
 assert.equal(old.length,0,'records older than 24 hours are removed');

 console.log('PASS: real login and reset handlers on isolated PostgreSQL engine, per-IP and global bounds, correct credentials immune to remote failures, password reset clearance, dummy verification and 24h pruning.');
}finally{await db.close();}
