import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const auth=fs.readFileSync('lib/auth.js','utf8');
const resolver=auth.slice(auth.indexOf('export function profileFor'),auth.indexOf('export function publicUser')).replace('export ','');
const a={id:'account-a',email:'same@example.test',name:'Account A',role:'admin'};
const b={id:'account-b',email:'same@example.test',name:'Account B',role:'cleaner'};
const ctx=vm.createContext({});vm.runInContext(resolver,ctx);
assert.equal(ctx.profileFor({users:[a,b]},{app_user_id:b.id,email:b.email}),b);
assert.equal(ctx.profileFor({users:[a]},{app_user_id:b.id,email:a.email}),null);
assert.equal(ctx.profileFor({users:[a,a]},{app_user_id:a.id}),null);
assert.equal(ctx.profileFor({users:[{id:'empty',email:''}]},{}),null);

const disk=new Map([['ecgTimeChange:v1:pending',JSON.stringify({userId:a.id})]]);
let cleared=0;
const c=vm.createContext({state:{currentUserId:a.id,currentRole:'admin',users:[a,b],settings:{cloudSync:true},timeEntries:[{id:'private-a',userId:a.id}],timeRunning:{id:'running-a',userId:a.id,start:'2026-10-01T08:00:00Z'},myTimeSharing:true,sharedTimeUsers:[a],myIssuePlanning:{private:true}},
 authSession:{user:{appUserId:b.id,name:b.name,email:b.email,role:b.role,permissions:{}}},
 syncTimer:1,timeEntryIdsSeen:new Set(['private-a']),timeChangeEpoch:0,issueChangeEpoch:0,
 clearTimeout:()=>{},document:{getElementById:()=>({replaceChildren:()=>cleared++})},
 localStorage:{setItem:(k,v)=>disk.set(k,v),getItem:k=>disk.get(k)||null},mergePendingTimes:x=>x});
vm.runInContext(html.slice(html.indexOf('function bindAuthUser(){'),html.indexOf('\nfunction showLoginGate')),c);
c.bindAuthUser();
assert.equal(c.state.currentUserId,b.id);assert.equal(c.state.currentRole,'cleaner');
assert.equal(c.state.timeEntries.length,0);assert.equal(c.state.timeRunning,null);
assert.equal(c.state.myTimeSharing,false);assert.equal(Object.keys(c.state.myIssuePlanning).length,0);
assert.ok(disk.has('ecgTimeChange:v1:pending'));assert.ok(disk.has('ecgTimer:'+a.id));
// No local account/role wins over the authenticated server profile, even on reload.
c.state.users.find(x=>x.id===b.id).role='admin';c.bindAuthUser();assert.equal(c.state.currentRole,'cleaner');
c.authSession={user:{appUserId:a.id,name:a.name,email:a.email,role:a.role}};c.bindAuthUser();
assert.equal(c.state.timeRunning.id,'running-a');
c.clearAccountView();assert.equal(c.authSession,null);assert.equal(c.state.currentUserId,null);
assert.equal(c.state.users.length,0);assert.ok(cleared>0);assert.ok(disk.has('ecgTimeChange:v1:pending'));

// A stale tab with account A must never operate under account B's newer cookie.
const response=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}});
const server=vm.createContext({sessionUser:async()=>({app_user_id:b.id}),appState:async()=>({users:[a,b]})});
vm.runInContext(resolver+'\n'+auth.slice(auth.indexOf('export async function requireUser')).replace('export ',''),server);
let res=response();assert.equal(await server.requireUser({headers:{'x-ecg-user-id':a.id}},res,{}),null);assert.equal(res.code,409);
res=response();assert.equal((await server.requireUser({headers:{'x-ecg-user-id':b.id}},res,{})).profile.id,b.id);

// Exercise actual admin handler: an email belonging to another ID cannot rebind its login.
let writes=0,rows=[{id:'login-a',app_user_id:a.id}];
const sql=async(parts)=>{if(parts.join('').startsWith('SELECT'))return rows;writes++;return []};
const admin=vm.createContext({process:{env:{DATABASE_URL:'synthetic'}},neon:()=>sql,
 requireUser:async()=>({profile:a,state:{users:[a,b]}}),ensureAuthSchema:async()=>{},hashPassword:()=>''});
vm.runInContext(fs.readFileSync('api/auth/admin-user.js','utf8').replace(/^import .*;\n/gm,'').replace('export default ',''),admin);
res=response();await admin.handler({method:'POST',body:{appUserId:b.id,email:b.email,name:b.name}},res);
assert.equal(res.code,409);assert.equal(writes,0);
rows=[{id:'login-b',app_user_id:b.id}];res=response();await admin.handler({method:'POST',body:{appUserId:b.id,email:b.email,name:b.name}},res);
assert.equal(res.code,200);assert.equal(writes,1);

// Server visibility: fixing an owner immediately removes access by the old owner.
const stateApi=vm.createContext({structuredClone});
vm.runInContext(fs.readFileSync('api/state.js','utf8').replace(/^import .*;\n/gm,'').split('export default')[0],stateApi);
const repaired={users:[a,b],timeEntries:[{id:'repaired',userId:a.id}],timeSharing:{}};
assert.equal(stateApi.visible(repaired,b).timeEntries.length,0);
assert.equal(stateApi.visible(repaired,a).timeEntries.length,1);
const protectedRepair={...repaired,timeWriteVersions:{repaired:{userId:a.id,revision:'repair',deleted:false}}};
const stale={users:[a,b],timeEntries:[{id:'repaired',userId:b.id}],rooms:[],outdoorAreas:[]};
assert.equal(stateApi.accepted(protectedRepair,stale,b).timeEntries.find(e=>e.id==='repaired').userId,a.id);
console.log('PASS: strict profile binding, duplicate/empty emails, authoritative role, account switching, private cache clearing, timer/outbox preservation, cross-tab cookie mismatch, login relinking rejection and repaired-entry visibility. Synthetic data only.');
