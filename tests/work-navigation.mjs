import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const app={innerHTML:'private-current-view',inert:false,setAttribute(){},removeAttribute(){}};
 const location={pathname:'/',search:'?bereich=raeume',reload(){throw Error('unexpected document reload')}};
 const history={pushState(_s,_t,url){location.search=url.slice(1)},replaceState(_s,_t,url){location.search=url.slice(1)}};
 let response={ok:true,status:200,body:{user:{appUserId:'a',role:'admin'},state:{version:6}}};
 const calls=[],accepted=[],gates=[],listeners={};
 const c=vm.createContext({URLSearchParams,AbortController,setTimeout,clearTimeout,location,history,esc:String,
  document:{getElementById:id=>id==='app'?app:{replaceChildren(){}},querySelector:()=>null},
  areaSections:{building:['Gebäude',[['raeume','Räume'],['inventar','Inventar']]],administration:['Verwaltung',[['benutzer','Benutzer','admin']]],events:['Veranstaltungen',[['wochenplan','PDF','admin']]],personnel:['Personal',[['team','Team']]]},
  sectionAllowed:(right,user)=>!right||user.role==='admin',currentUser:()=>c.authSession?.user,
  authSession:{user:{appUserId:'a',role:'admin'}},state:{settings:{cloudSync:true}},cloudBase:{},syncTimer:null,timeChangeEpoch:0,issueChangeEpoch:0,
  syncCloud:async()=>true,bindAuthUser(){},acceptCloudState(...args){accepted.push(args);app.innerHTML='fresh-authorized-view'},
  showLoginGate:message=>{gates.push(message);app.innerHTML='login'},scrollTo(){},maybeSyncGoogleCalendar:async()=>{},bootAuth:async()=>{},
  fetch:async(url,options)=>{calls.push({url,options});return {ok:response.ok,status:response.status,json:async()=>response.body}}
 });
 c.window=c;c.addEventListener=(name,fn)=>listeners[name]=fn;
 vm.runInContext(fs.readFileSync('assets/work-navigation.js','utf8'),c);
 return {c,app,location,calls,accepted,gates,listeners,setResponse:r=>response=r};
}
let f=fixture();let selector=f.c.workSectionSelector({id:'raeume'});
assert.match(selector,/Bereich wechseln/);assert.doesNotMatch(selector,/wochenplan|Team/);assert.match(selector,/value="raeume" selected/);
await f.c.switchWorkSection('inventar');assert.equal(f.location.search,'?bereich=inventar');assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.headers['X-ECG-User-Id'],'a');assert.equal(f.accepted.length,1);
// Failed save keeps inputs and blocks user interaction while persistence is pending.
f=fixture();let saveDone;f.c.syncCloud=()=>new Promise(resolve=>saveDone=resolve);
const pending=f.c.switchWorkSection('inventar');await new Promise(setImmediate);assert.equal(f.app.inert,true);assert.equal(f.app.innerHTML,'private-current-view');saveDone(false);await pending;
assert.equal(f.app.inert,false);assert.equal(f.app.innerHTML,'private-current-view');assert.equal(f.calls.length,0);assert.equal(f.location.search,'?bereich=raeume');
// A failed load never restores old private content; retry can complete safely.
f=fixture();f.setResponse({ok:false,status:500,body:{}});await f.c.switchWorkSection('inventar');assert.match(f.app.innerHTML,/Erneut versuchen/);assert.doesNotMatch(f.app.innerHTML,/private-current-view/);assert.equal(f.accepted.length,0);
f.setResponse({ok:true,status:200,body:{user:{appUserId:'a',role:'admin'},state:{version:6}}});await f.c.switchWorkSection('inventar');assert.equal(f.accepted.length,1);
for(const status of [401,403,409]){f=fixture();f.setResponse({ok:false,status,body:{}});await f.c.switchWorkSection('inventar');assert.equal(f.gates.length,1);assert.equal(f.accepted.length,0);}
f=fixture();f.setResponse({ok:true,status:200,body:{user:{appUserId:'b',role:'admin'},state:{version:6}}});await f.c.switchWorkSection('inventar');assert.equal(f.gates.length,1);assert.equal(f.accepted.length,0);
f=fixture();f.setResponse({ok:true,status:200,body:{user:{appUserId:'a',role:'cleaner'},state:{version:6}}});await f.c.switchWorkSection('benutzer');assert.equal(f.gates.length,1);assert.equal(f.accepted.length,0);
// Ignore late response after account switch, even if transport ignores abort.
f=fixture();let reply;f.c.fetch=()=>new Promise(resolve=>reply=resolve);const late=f.c.switchWorkSection('inventar');await new Promise(setImmediate);f.c.cancelWorkNavigation();f.c.authSession={user:{appUserId:'b'}};reply({ok:true,status:200,json:async()=>({user:{appUserId:'a'},state:{version:6}})});await late;assert.equal(f.accepted.length,0);assert.equal(vm.runInContext('workNavigationPending',f.c),false);assert.equal(f.app.inert,false);
// A render exception after replacing our own session must still offer retry.
f=fixture();f.c.acceptCloudState=()=>{throw Error('bad render fixture')};await f.c.switchWorkSection('inventar');assert.match(f.app.innerHTML,/Erneut versuchen/);assert.equal(f.location.search,'?bereich=raeume');
// Open forms remain intact, including browser Back navigation.
f=fixture();const originalGet=f.c.document.getElementById;f.c.document.getElementById=id=>id==='modalRoot'?{childElementCount:1}:originalGet(id);f.location.search='?bereich=inventar';await f.c.switchWorkSection('inventar',{fromHistory:true});assert.equal(f.calls.length,0);assert.equal(f.location.search,'?bereich=raeume');assert.equal(f.app.innerHTML,'private-current-view');
// Deadlines include response JSON/body, not just time until HTTP headers.
f=fixture();f.c.fetch=async(_url,{signal})=>({ok:true,status:200,json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
await assert.rejects(f.c.readAppResponse('/synthetic',{},5),/aborted/);
// Back/forward requests the URL destination and does not add another history entry.
f=fixture();f.location.search='?bereich=inventar';f.listeners.popstate();await new Promise(setImmediate);assert.equal(f.accepted.length,1);assert.equal(f.location.search,'?bereich=inventar');
console.log('PASS: same-document section navigation, authorized fresh state, save-before-leave/inert editing, retry, owner/permission changes, late responses, body timeout and history. Synthetic data only.');
