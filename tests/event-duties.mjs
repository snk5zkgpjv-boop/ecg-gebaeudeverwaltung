import assert from 'node:assert/strict';
import {eventDuties,dutyDays} from '../lib/event-duties.js';

const id='12345678-1234-4321-8123-123456789012';
const event={title:'Testveranstaltung',start:'2099-01-15T18:00:00Z',end:'2099-01-15T19:00:00Z'};
const people=['organizer','member','other'].map(id=>({id,role:id==='organizer'?'admin':'member'}));
let stored=null,absent=false;
async function call(who,method,eventId,body,header=who){
 const sql=async(parts,...args)=>{
  const q=parts.join('?');
  if(q.includes('ecg_app_sessions'))return who?[{app_user_id:who}]:[];
  if(q.includes("revision,data->'users'"))return [{revision:12,users:people}];
  if(q.includes('jsonb_array_elements(data->\'calendarEvents\')'))return args[0]==='e1'?[event]:[];
  if(q.includes('AS unavailable FROM ecg_staff staff')){
   assert.match(q,/team=ANY\(\?::text\[\]\)/);assert.match(q,/staff.account_id=a.app_user_id/);return [{id:'member',name:'Muster',unavailable:false}];
  }
  if(q.includes('WHERE event_id=? ORDER BY label'))return [];
  if(q.includes('INSERT INTO ecg_event_duties')){
   assert.match(q,/NOT EXISTS\(SELECT 1 FROM ecg_absences/);assert.match(q,/status='approved'/);
   assert.match(q,/FROM ecg_staff staff JOIN ecg_app_users/);
   if(stored||absent||args[6]!=='member')return [];
   stored={id:args[0],event_id:args[1],event_title:args[2],starts_at:args[3],ends_at:args[4],label:args[5],assignee:args[6],requested_by:args[7],status:'pending',version:1};return [{id}];
  }
  if(q.includes('SELECT id FROM ecg_event_duties WHERE id=? AND event_id='))return stored&&args.every((a,i)=>a===stored[['id','event_id','label','assignee','requested_by'][i]])?[{id}]:[];
  if(q.includes('WHERE d.assignee=? AND d.ends_at>=now()')){
   assert.match(q,/cancelled/);assert.match(q,/timestamptz=d.starts_at/);return stored?.assignee===args[0]?[stored]:[];
  }
  if(q.includes('SELECT event_id,starts_at,ends_at'))return stored?.assignee===args[1]&&stored?.version===args[2]&&stored.status==='pending'?[stored]:[];
  if(q.includes("SET status='accepted'")){
   assert.match(q,/assignee=\? AND version=\? AND status='pending'/);assert.match(q,/ecg_absences/);
   if(absent||stored?.assignee!==args[1]||stored.version!==args[2])return [];
   stored.status='accepted';stored.version++;return [{id}];
  }
  throw Error(q);
 };
 const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await eventDuties({query:{eventId},headers:{cookie:'ecg_session=fixture','x-ecg-user-id':header,'content-type':'application/json'},method,body},res,sql,(p)=>p.role==='admin');
 return res;
}
const request={action:'request',id,assignee:'member',label:'Technik'};
const accept={action:'accept',id,version:1};
assert.equal((await call('','GET','')).code,401);
assert.equal((await call('member','GET','e1')).code,403);
assert.deepEqual((await call('organizer','GET','e1')).body.accounts.map(p=>p.id),['member']);
assert.equal((await call('organizer','POST','e1',{...request,assignee:'other'})).code,409);
assert.equal((await call('member','GET','',null,'other')).code,409);
absent=true;assert.equal((await call('organizer','POST','e1',request)).code,409);
absent=false;assert.equal((await call('organizer','POST','e1',request)).code,201);
assert.equal((await call('organizer','POST','e1',request)).code,200);
assert.equal((await call('other','GET','')).body.requests.length,0);
assert.equal((await call('member','GET','')).body.requests.length,1);
assert.equal((await call('other','POST','',accept)).code,409);
absent=true;assert.equal((await call('member','POST','',accept)).code,409);
absent=false;assert.equal((await call('member','POST','',accept)).code,200);
assert.equal((await call('member','POST','',accept)).code,409);
assert.deepEqual(dutyDays({start:'2026-11-07T23:00:00Z',end:'2026-11-08T23:00:00Z'}),['2026-11-08','2026-11-08']);
assert.deepEqual(dutyDays({start:'2026-11-08T00:00:00Z',end:'2026-11-08T23:59:59.999Z',allDay:true}),['2026-11-08','2026-11-08']);
console.log('PASS: duty assignment, active role, owner-only inbox/reply, version conflicts, availability at request and acceptance');
