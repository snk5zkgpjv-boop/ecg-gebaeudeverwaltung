import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {berlinLocalISO,validateVoiceEntries,pendingVoiceEntries} from '../lib/time-voice.js';
import {syncOrganizationTimes} from '../lib/organization-sync.js';
const now=Date.parse('2026-11-01T12:00Z'),id='12345678-1234-1234-1234-123456789abc';
const draft={date:'2026-09-16',startTime:'08:10',endDate:'2026-09-16',endTime:'09:25',workLabel:'Testtätigkeit',note:'Synthetische Testnotiz',volunteer:false};
assert.equal(berlinLocalISO(draft.date,draft.startTime),'2026-09-16T06:10:00.000Z');
assert.equal(berlinLocalISO('2026-01-10','08:00'),'2026-01-10T07:00:00.000Z');
for(const [date,time] of [['2026-02-30','08:00'],['2026-03-29','02:30'],['2026-10-25','02:30'],['2026-01-10','25:00'],['','08:00']])assert.throws(()=>berlinLocalISO(date,time));
const entries=validateVoiceEntries([draft],'me',id,now);
assert.equal(Date.parse(entries[0].end)-Date.parse(entries[0].start),75*60000);
assert.equal(entries[0].userId,'me');assert.equal(entries[0].source,'voice');
assert.throws(()=>validateVoiceEntries([{...draft,endTime:'07:00'}],'me',id,now));
assert.throws(()=>validateVoiceEntries([{...draft,date:'2027-01-01',endDate:'2027-01-01'}],'me',id,now));
assert.throws(()=>validateVoiceEntries([draft,draft],'me',id,now));
assert.throws(()=>validateVoiceEntries([draft],'me','bad',now));
assert.equal(pendingVoiceEntries([],entries).length,1);
assert.equal(pendingVoiceEntries(entries,entries).length,0);
assert.throws(()=>pendingVoiceEntries([{...entries[0],id:'existing'}],entries));
assert.throws(()=>pendingVoiceEntries([{...entries[0],note:'other'}],entries));
assert.equal(pendingVoiceEntries([{...entries[0],id:'other',userId:'other'}],entries).length,1);
const env={ORGANIZATION_API_URL:'https://example.invalid',ORGANIZATION_SYNC_TOKEN:'synthetic',ORGANIZATION_SYNC_USER_EMAIL:'test@example.invalid'};
const state={users:[{id:'me',email:env.ORGANIZATION_SYNC_USER_EMAIL}],timeEntries:[...entries,{...entries[0],id:'foreign',userId:'other'}]};
let sent;
const good=async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,synced:sent.entries.length})};};
assert.equal((await syncOrganizationTimes(state,null,good,env)).status,'synced');assert.equal(sent.entries.length,1);assert.equal(sent.ownerEmail,env.ORGANIZATION_SYNC_USER_EMAIL);
assert.equal((await syncOrganizationTimes(state,null,good,{})).status,'not_configured');
assert.equal((await syncOrganizationTimes(state,{email:'other'},good,env)).status,'not_applicable');
assert.equal((await syncOrganizationTimes(state,null,async()=>({ok:false}),env)).status,'pending');
assert.equal((await syncOrganizationTimes(state,null,async()=>{throw Error('offline')},env)).status,'pending');
assert.equal((await syncOrganizationTimes(state,null,async()=>({ok:true,json:async()=>({ok:true,synced:0})}),env)).status,'pending');
let requests=0;await syncOrganizationTimes({...state,timeEntries:Array.from({length:1001},(_,i)=>({...entries[0],id:String(i)}))},null,async(u,o)=>{requests++;return good(u,o);},env);assert.equal(requests,3);

