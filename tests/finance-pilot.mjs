import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transition} from '../finanzen/pilot.js';
import {financePilot} from '../lib/finance-pilot.js';
const id='M-001',now='2026-11-06T12:30:00Z';
assert.throws(()=>transition(null,id,'buchen',now));
assert.throws(()=>transition(null,id,'freigeben',now));
assert.throws(()=>transition(null,'fremder-beleg','einreichen',now));
let item=transition(null,id,'einreichen',now);
assert.equal(item.status,'eingereicht');
assert.equal(transition(item,id,'einreichen',now),item);
item=transition(item,id,'freigeben',now);
assert.equal(item.journal,null);
item=transition(item,id,'buchen',now);
assert.equal(item.status,'gebucht');assert.equal(item.journal.cents,1850);
assert.equal(transition(item,id,'buchen',now),item);
assert.throws(()=>transition(item,id,'einreichen',now));
const policy=vm.createContext({});
vm.runInContext(readFileSync('assets/portal-areas.js','utf8'),policy);
for(const [role,permissions,expected] of [['admin',{},true],['financeDeacon',{viewFinance:true},true],['deacon',{},false],['member',{},false]]){
 assert.equal(!!policy.sectionAllowed('viewFinance',{role,permissions}),expected);
}
let persisted=null,writes=0;
async function sql(parts,...values){
 const query=parts.join('?');
 assert.match(query,/ecg_demo_expenses/); // No operational finance or RH table accessed.
 if(query.startsWith('SELECT receipt_id'))return persisted?[persisted]:[];
 if(query.startsWith('SELECT status'))return persisted?[{status:persisted.status}]:[];
 if(query.startsWith('INSERT')&&!persisted){persisted={receipt_id:values[0],status:'eingereicht'};writes++;return [persisted];}
 if(query.includes("SET status='freigegeben'")&&persisted?.status==='eingereicht'){persisted.status='freigegeben';writes++;return [persisted];}
 if(query.includes("SET status='gebucht'")&&persisted?.status==='freigegeben'){persisted.status='gebucht';persisted.journal_id='TEST-'+values[0];writes++;return [persisted];}
 return [];
}
const auth={profile:{id:'finance',role:'financeDeacon',permissions:{viewFinance:true}},user:{}};
async function call(body,account=auth,header='finance'){
 const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
 return financePilot({method:body?'POST':'GET',headers:{'content-type':'application/json','x-ecg-user-id':header},body},res,sql,account);
}
assert.equal((await call(undefined,{profile:{id:'reader',role:'deacon'},user:{}},'reader')).code,403);
assert.equal((await call(undefined,auth,'stale')).code,409);
assert.equal((await call({id,action:'einreichen',comment:'private input'})).code,400);
assert.equal((await call({id:'real',action:'einreichen'})).code,400);
assert.equal((await call({id,action:'buchen'})).code,409);
const reader={profile:{id:'reader',role:'elder',permissions:{viewFinance:true}},user:{}};
assert.equal((await call({id,action:'einreichen'},reader,'reader')).code,200);
assert.equal((await call({id,action:'freigeben'},reader,'reader')).code,403);
assert.equal((await call({id,action:'buchen'},reader,'reader')).code,403);
for(const action of ['einreichen','freigeben','buchen']){
 const results=await Promise.all([call({id,action}),call({id,action})]);
 assert.deepEqual(results.map(r=>r.code),[200,200]);
}
assert.equal(writes,3);
const report=await call();assert.equal(report.body.rows.length,1);
assert.equal(report.body.rows[0].journal.id,'TEST-M-001');
assert.equal(report.body.rows[0].journal.cents,1850);
