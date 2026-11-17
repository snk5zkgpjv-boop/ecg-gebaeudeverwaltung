import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createSession,hashPassword} from '../lib/auth.js';
import {stateWithSql} from '../api/state.js';
import {readTableIssues,readTableIssue} from '../lib/issue-tables.js';

const db=new PGlite();
const sql=async(parts,...values)=>{
 let query=parts[0];
 for(let i=0;i<values.length;i++)query+='$'+(i+1)+parts[i+1];
 return (await db.query(query,values)).rows;
};
const response=()=>({
 code:200,headers:{},body:null,
 status(code){this.code=code;return this},
 json(body){this.body=body;return this},
 send(body){this.body=body;return this},
 setHeader(k,v){this.headers[k]=v},end(){return this}
});
const id='issue_fixture_a',otherId='issue_fixture_b';
const photo='data:image/jpeg;base64,YWJj';
const one={id,text:'Synthetic report A',created:'2026-11-01T10:00:00Z',createdBy:'admin',
 status:'open',roomId:'room-1',outdoorId:'',assetId:'',priority:'normal',photo};
const two={id:otherId,text:'Synthetic report B',created:'2026-11-01T11:00:00Z',createdBy:'admin',
 status:'open',roomId:'room-1',outdoorId:'',assetId:'',priority:'normal',photo:null};
