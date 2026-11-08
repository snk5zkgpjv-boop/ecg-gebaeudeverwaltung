import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createSession,sessionUser,hashPassword,tokenHash} from '../lib/auth.js';

const oldHash=hashPassword('synthetic-old-password');
const newHash=hashPassword('synthetic-new-password');
let user={id:'synthetic-login',app_user_id:'synthetic-profile',email:'synthetic@example.test',name:'Synthetic',active:true,must_change_password:false,password_hash:oldHash};
const sessions=new Map();
let changeAfterInsert=false;
const sql=async(parts,...values)=>{
 const query=parts.join('?');
 if(query.startsWith('INSERT')){
  const [hash,id,credential]=values;
  if(user.id!==id||!user.active||user.password_hash!==credential)return [];
  sessions.set(hash,{user_id:id});
  if(changeAfterInsert)user.password_hash=newHash;
  return [{id:'synthetic-session'}];
 }
 if(query.includes('FROM ecg_app_sessions'))return sessions.has(values[0])&&user.active?[{...user}]:[];
 throw new Error('Unexpected synthetic query');
};
const response=()=>({headers:{},code:200,setHeader(key,value){this.headers[key]=value},status(code){this.code=code;return this},json(body){this.body=body;return this}});
const cookie=res=>res.headers['Set-Cookie'].split(';')[0];
const request=res=>({headers:{cookie:cookie(res)}});
let res=response();assert.equal(await createSession(res,sql,user.id,oldHash),true);
assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
assert.match(cookie(res),/^ecg_session=v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
let authenticated=await sessionUser(request(res),sql);assert.equal(authenticated.id,user.id);assert.equal(Object.hasOwn(authenticated,'password_hash'),false,'credential hash must not escape helper');
user.name='Renamed synthetic profile';assert.equal((await sessionUser(request(res),sql)).name,user.name,'ordinary profile changes preserve session');
user.password_hash=newHash;assert.equal(await sessionUser(request(res),sql),null,'password update invalidates existing session even before DELETE');
const delayed=response();assert.equal(await createSession(delayed,sql,user.id,oldHash),false,'old verified credential cannot issue a later session');assert.equal(delayed.headers['Set-Cookie'],undefined);
user.password_hash=oldHash;changeAfterInsert=true;res=response();assert.equal(await createSession(res,sql,user.id,oldHash),true);assert.equal(await sessionUser(request(res),sql),null,'credential changed between insert and cookie delivery cannot authenticate');
changeAfterInsert=false;res=response();assert.equal(await createSession(res,sql,user.id,newHash),true);assert.equal((await sessionUser(request(res),sql)).id,user.id);
user.active=false;assert.equal(await sessionUser(request(res),sql),null);assert.equal(await createSession(response(),sql,user.id,newHash),false);user.active=true;
assert.equal(await createSession(response(),sql,user.id),false,'credential binding cannot be omitted');
let reads=0;const unexpectedRead=async()=>{reads++;return []};
for(const value of ['legacy-unbound-token','v1.short.bad','%E0%A4%A'])assert.equal(await sessionUser({headers:{cookie:'ecg_session='+value}},unexpectedRead),null);
assert.equal(reads,0);
// Exercise signature verification separately from the opaque-token database lookup.
const token=cookie(res).slice('ecg_session='.length);
const altered=token.slice(0,-1)+(token.endsWith('A')?'B':'A');
assert.equal(await sessionUser({headers:{cookie:'ecg_session='+altered}},async()=>[{...user}]),null);
assert.equal(await sessionUser(request(res),async()=>[{...user,id:'different-login'}]),null,'signature bound to user ID');
sessions.delete(tokenHash(token));assert.equal(await sessionUser(request(res),sql),null,'logout/session deletion still wins');

// Exercise both real issuing handlers: they pass the verified credential and
// reject issuance failure instead of claiming successful authentication.
function load(path,extras){
 const ctx=vm.createContext({process:{env:{DATABASE_URL:'synthetic'}},ensureAuthSchema:async()=>{},...extras});
 vm.runInContext(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace('export default ',''),ctx);return ctx.handler;
}
let boundHash,issued=false;
const login=load('api/auth/login.js',{neon:()=>async()=>[{...user,password_hash:oldHash}],verifyPassword:()=>true,appState:async()=>({users:[]}),profileFor:()=>({id:'synthetic-profile'}),publicUser:()=>({id:'synthetic-login'}),createSession:async(_res,_sql,id,hash)=>{assert.equal(id,user.id);boundHash=hash;return issued}});
res=response();await login({method:'POST',body:{email:user.email,password:'synthetic-old-password'}},res);assert.equal(boundHash,oldHash);assert.equal(res.code,401);
issued=true;res=response();await login({method:'POST',body:{email:user.email,password:'synthetic-old-password'}},res);assert.equal(res.code,200);
const migrate=load('api/auth/migrate.js',{neon:()=>async(parts)=>parts.join('').startsWith('SELECT')?[]:[{id:user.id}],legacyJwtUser:async()=>({email:user.email}),appState:async()=>({users:[{id:user.app_user_id,email:user.email}]}),hashPassword:()=>newHash,createSession:async(_res,_sql,id,hash)=>{assert.equal(id,user.id);boundHash=hash;return issued}});
res=response();await migrate({method:'POST',body:{password:'synthetic-new-password'}},res);assert.equal(boundHash,newHash);assert.equal(res.code,200);
issued=false;res=response();await migrate({method:'POST',body:{password:'synthetic-new-password'}},res);assert.equal(res.code,409);
console.log('PASS: real HMAC session binding, stale credential before/after insertion, ordinary profile updates, tampering, user binding, legacy cookies, revocation and both issuing handlers. Synthetic data only.');
