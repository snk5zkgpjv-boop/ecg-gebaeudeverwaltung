import assert from 'node:assert/strict';
import {members,memberData} from '../lib/members.js';
const sample={name:'Beispiel Person',birthDate:'2000-02-29'};
assert.throws(()=>memberData({...sample,birthDate:'2025-02-29'}));
assert.throws(()=>memberData({name:' '}));
async function call({role='member',permissions={},scope='self',body,account='one',header='one'}={}){
 const writes=[],reads=[];
 const sql=async(parts,...params)=>{
  const q=parts.join('?');
  if(q.includes('ecg_app_sessions'))return [{app_user_id:account}];
  if(q.includes("data->'users'"))return [{users:[{id:account,role,permissions}]}];
  if(q.includes('UPDATE ecg_members')||q.includes('INSERT INTO ecg_members')){writes.push({q,params});return [{id:'one',version:2}];}
  reads.push({q,params});return [];
 };
 const res={statusCode:200,status(v){this.statusCode=v;return this},setHeader(){},json(body){this.body=body;return this}};
 await members({method:body?'POST':'GET',query:{members:scope},headers:{cookie:'ecg_session=test','x-ecg-user-id':header,'content-type':'application/json'},body},res,sql);
 return {res,writes,reads};
}
assert.equal((await call({scope:'list'})).res.statusCode,403);
assert.equal((await call({header:'two'})).res.statusCode,409);
assert.equal((await call({body:{rows:[sample]}})).res.statusCode,403);
const self=await call({body:{version:1,data:sample,id:'other',accountId:'other'}});
assert.equal(self.res.statusCode,200);assert.deepEqual(self.writes[0].params.slice(-2),['one',1]);
assert.match(self.writes[0].q,/WHERE account_id=\? AND version=\?/);
assert.deepEqual((await call()).reads[0].params,['one']);
assert.equal((await call({scope:'list',permissions:{manageMembers:true}})).res.statusCode,200);
const imp=await call({role:'admin',scope:'list',body:{rows:[sample,sample]}});assert.equal(imp.res.body.skipped,1);
console.log('PASS: member self scope, import restriction, account change, ownership, revision and membership management');
