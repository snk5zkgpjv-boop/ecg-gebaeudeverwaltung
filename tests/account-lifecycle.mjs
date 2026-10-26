import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const binding=html.slice(html.indexOf('function bindAuthUser(){'),html.indexOf('\nfunction showLoginGate'));
const a={appUserId:'a',role:'admin',name:'Test A'};
const b={appUserId:'b',role:'coordinator',name:'Test B'};
function client(){
 const disk=new Map();
 const c=vm.createContext({structuredClone,initialState:{version:6,settings:{},rooms:[],calendarEvents:[],eventChecklists:[],eventRules:[],eventDocumentSettings:{},maintenanceAssets:[],users:[]},
  state:{currentUserId:'a',currentRole:'admin',users:[{id:'a',role:'admin'}],settings:{cloudSync:true},timeEntries:[],calendarEvents:[{id:'private-event'}],eventChecklists:[{id:'private-checklist'}],eventDocumentSettings:{bankAccount:'synthetic-private'},maintenanceAssets:[{id:'restricted'}]},
  authSession:{user:b},syncTimer:0,timeChangeEpoch:0,issueChangeEpoch:0,clearTimeout(){},timeEntryIdsSeen:new Set(),
  document:{getElementById:()=>({replaceChildren(){}})},localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)}});
 vm.runInContext(binding,c);return {c,disk};
}
const {c,disk}=client();c.bindAuthUser();
assert.equal(c.state.calendarEvents.length,0,'previous account calendar must be cleared');
assert.equal(c.state.eventChecklists.length,0);
assert.equal(c.state.eventDocumentSettings.bankAccount,undefined);
assert.equal(c.state.maintenanceAssets.length,0);
assert.equal(c.state.users.length,1);
assert.equal(c.state.currentRole,'coordinator');
disk.set('ecgTimer:b',JSON.stringify({id:'ended',userId:'b'}));
c.state.timeEntries=[{id:'ended',userId:'b',end:'2026-10-01T10:00:00Z'}];c.bindAuthUser();
assert.equal(c.state.timeRunning,null,'completed timer must not be resurrected');

// A delayed consent response must never change the next account, including A -> B -> A.
let reply;
c.window=c;c.state.myTimeSharing=false;c.authHeaders=async()=>({});
c.fetch=()=>new Promise(resolve=>reply=resolve);
vm.runInContext(html.slice(html.indexOf('let timeSharingBusy='),html.indexOf('window.showTimeReport=')),c);
const checkbox={checked:true,disabled:false};
const pending=c.setTimeSharing(checkbox);await new Promise(setImmediate);
c.clearAccountView();c.authSession={user:b};c.bindAuthUser();
reply({ok:true,json:async()=>({shareTimes:true})});await pending;
assert.equal(c.state.myTimeSharing,false,'obsolete consent response ignored');

// Revoked server permissions remove restricted cache fields even for the same account.
c.state.calendarEvents=[{id:'stale'}];c.state.eventDocumentSettings={bankAccount:'old'};
c.LOCAL_ONLY_KEYS=['currentUserId','currentRole','timeRunning'];c.mergePendingTimes=x=>x||[];
vm.runInContext(html.match(/^function mergeCloudState.*$/m)[0],c);
c.mergeCloudState({version:6,users:[{id:'b',role:'coordinator'}],timeEntries:[]});
assert.equal(c.state.calendarEvents.length,0);assert.equal(c.state.eventDocumentSettings.bankAccount,undefined);

// A late authentication error for A cannot log out a newly signed-in B.
c.cacheAppState=()=>{};c.render=()=>{};c.flushTimeChanges=()=>{};
let gates=0;c.showLoginGate=()=>{gates++};
vm.runInContext(html.match(/^async function pullCloud.*$/m)[0],c);
const loading=c.pullCloud();await new Promise(setImmediate);
c.authSession={user:a};c.state.currentUserId='a';
reply({ok:false,status:401});await loading;assert.equal(gates,0);
const mismatch=c.pullCloud();await new Promise(setImmediate);
reply({ok:false,status:409});await mismatch;assert.equal(gates,1);

// Exercise the actual state filter for all roles, consent and forged privilege flags.
const server=vm.createContext({structuredClone});
vm.runInContext(fs.readFileSync('api/state.js','utf8').replace(/^import .*;\n/gm,'').split('export default')[0],server);
for(const role of ['admin','coordinator','cleaner','substitute','volunteer','technician']){
 const me={id:'b',role,permissions:{viewAllTimes:true}},other={id:'a',role:'admin'};
 const data={users:[other,me],timeEntries:[{id:'private',userId:'a'},{id:'own',userId:'b'}],timeSharing:{},rooms:[],outdoorAreas:[],eventUsageAgreements:[{id:'saved'}]};
 assert.deepEqual(Array.from(server.visible(data,me).timeEntries,x=>x.id),role==='technician'?[]:['own']);
 data.timeSharing.a=true;
 assert.equal(server.visible(data,me).timeEntries.length,role==='technician'?0:2);
 assert.equal(server.visible(data,me).eventUsageAgreements,undefined);
 const next=server.accepted(data,{...data,timeEntries:[{id:'private',userId:'b'}]},me);
 assert.equal(next.timeEntries.find(x=>x.id==='private').userId,'a');
 assert.equal(next.eventUsageAgreements[0].id,'saved');
}
console.log('PASS: account cache isolation, completed timer, delayed consent, all-role privacy and agreement preservation. Synthetic data only.');
