import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {createSession,ensureAuthSchema,hashPassword,requireUser} from '../lib/auth.js';

const db=new PGlite();
const queries=[];
const sql=async(strings,...values)=>{
  let statement=strings[0];
  for(let i=0;i<values.length;i++)statement+='$'+(i+1)+strings[i+1];
  queries.push(statement);
  return (await db.query(statement,values)).rows;
};
const response=()=>({
  code:200,headers:{},
  status(code){this.code=code;return this},
  json(body){this.body=body;return this},
  setHeader(name,value){this.headers[name]=value},
  send(body){this.body=body;return this},
});
const countFullReads=()=>queries.filter(statement=>/\bSELECT\s+data\s*(?:,\s*revision)?\s+FROM\s+app_state\b/i.test(statement)).length;
const countSmallReads=()=>queries.filter(statement=>/\bSELECT\s+data\s*->\s*'users'\s+AS\s+users\s+FROM\s+app_state\b/i.test(statement)).length;
const loadHandler=(path,extra={})=>{
  // Execute the actual API handler with the real requireUser and PostgreSQL
  // adapter, replacing only imports and upstream network/dependent services.
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8')
    .replace(/^import\s+[^\n]*\n/gm,'')
    .replace('export default async function handler','async function handler');
  const context=vm.createContext({
    neon:()=>sql,requireUser,
    process:{env:{DATABASE_URL:'synthetic'}},
    console:{info(){},error(){}},
    Date,Intl,URL,URLSearchParams,AbortSignal,Buffer,JSON,
    ...extra,
  });
  vm.runInContext(source+'\nthis.actualHandler=handler;',context,{filename:path});
  return context.actualHandler;
};

try {
  await ensureAuthSchema(sql);
  await db.exec('CREATE TABLE app_state (id text PRIMARY KEY, data jsonb NOT NULL)');
  const passwordHash=hashPassword('fixture-password-never-used-in-production');
  const rows=await sql`INSERT INTO ecg_app_users(app_user_id,email,name,password_hash,must_change_password,active)
    VALUES('fixture-admin','fixture-admin@example.test','Fixture Admin',${passwordHash},false,true) RETURNING id`;
  const profile={id:'fixture-admin',name:'Fixture Admin',email:'fixture-admin@example.test',role:'admin',active:true,permissions:{manageUsers:true,manageCalendar:true,viewCalendar:true}};
  const largeState={users:[profile],issues:[{id:'large-fixture',text:'X'.repeat(240000)}],timeEntries:[{id:'fixture-time',userId:'fixture-admin',start:'2026-11-17T10:00:00Z',end:'2026-11-17T11:00:00Z'}]};
  await sql`INSERT INTO app_state(id,data) VALUES('main',${JSON.stringify(largeState)}::jsonb)`;
  const signedIn=response();
  assert.equal(await createSession(signedIn,sql,rows[0].id,passwordHash),true);
  const cookie=signedIn.headers['Set-Cookie'].split(';')[0];
  const request=(method,body,query)=>({method,headers:{cookie},body,query});
  queries.length=0;

  const calendar=loadHandler('api/calendar.js',{
    publicProgram:()=>{throw Error('unexpected public handler')},
    weekPdf:()=>{throw Error('unexpected PDF generation')},
    validateWeek:()=>{},
    serviceAccountAccessToken:()=>{throw Error('unexpected Google account')},
    ical:{async:{parseICS:()=>{throw Error('unexpected iCal')}},expandRecurringEvent:()=>[]},
    createHash:()=>{throw Error('unexpected hash')},
    attachCalendarRooms:events=>events,
  });
  let res=response();
  await calendar(request('GET',null,{}),res);
  assert.equal(res.code,503,'calendar reaches known unconfigured Google response after auth');
  assert.equal(countFullReads(),0,'calendar must not select full app_state data');
  assert.equal(countSmallReads(),1,'calendar must read only the users slice of app_state');

  queries.length=0;
  const admin=loadHandler('api/auth/admin-user.js',{
    ensureAuthSchema:()=>{throw Error('unexpected write path')},
    hashPassword:()=>{throw Error('unexpected password change')},
    ensureAuthRateLimitSchema:()=>{},
    clearLoginAttempts:()=>{},
  });
  res=response();
  await admin(request('POST',{appUserId:'absent',email:'absent@example.test',name:'Nobody',temporaryPassword:'synthetic-password'},{}),res);
  assert.equal(res.code,400,'admin handler consults auth.state.users without writing');
  assert.equal(res.body.error,'Benutzerprofil zuerst speichern.');
  assert.equal(countFullReads(),0,'admin user must not select full app_state data');
  assert.equal(countSmallReads(),1,'admin user must use only the users slice');

  queries.length=0;
  let synchronizedState;
  const voice=loadHandler('lib/time-voice-handler.js',{
    validateVoiceEntries:()=>{throw Error('unexpected save action')},
    pendingVoiceEntries:()=>{},
    voiceSchema:{},
    syncOrganizationTimes:async(state,profile)=>{
      synchronizedState=state;
      assert.equal(profile.id,'fixture-admin');
      return {status:'synced-synthetic'};
    },
  });
  res=response();
  await voice(request('GET',null,{}),res);
  assert.equal(res.code,200,'time voice GET still returns configuration');
  assert.equal(typeof res.body.ai,'boolean');
  assert.equal(countFullReads(),0,'time voice GET must not select full app_state data');
  assert.equal(countSmallReads(),1,'time voice GET must only read the users slice');

  queries.length=0;
  res=response();
  await voice(request('POST',{action:'sync'},{}),res);
  assert.equal(res.code,200,'time voice sync remains functional');
  assert.equal(res.body.sync.status,'synced-synthetic');
  assert.equal(synchronizedState.issues[0].text.length,240000,'sync must still receive full app state');
  assert.equal(countFullReads(),1,'time voice sync alone must load the full app state');
  assert.equal(countSmallReads(),0,'sync must not need a second users-only state query');

  console.log('PASS: real calendar, admin-user and time-voice handlers with real authenticated SQL queries; no full-state reads for profile-only operations, full state preserved for sync.');
} finally {
  await db.close();
}
