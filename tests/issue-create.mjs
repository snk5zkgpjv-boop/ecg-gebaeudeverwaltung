import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createIssue,validateIssue} from '../lib/issue-create.js';
const raw={id:'issue_test_1',text:'Test',roomId:'r',photo:'data:image/jpeg;base64,YQ=='};
const profile={id:'u'};
let db={issues:[],rooms:[{id:'r'}],other:'unchanged'}, revision=1, collisions=0;
const sql=async(strings,...values)=>{
 if(strings[0].startsWith('SELECT'))return [{data:structuredClone(db),revision}];
 if(collisions-->0)return [];
 assert.equal(values[1],revision);
 db.issues=[...JSON.parse(values[0]),...db.issues];revision++;
 return [{revision}];
};
async function run(input=raw,p=profile){const res={status(n){this.code=n;return this;},json(b){this.body=b;return this;}};await createIssue(sql,{profile:p,state:db},input,res);return res;}
assert.equal((await run()).code,200);
assert.equal(db.issues.length,1);assert.equal(db.other,'unchanged');
assert.equal((await run()).code,200);assert.equal(db.issues.length,1);
assert.equal((await run({...raw,text:'Changed'})).code,409);
assert.equal((await run(raw,{id:'other'})).code,409);
assert.equal((await run({...raw,id:'issue_new',roomId:'missing'})).code,400);
assert.equal((await run({...raw,id:'issue_new',text:''})).code,400);
assert.throws(()=>validateIssue({...raw,photo:'data:text/html;base64,YQ=='},profile,db));
assert.throws(()=>validateIssue({...raw,photo:'x'.repeat(2800001)},profile,db));
db.deletedIssues={issue_deleted:{}};assert.equal((await run({...raw,id:'issue_deleted'})).code,409);
collisions=1;assert.equal((await run({...raw,id:'issue_retry'})).code,200);
collisions=3;assert.equal((await run({...raw,id:'issue_busy'})).code,409);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
 if(match[1].includes('src=')||match[1].includes('type="module"'))continue;
 new vm.Script(match[2]);
}
const saveSource=html.slice(html.indexOf('window.saveIssue=async'),html.indexOf('\n};',html.indexOf('window.saveIssue=async'))+3);
function client({cacheFails=false,networkFails=false,status=200,userChanged=false}={}){
 const button={};const field={value:'Report',dataset:{},closest:()=>({querySelector:()=>button})};
 const alerts=[];let closed=0,calls=0;
 const state={currentUserId:'u',issues:[],settings:{cloudSync:true}};
 const context=vm.createContext({window:{},state,authSession:{},pendingPhoto:raw.photo,issueChangeEpoch:0,uid:()=>raw.id,authHeaders:async()=>({}),
 $:selector=>selector==='#isText'?field:{value:selector==='#isRoom'?'r':''},
 localStorage:{setItem(){if(cacheFails)throw Object.assign(new Error(),{name:'QuotaExceededError'});}},
 alert:m=>alerts.push(m),console:{warn(){}},closeModal(){closed++;},render(){},
 fetch:async()=>{calls++;if(networkFails)throw new Error('Network');if(userChanged)state.currentUserId='other';return {ok:status===200,status,json:async()=>status===200?{ok:true,issue:{...raw,text:'Report'}}:{error:'Rejected'}};}
 });
 vm.runInContext(saveSource,context);
 return {context,field,button,alerts,state,closed:()=>closed,calls:()=>calls};
}
let c=client({cacheFails:true});await c.context.window.saveIssue();assert.equal(c.state.issues.length,1);assert.equal(c.closed(),1);assert.equal(c.alerts.length,0);
c=client({networkFails:true});await c.context.window.saveIssue();assert.equal(c.closed(),0);assert.equal(c.state.issues.length,0);assert.equal(c.context.pendingPhoto,raw.photo);assert.equal(c.field.dataset.issueId,raw.id);assert.equal(c.alerts.length,1);assert.equal(c.button.disabled,false);
c=client({status:413});await c.context.window.saveIssue();assert.equal(c.closed(),0);
c=client({userChanged:true});await c.context.window.saveIssue();assert.equal(c.state.issues.length,0);
c=client();await Promise.all([c.context.window.saveIssue(),c.context.window.saveIssue()]);assert.equal(c.calls(),1);
// An in-flight older pull must not replace a newly confirmed issue.
assert.ok(html.includes('if(issueEpoch!==issueChangeEpoch)'));
const api=fs.readFileSync(new URL('../api/state.js',import.meta.url),'utf8');
const accepted=api.slice(api.indexOf('function accepted('),api.indexOf('\nexport default'));
const ctx=vm.createContext({clone:structuredClone,mergeTaskProgress:(a,b)=>b,mergeReportedIssues(){},has:()=>true,mergeManagedUsers:(a,b)=>b});
vm.runInContext(accepted,ctx);
assert.equal(ctx.accepted({issues:[raw]}, {issues:[]},{role:'admin',id:'u'}).issues.length,1);
assert.equal(ctx.accepted({issues:[raw],deletedIssues:{[raw.id]:{}}}, {issues:[raw]},{role:'admin',id:'u'}).issues.length,0);
const cacheSource=html.slice(html.indexOf('function cacheAppState'),html.indexOf('let syncTimer'));
const cc=vm.createContext({state:{settings:{cloudSync:true}},authSession:{},localStorage:{setItem(){throw new Error('Quota');}},console:{warn(){}},syncCloudDebounced(){this.sent=true;}});
vm.runInContext(cacheSource,cc);assert.equal(cc.cacheAppState(),false);
cc.authSession=null;assert.throws(()=>cc.cacheAppState());
console.log('PASS: issue creation, retry, conflict, validation, stale clients, quota, network failure, double-click, user switch, inline syntax');
