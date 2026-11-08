import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Handler/interaction regression tests. SQL concurrency is additionally validated
// against PostgreSQL semantics during review, not simulated by this stub.
const read=path=>fs.readFileSync(path,'utf8');
const response=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}});
const source=read('lib/auth.js');
let mandatory=true,stateReads=0;
const gate=vm.createContext({sessionUser:async()=>({app_user_id:'test-admin',must_change_password:mandatory}),appState:async()=>{stateReads++;return {users:[{id:'test-admin',role:'admin'}]}},profileFor:state=>state.users[0]});
vm.runInContext(source.slice(source.indexOf('export async function requireUser')).replace('export ',''),gate);
let res=response();assert.equal(await gate.requireUser({headers:{}},res,{}),null);assert.equal(res.code,403);assert.equal(res.body.code,'PASSWORD_CHANGE_REQUIRED');assert.equal(stateReads,0,'no private state read before mandatory password change');
mandatory=false;res=response();assert.equal((await gate.requireUser({headers:{}},res,{})).profile.role,'admin');

function handler(path,sql,extras={}){
 const ctx=vm.createContext({process:{env:{DATABASE_URL:'synthetic'}},neon:()=>sql,ensureAuthSchema:async()=>{},hashPassword:value=>'hashed:'+value,tokenHash:value=>'token:'+value,...extras});
 vm.runInContext(read(path).replace(/^import .*;\n/gm,'').replace('export default ',''),ctx);
 return ctx.handler;
}
let queries=[],result=[{id:'synthetic-user'}];
const sql=async(parts,...values)=>{queries.push({text:parts.join('?'),values});return result};
const reset=handler('api/auth/reset-password.js',sql);
res=response();await reset({method:'POST',body:{token:'only-synthetic',newPassword:'valid-synthetic-password'}},res);
assert.equal(res.code,200);assert.equal(queries.length,1,'reset must not split claim/password/revocation into separate requests');
assert.match(queries[0].text,/WITH claimed AS/);assert.match(queries[0].text,/used_at IS NULL AND expires_at>now\(\)/);assert.match(queries[0].text,/DELETE FROM ecg_app_sessions/);
result=[];res=response();await reset({method:'POST',body:{token:'expired',newPassword:'valid-synthetic-password'}},res);assert.equal(res.code,400);
queries=[];res=response();await reset({method:'POST',body:{newPassword:'short'}},res);assert.equal(res.code,400);assert.equal(queries.length,0);

const adminProfile={id:'test-admin',role:'admin'};
let adminQueries=[];
const adminSql=async(parts,...values)=>{const text=parts.join('?');adminQueries.push({text,values});return text.startsWith('SELECT')?[{id:'synthetic-user',app_user_id:'test-target'}]:[]};
const admin=handler('api/auth/admin-user.js',adminSql,{requireUser:async()=>({profile:adminProfile,state:{users:[adminProfile,{id:'test-target',email:'synthetic@example.test'}]}})});
res=response();await admin({method:'POST',body:{appUserId:'test-target',email:'synthetic@example.test',name:'Synthetic',temporaryPassword:'valid-synthetic-password'}},res);
assert.equal(res.code,200);assert.equal(adminQueries.length,2);assert.match(adminQueries[1].text,/WITH changed AS/);assert.match(adminQueries[1].text,/DELETE FROM ecg_app_sessions/);
adminQueries=[];res=response();await admin({method:'POST',body:{appUserId:'test-target',email:'synthetic@example.test',name:'Synthetic'}},res);assert.equal(res.code,200);assert.doesNotMatch(adminQueries[1].text,/DELETE FROM ecg_app_sessions/,'ordinary profile update preserves sessions');