// Execute the actual API handler with a synthetic database and authenticated profile.
let current={...state,timeEntries:[]},revision=1,writes=0,role='admin',loggedIn=true,failSync=false;
const sql=async(strings,...values)=>{
 const query=strings.join('?');
 if(query.startsWith('SELECT'))return [{data:structuredClone(current),revision}];
 if(query.startsWith('UPDATE')){if(values[1]!==revision)return [];current.timeEntries=[...JSON.parse(values[0]),...current.timeEntries];revision++;writes++;return [{revision}];}
 throw Error('unexpected SQL');
};
const c=vm.createContext({neon:()=>sql,requireUser:async(req,res)=>{if(!loggedIn){res.status(401).json({error:'login'});return null;}return {profile:{id:'me',role,email:env.ORGANIZATION_SYNC_USER_EMAIL},state:structuredClone(current)};},validateVoiceEntries:(raw,user,request)=>validateVoiceEntries(raw,user,request,now),pendingVoiceEntries,voiceSchema:{},syncOrganizationTimes:async()=>({status:failSync?'pending':'synced'}),process:{env:{DATABASE_URL:'synthetic'}},Date,Intl,JSON,AbortSignal,Buffer,Blob,FormData});
vm.runInContext(fs.readFileSync('lib/time-voice-handler.js','utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler')+';this.handler=handler',c);
async function call(body,method='POST'){const result={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};await c.handler({method,body},result);return result;}
assert.equal((await call({action:'save',requestId:id,entries:[draft]})).statusCode,200);assert.equal(writes,1);
assert.equal((await call({action:'save',requestId:id,entries:[draft]})).statusCode,200);assert.equal(writes,1);
assert.equal((await call({action:'save',requestId:id+'x',entries:[draft]})).statusCode,409);assert.equal(writes,1);
failSync=true;assert.equal((await call({action:'save',requestId:id,entries:[draft]})).body.sync.status,'pending');assert.equal(writes,1);
role='technician';assert.equal((await call({action:'save',requestId:id,entries:[draft]})).statusCode,403);
role='admin';loggedIn=false;assert.equal((await call({})).statusCode,401);loggedIn=true;
assert.equal((await call({action:'analyze',text:'test'})).statusCode,503);
assert.equal((await call({} ,'GET')).body.ai,false);

// A stale full-state save must not erase newly added voice bookings.
const stateCode=fs.readFileSync('api/state.js','utf8').replace(/^import .*;\n/gm,'').split('export default')[0];
const sc=vm.createContext({structuredClone});vm.runInContext(stateCode+';this.accepted=accepted',sc);
const base={users:[{id:'me'}],rooms:[],outdoorAreas:[],timeEntries:entries};
assert.equal(sc.accepted(base,{...base,timeEntries:[],timeEntryIdsSeen:[]},{id:'me',role:'admin'}).timeEntries.length,1);
assert.equal(sc.accepted(base,{...base,timeEntries:[],timeEntryIdsSeen:[entries[0].id]},{id:'me',role:'admin'}).timeEntries.length,0);
console.log('PASS: Berlin/DST, validation, owner binding, overlaps, idempotent API save, auth/role protection, missing AI, sync failure/chunking and stale-tab retention.');

// Coordinator API parity, without calling a real provider or writing real data.
role='coordinator';
assert.equal((await call({action:'save',requestId:id,entries:[draft]})).statusCode,200);
assert.match((await call({},'GET')).body.unavailableReason,/serverseitig/);
c.process.env.OPENAI_API_KEY='synthetic';
c.fetch=async()=>({ok:true,json:async()=>({text:'Synthetischer Test'})});
assert.equal((await call({},'GET')).body.ai,true);
assert.equal((await call({action:'transcribe',audio:'dGVzdA==',mime:'audio/mp4;codecs=mp4a.40.2'})).body.text,'Synthetischer Test');
const edited={...entries[0],note:'geändert'};
const foreign={...entries[0],id:'foreign',userId:'other'};
for(const role of ['admin','coordinator']){
 const current={...base,timeEntries:[...entries,foreign]};
 const updated=sc.accepted(current,{...base,timeEntries:[edited],timeEntryIdsSeen:[entries[0].id]},{id:'me',role});
 assert.equal(updated.timeEntries.find(e=>e.userId==='me').note,'geändert');
 assert.equal(updated.timeEntries.find(e=>e.id==='foreign').userId,'other');
 const deleted=sc.accepted(current,{...base,timeEntries:[],timeEntryIdsSeen:[entries[0].id]},{id:'me',role});
 assert.deepEqual(Array.from(deleted.timeEntries,e=>e.id),['foreign']);
}
console.log('PASS: coordinator transcription/save and admin/coordinator state edit/delete parity.');
