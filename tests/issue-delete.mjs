import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {deleteIssue} from '../lib/issue-delete.js';
const issue={id:'issue_test',text:'Synthetischer Mangel',status:'open'},other={id:'other',text:'Bleibt',status:'done'};
let db,revision,writes;
const reset=()=>{db={issues:[issue,other],rooms:[],outdoorAreas:[],users:[],timeEntries:[],issuePlanning:{one:{issue_test:{estimatedMinutes:30},other:{note:'bleibt'}},two:{issue_test:{note:'privat'}}}};revision=1;writes=0;};reset();
const sql=async(parts,...args)=>{if(parts.join('?').startsWith('SELECT'))return [{data:structuredClone(db),revision}];if(args[3]!==revision)return [];db={...db,issues:JSON.parse(args[0]),issuePlanning:JSON.parse(args[1]),deletedIssues:JSON.parse(args[2])};revision++;writes++;return [{revision}];};
async function call(profile,id='issue_test'){const res={statusCode:200,status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};await deleteIssue(sql,{profile},id,res);return res;}
for(const profile of [{id:'a',role:'admin'},{id:'c',role:'coordinator'}]){reset();assert.equal((await call(profile)).statusCode,200);assert.deepEqual(db.issues,[other]);assert.equal(db.issuePlanning.one.issue_test,undefined);assert.equal(db.issuePlanning.two.issue_test,undefined);assert.equal(db.issuePlanning.one.other.note,'bleibt');assert.equal(db.deletedIssues.issue_test.issue.text,issue.text);assert.equal((await call(profile)).statusCode,200);assert.equal(writes,1);}
for(const profile of [{id:'t',role:'technician',permissions:{manageIssues:true}},{id:'c',role:'coordinator',permissions:{manageIssues:false}},{id:'x',role:'cleaner'}]){reset();assert.equal((await call(profile)).statusCode,403);assert.equal(writes,0);}
assert.equal((await call({id:'a',role:'admin'},'bad/id')).statusCode,400);
reset();await call({id:'a',role:'admin'});
const sc=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync('api/state.js','utf8').replace(/^import .*;\n/gm,'').split('export default')[0]+';this.accepted=accepted;this.visible=visible;',sc);
for(const role of ['admin','coordinator','cleaner']){assert.ok(!sc.accepted(db,{issues:[issue,other],deletedIssues:{}},{id:'c',role}).issues.some(i=>i.id===issue.id));assert.equal(sc.visible(db,{id:'c',role}).deletedIssues,undefined);}
// Actual UI: no removal on cancel, permission failure or server failure; success removes only target.
const index=fs.readFileSync('index.html','utf8');const code=index.slice(index.indexOf('function issueDeleteButton('),index.indexOf('function formatPlanMinutes('));
let allowed=true,confirmed=false,fail=false,requests=0,closed=0;
const c=vm.createContext({state:{currentUserId:'me',issues:[issue,other],myIssuePlanning:{issue_test:{note:'test'}}},can:()=>allowed,confirm:()=>confirmed,esc:s=>String(s),clearTimeout:()=>{},syncTimer:null,syncCloud:async()=>{},authHeaders:async()=>({}),fetch:async()=>{requests++;return {ok:!fail,json:async()=>fail?{error:'offline'}:{ok:true,deletedId:'issue_test'}}},localStorage:{setItem:()=>{}},closeModal:()=>closed++,render:()=>{},alert:()=>{}});c.window=c;vm.runInContext(code,c);
await c.deleteIssue('issue_test');assert.equal(requests,0);assert.equal(c.state.issues.length,2);
confirmed=true;fail=true;await c.deleteIssue('issue_test');assert.equal(c.state.issues.length,2);
fail=false;await c.deleteIssue('issue_test',true);assert.equal(c.state.issues.length,1);assert.equal(c.state.issues[0].id,'other');assert.equal(closed,1);assert.equal(c.state.myIssuePlanning.issue_test,undefined);
allowed=false;assert.equal(c.issueDeleteButton('other'),'');await c.deleteIssue('other');assert.equal(c.state.issues.length,1);
console.log('PASS: issue deletion permissions, confirmation/failure handling, single-item deletion, private planning cleanup, idempotency, hidden deletion archive and stale-client protection. Synthetic data only.');
