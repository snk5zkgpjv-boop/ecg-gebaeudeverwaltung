import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {ensureAuthSchema} from '../lib/auth.js';
import {forgotPasswordWithDependencies,resetBaseUrl} from '../api/auth/forgot-password.js';

const db=new PGlite();
const sql=async(strings,...values)=>{
 let query=strings[0];
 for(let i=0;i<values.length;i++)query+='$'+(i+1)+strings[i+1];
 return (await db.query(query,values)).rows;
};
const result=()=>({code:200,headers:{},setHeader(key,value){this.headers[key]=value},status(code){this.code=code;return this},json(data){this.body=data;return this}});
const known='known@example.test';
const unknown='unknown@example.test';
const request=email=>({method:'POST',headers:{host:'attacker.example.net','x-forwarded-host':'malicious.test'},body:{email}});
const goodEnv={PUBLIC_APP_URL:'https://ecg.example.test/',RESEND_API_KEY:'synthetic-mail-key',AUTH_FROM_EMAIL:'no-reply@example.test'};
let calls=[],errors=[];
const send=async(url,options)=>{
 calls.push({url,body:JSON.parse(options.body)});
 return {ok:true};
};
const logger={error:(msg)=>errors.push(msg)};
async function run(email,env=goodEnv,sendMail=send){
 const res=result();
 await forgotPasswordWithDependencies(request(email),res,{sql,env,send:sendMail,logger});
 return res;
}
try{
 await ensureAuthSchema(sql);
 await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active)
   VALUES('fixture-user',${known},'Synthetic <Tester>', 'synthetic-hash',false,true)`;
 const configured=await run(known);
 assert.equal(configured.code,200);
 assert.equal(calls.length,1,'existing account sends one synthetic mail');
 assert.equal(calls[0].url,'https://api.resend.com/emails');
 const html=calls[0].body.html;
 const match=html.match(/href="([^"]+)"/);
 assert.ok(match,'reset link is present in the mail');
 const link=new URL(match[1]);
 assert.equal(link.origin,'https://ecg.example.test','only PUBLIC_APP_URL sets reset link origin');
 assert.equal(link.pathname,'/');
 assert.ok(link.searchParams.get('reset')?.length>30);
 assert.equal(html.includes('attacker.example.net'),false,'untrusted Host header must never appear');
 assert.equal(html.includes('malicious.test'),false);
 assert.equal(html.includes('Synthetic &lt;Tester&gt;'),true,'mail greeting is escaped');
 const second=await run(unknown);
 assert.deepEqual(second.body,configured.body,'known and unknown accounts have identical neutral response');
 assert.equal(calls.length,1,'unknown account must not send mail');

 for(const invalid of [undefined,'','http://ecg.example.test','javascript:alert(1)','https://','https://user:pass@ecg.example.test','https://ecg.example.test/?mode=bad']){
  const env={...goodEnv,PUBLIC_APP_URL:invalid};
  const prev=calls.length;
  const knownBad=await run(known,env);
  const unknownBad=await run(unknown,env);
  assert.equal(knownBad.code,200);
  assert.equal(unknownBad.code,200);
  assert.deepEqual(knownBad.body,unknownBad.body,'no enumeration on invalid config');
  assert.equal(calls.length,prev,'invalid PUBLIC_APP_URL must not send mail');
 }
 assert.ok(errors.some(message=>message.includes('PUBLIC_APP_URL')),'server logs the configuration error');

 const failure=await run(known,goodEnv,async()=>{throw new Error('synthetic mail outage')});
 const unknownFailure=await run(unknown);
 assert.equal(failure.code,200);
 assert.deepEqual(failure.body,unknownFailure.body,'mail failure must not reveal account existence');
 assert.equal(resetBaseUrl('https://ecg.example.test/'),'https://ecg.example.test');
 console.log('PASS: real forgot-password handler with isolated PostgreSQL and stubbed sender uses PUBLIC_APP_URL exclusively; missing/invalid config never sends mail, log is server-side, known and unknown answers identical.');
}finally{await db.close()}