let changeResult=[{id:'synthetic-user'}],changeQueries=[];
const changeSql=async(parts,...values)=>{const text=parts.join('?');changeQueries.push({text,values});return text.startsWith('SELECT')?[{password_hash:'old-hash'}]:changeResult};
const change=handler('api/auth/change-password.js',changeSql,{sessionUser:async()=>({id:'synthetic-user',must_change_password:true}),verifyPassword:(pw,hash)=>pw==='old-password'&&hash==='old-hash'});
res=response();await change({method:'POST',body:{currentPassword:'old-password',newPassword:'new-synthetic-password'}},res);assert.equal(res.code,200,'forced-change user can change own password');assert.match(changeQueries[1].text,/AND password_hash=/);assert.match(changeQueries[1].text,/DELETE FROM ecg_app_sessions/);
changeResult=[];res=response();await change({method:'POST',body:{currentPassword:'old-password',newPassword:'new-synthetic-password'}},res);assert.equal(res.code,409,'concurrent change cannot overwrite newer password');
changeQueries=[];res=response();await change({method:'POST',body:{currentPassword:'wrong',newPassword:'new-synthetic-password'}},res);assert.equal(res.code,400);assert.equal(changeQueries.length,1);

let migratedWrites=0;
const migrate=handler('api/auth/migrate.js',async(parts)=>{if(parts.join('').startsWith('SELECT'))return [{id:'synthetic-user',app_user_id:'test-target'}];migratedWrites++;return []},{legacyJwtUser:async()=>({email:'synthetic@example.test'}),appState:async()=>({users:[{id:'test-target',email:'synthetic@example.test'}]}),createSession:async()=>{migratedWrites++}});
res=response();await migrate({method:'POST',body:{password:'synthetic-password'}},res);assert.equal(res.code,409);assert.equal(migratedWrites,0,'one-time migration cannot replace an existing credential');

const html=read('index.html');
let dialogs=0,pulls=0,redirects=[],fetches=[];
const ui=vm.createContext({URLSearchParams,location:{search:'?bereich=termine',replace:url=>redirects.push(url)},document:{getElementById:()=>({remove(){},replaceChildren(){}})},changePasswordDialog:forced=>{assert.equal(forced,true);dialogs++},currentSection:()=>({}),showLoginGate:()=>assert.fail('forced change must remain reachable'),bindAuthUser:()=>assert.fail('no protected state before change'),pullCloud:()=>{pulls++;},$:selector=>({value:'synthetic',remove(){},textContent:''}),fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>({user:{role:'admin',mustChangePassword:true}})}}});
ui.window=ui;
vm.runInContext(html.slice(html.indexOf('function openPortalHome'),html.indexOf('function openFromQuery')),ui);
for(const role of ['admin','cleaner','member'])assert.equal(ui.openPortalHome({role,mustChangePassword:true}),true);
assert.equal(dialogs,3);assert.equal(redirects.length,0);
vm.runInContext(html.match(/^window.loginWithPassword=.*$/m)[0],ui);
await ui.loginWithPassword();assert.equal(dialogs,4);assert.equal(pulls,0);assert.deepEqual(fetches,['/api/auth/login']);
fetches=[];ui.fetch=async url=>{fetches.push(url);return url.startsWith('/api/state')?{status:403,ok:false,json:async()=>({code:'PASSWORD_CHANGE_REQUIRED'})}:{ok:true,json:async()=>({user:{role:'admin',mustChangePassword:true}})}};
vm.runInContext(html.slice(html.indexOf('async function bootAuth(){'),html.indexOf('\n</script>',html.indexOf('async function bootAuth(){'))),ui);
await ui.bootAuth();assert.equal(dialogs,5);assert.equal(pulls,0);assert.deepEqual(fetches,['/api/state?entry=1','/api/auth/session']);assert.equal(redirects.length,0);
let closeRemoved=false,dialogMarkup='';
const passwordDialog={dataset:{},querySelector:()=>({remove(){closeRemoved=true}})};
const passwordUi=vm.createContext({modal:html=>{dialogMarkup=html;return passwordDialog}});passwordUi.window=passwordUi;
vm.runInContext(html.match(/^window.changePasswordDialog=.*$/m)[0],passwordUi);
passwordUi.changePasswordDialog(true);assert.equal(closeRemoved,true);assert.equal(passwordDialog.dataset.passwordRequired,'true');assert.match(dialogMarkup,/signOutApp/);assert.doesNotMatch(dialogMarkup,/closeModal/);
console.log('PASS: mandatory-password gate, password/reset handler boundaries, session revocation, concurrent-change response, one-time migration, and forced-change login/deep-link paths. Synthetic data only.');
