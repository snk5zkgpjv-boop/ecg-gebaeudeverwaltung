import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {hashPassword,createSession} from '../lib/auth.js';
import {stateWithSql} from '../api/state.js';

// Exercise the actual HTTP handler and session permissions. No source text
// extraction or synthetic source compilation.
const db=new PGlite();
const sql=async(parts,...values)=>{
 let query=parts[0];
 for(let i=0;i<values.length;i++)query+='$'+(i+1)+parts[i+1];
 return (await db.query(query,values)).rows;
};
const response=()=>({code:200,headers:{},setHeader(key,value){this.headers[key]=value},
 status(code){this.code=code;return this},json(body){this.body=body;return this},
 send(body){this.body=body;return this},end(){return this}});
try{
 await db.exec(await readFile(new URL('../scripts/schema.sql',import.meta.url),'utf8'));
 const photo='data:image/jpeg;base64,YWJj';
 const issue={id:'issue_fixture',text:'Synthetic media',status:'open',photo};
 const profiles=[
   {id:'test-admin',role:'admin',active:true},
   {id:'test-finance',role:'financeDeacon',active:true,permissions:{manageRooms:false,manageIssues:false}}
 ];
 await sql`INSERT INTO app_state(id,data) VALUES('main',
   ${JSON.stringify({version:6,users:profiles,issues:[issue],timeEntries:[]})}::jsonb)`;
 const cookies={};
 for(const p of profiles){
   const password=hashPassword('synthetic-credential');
   const rows=await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active)
      VALUES(${p.id},${p.id+'@example.invalid'},${p.id},${password},false,true) RETURNING id`;
   const session=response();
   assert.equal(await createSession(session,sql,rows[0].id,password),true);
   cookies[p.id]=session.headers['Set-Cookie'].split(';')[0];
 }
 await db.exec(await readFile(new URL('../scripts/issues-forward-copy.sql',import.meta.url),'utf8'));
 for(const source of ['jsonb','tables']){
   process.env.ISSUES_SOURCE=source;
   const make=(role,issueId)=>stateWithSql({method:'GET',query:{issuePhoto:issueId},
      headers:{cookie:cookies[role]}},response(),sql);
   let r=await make('test-admin','issue_fixture');
   assert.equal(r.code,200);
   assert.equal(r.headers['Content-Type'],'image/jpeg');
   assert.equal(r.headers['Cache-Control'],'private, no-store');
   assert.equal(Buffer.from(r.body).toString(),'abc');
   r=await make('test-finance','issue_fixture');
   assert.equal(r.code,403,'finance role with no rights cannot read issue photos');
   r=await make('test-admin','../bad');
   assert.equal(r.code,400,'invalid issue ID is rejected');
   r=await stateWithSql({method:'GET',query:{issuePhoto:'issue_fixture'},headers:{}},response(),sql);
   assert.equal(r.code,401,'no session cannot read photo');
 }
 console.log('PASS: real media handler: both sources, auth, finance authorization, invalid ID, no-store, binary JPEG.');
}finally{delete process.env.ISSUES_SOURCE;await db.close()}