const accounts=[
 {id:'admin',role:'admin',active:true},
 {id:'coordinator',role:'coordinator',active:true},
 {id:'cleaner',role:'cleaner',active:true},
 {id:'finance',role:'financeDeacon',active:true,permissions:{manageIssues:false,manageRooms:false}},
 {id:'technical',role:'technician',active:true}
];
const sessions={};
async function call(role,method='GET',body=null,query={}){
 const res=response(),headers={cookie:sessions[role]};
 await stateWithSql({method,body,query,headers},res,sql);
 return res;
}
try{
 await db.exec(await readFile(new URL('../scripts/schema.sql',import.meta.url),'utf8'));
 await sql`INSERT INTO app_state(id,data) VALUES('main',
   ${JSON.stringify({version:6,users:accounts,rooms:[{id:'room-1',name:'Synthetic Room',tasks:[]}],
      issues:[one,two],issuePlanning:{admin:{[id]:{note:'Synthetic private planning'}}},
      timeEntries:[],settings:{cloudSync:true}})}::jsonb)`;
 for(const profile of accounts){
  const email=profile.id+'@example.invalid',password=hashPassword('synthetic-only-password');
  const rows=await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active)
    VALUES(${profile.id},${email},${profile.id},${password},false,true) RETURNING id`;
  const res=response();
  assert.equal(await createSession(res,sql,rows[0].id,password),true);
  sessions[profile.id]=res.headers['Set-Cookie'].split(';')[0];
 }
 await db.exec(await readFile(new URL('../scripts/issues-forward-copy.sql',import.meta.url),'utf8'));

 // Identical visible responses across roles and backends, including absence of
 // inline photo payloads. Each test calls the real state handler and auth gate.
 for(const profile of accounts){
  process.env.ISSUES_SOURCE='jsonb';const legacy=await call(profile.id);
  process.env.ISSUES_SOURCE='tables';const migrated=await call(profile.id);
  assert.equal(migrated.code,legacy.code,profile.role+' GET status');
  assert.deepEqual(migrated.body,legacy.body,profile.role+' GET body');
  assert.ok(!JSON.stringify(migrated.body).includes(photo),profile.role+' no inline photo');
 }
 process.env.ISSUES_SOURCE='tables';
 for(const role of ['admin','coordinator','cleaner']){
  const r=await call(role,'GET',null,{issuePhoto:id});
  assert.equal(r.code,200,role+' photo visible as before');
  assert.equal(Buffer.from(r.body).toString('utf8'),'abc');
 }
 for(const role of ['finance','technical']){
  const r=await call(role,'GET',null,{issuePhoto:id});
  if(role==='finance')assert.equal(r.code,403);
 }
 let r=await call('finance','PATCH',{updateIssue:{id,changes:{status:'done'}}});
 assert.equal(r.code,403,'finance no mutation');
 r=await call('cleaner','PATCH',{updateIssue:{id,changes:{status:'done'}}});
 assert.equal(r.code,403,'cleaner cannot edit existing issue');
 r=await call('admin','PATCH',{updateIssue:{id,changes:{photo}}});
 assert.equal(r.code,400,'photo forbidden in updateIssue whitelist');

 const smallBody={updateIssue:{id,changes:{status:'done'}}};
 assert.ok(Buffer.byteLength(JSON.stringify(smallBody))<10000,'done request below 10 KB');
 // Independent row updates have no global JSONB revision requirement.
 const [first,second]=await Promise.all([
  call('admin','PATCH',{updateIssue:{id,changes:{status:'done'}}}),
  call('admin','PATCH',{updateIssue:{id:otherId,changes:{status:'work'}}})
 ]);
 assert.equal(first.code,200);assert.equal(second.code,200);
 assert.equal((await readTableIssue(sql,id)).status,'done');
 assert.equal((await readTableIssue(sql,otherId)).status,'work');
 const oldJsonb=(await sql`SELECT data->'issues' AS issues FROM app_state WHERE id='main'`)[0].issues;
 assert.equal(oldJsonb[0].status,'open','table mode leaves legacy issues JSONB untouched');

 r=await call('admin','PUT',{protocol:1,changes:{issues:{before:[one,two],after:[]}}});
 assert.equal(r.code,409,'legacy issue PUT rejected in tables mode');

 const fresh='issue_synthetic_new';
 const creation={id:fresh,text:'New synthetic',roomId:'room-1',photo};
 r=await call('cleaner','PATCH',{createIssue:creation});
 assert.equal(r.code,200,'cleaner may report a new issue');
 assert.equal((await call('cleaner','PATCH',{createIssue:creation})).code,200,'idempotent creation');
 assert.equal((await readTableIssue(sql,fresh)).photo,photo);
 const deleteByClean=await call('cleaner','PATCH',{deleteIssueId:fresh});
 assert.equal(deleteByClean.code,403,'cleaner cannot delete');
 assert.equal((await call('admin','PATCH',{deleteIssueId:fresh})).code,200,'authorized delete');
 assert.equal(await readTableIssue(sql,fresh),null);
 assert.equal((await call('admin','PATCH',{deleteIssueId:fresh})).code,200,'idempotent delete retry');
 assert.equal((await call('cleaner','PATCH',{createIssue:creation})).code,409,'deleted issue cannot be resurrected');

 // Capture table changes (including the original jpeg), and round-trip
 // back into JSONB. The operator scripts are never used on production.
 await db.exec(await readFile(new URL('../scripts/issues-backcopy.sql',import.meta.url),'utf8'));
 const back=(await sql`SELECT data->'issues' AS issues FROM app_state WHERE id='main'`)[0].issues;
 const tableIssues=await readTableIssues(sql);
 assert.equal(back.length,tableIssues.length);
 assert.equal(back[0].photo,photo);
 assert.equal(back[0].status,'done');
 assert.equal(back[1].status,'work');
 await db.exec(await readFile(new URL('../scripts/issues-forward-copy.sql',import.meta.url),'utf8'));
 const roundtrip=await sql`SELECT COALESCE(jsonb_agg(r.payload ||
   CASE WHEN p.issue_id IS NULL THEN '{}'::jsonb
   ELSE jsonb_build_object('photo',p.image_data_url) END
   ORDER BY r.sort_order),'[]'::jsonb) AS issues
   FROM ecg_issue_records r LEFT JOIN ecg_issue_photos p ON p.issue_id=r.id`;
 assert.deepEqual(roundtrip[0].issues,back,'round trip preserves all metadata and photos');

 console.log('PASS: real state handler, role equivalence, authorized photo access, row-level concurrent updates, <10 KB status PATCH, deletion, complete issue/photo roundtrip.');
}finally{
 delete process.env.ISSUES_SOURCE;
 await db.close();
}
