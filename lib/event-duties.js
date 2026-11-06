import {sessionUser,profileFor} from './auth.js';
import {teamsFor} from './personnel.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const localDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
export function dutyDays(event){
 const start=new Date(event.start),end=new Date(event.end);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start)return null;
 // All-day calendar events store the last included millisecond; timed events have an exclusive end.
 return event.allDay?[start.toISOString().slice(0,10),end.toISOString().slice(0,10)]:
  [localDay.format(start),localDay.format(new Date(Math.max(+start,+end-1)))];
}
export async function eventDuties(req,res,sql,has){
 res.setHeader('Cache-Control','private, no-store');
 const deny=(code,error)=>res.status(code).json({error});
 const login=await sessionUser(req,sql);
 if(!login)return deny(401,'Bitte anmelden.');
 const eventId=req.query.eventId||'';
 if(typeof eventId!=='string'||eventId.length>512)return deny(400,'Ungültiger Termin.');
 const [state]=await sql`SELECT revision,data->'users' AS users FROM app_state WHERE id='main'`;
 const profile=profileFor(state||{},login);
 if(!profile||profile.active===false||login.must_change_password)return deny(403,'Konto nicht freigegeben.');
 if(req.headers['x-ecg-user-id']!==profile.id)return deny(409,'Konto gewechselt. Bitte neu öffnen.');
 if(eventId&&(profile.role==='member'||!has(profile,'manageCalendar')))return deny(403,'Kalenderverwaltung erforderlich.');
 const eventFor=async id=>{
  const [event]=await sql`SELECT e->>'title' AS title,e->>'start' AS start,e->>'end' AS "end",(e->>'allDay')::boolean AS "allDay" FROM app_state, jsonb_array_elements(data->'calendarEvents') e WHERE app_state.id='main' AND e->>'id'=${id} AND COALESCE((e->>'cancelled')::boolean,false)=false LIMIT 1`;
  return event;
 };
 if(req.method==='GET'){
  if(!eventId){
   const requests=await sql`SELECT d.id,e->>'title' AS event_title,d.starts_at,d.label,d.status,d.version FROM ecg_event_duties d JOIN app_state s ON s.id='main' CROSS JOIN LATERAL jsonb_array_elements(s.data->'calendarEvents') e
    WHERE d.assignee=${profile.id} AND d.ends_at>=now() AND d.status IN ('pending','accepted') AND e->>'id'=d.event_id AND COALESCE((e->>'cancelled')::boolean,false)=false
    AND (e->>'start')::timestamptz=d.starts_at AND (e->>'end')::timestamptz=d.ends_at ORDER BY d.starts_at,d.label`;
   return res.json({requests});
  }
  const event=await eventFor(eventId);
  if(!event||!dutyDays(event))return deny(409,'Termin fehlt oder ist abgesagt.');
  const [from,to]=dutyDays(event);
  const visibleTeams=teamsFor(profile);
  const accounts=await sql`SELECT a.app_user_id AS id,p->>'name' AS name,EXISTS(SELECT 1 FROM ecg_absences WHERE owner_id=a.app_user_id AND team=ANY(${visibleTeams}::text[]) AND status='approved' AND starts<=${to}::date AND ends>=${from}::date) AS unavailable FROM ecg_staff staff JOIN ecg_app_users a ON staff.account_id=a.app_user_id JOIN app_state s ON s.id='main' CROSS JOIN LATERAL jsonb_array_elements(s.data->'users') p WHERE a.active AND p->>'id'=a.app_user_id AND COALESCE((p->>'active')::boolean,true) ORDER BY name,a.app_user_id`;
  const requests=await sql`SELECT id,label,assignee,status,version FROM ecg_event_duties WHERE event_id=${eventId} ORDER BY label,assignee`;
  return res.json({accounts,requests});
 }
 if(req.method!=='POST')return deny(405,'Methode nicht erlaubt.');
 if(!String(req.headers['content-type']).startsWith('application/json'))return deny(415,'JSON erforderlich.');
 const {action,id,assignee,version}=req.body||{};
 if(!uuid(id))return deny(400,'Ungültige Anfrage.');
 if(eventId&&action==='request'){
  const event=await eventFor(eventId),label=typeof req.body.label==='string'?req.body.label.trim():'';
  if(!event||!dutyDays(event)||Date.parse(event.end)<=Date.now())return deny(409,'Termin fehlt, ist vorbei oder ist abgesagt.');
  if(!label||label.length>120||typeof assignee!=='string'||!assignee||assignee.length>200)return deny(400,'Dienst und Person auswählen.');
  const [from,to]=dutyDays(event);
  const added=await sql`INSERT INTO ecg_event_duties(id,event_id,event_title,starts_at,ends_at,label,assignee,requested_by)
    SELECT ${id},${eventId},${event.title},${event.start},${event.end},${label},${assignee},${profile.id}
    FROM app_state WHERE app_state.id='main' AND revision=${state.revision}
    AND EXISTS(SELECT 1 FROM ecg_staff staff JOIN ecg_app_users a ON a.app_user_id=staff.account_id CROSS JOIN LATERAL jsonb_array_elements(app_state.data->'users') p WHERE a.app_user_id=${assignee} AND a.active AND p->>'id'=a.app_user_id AND COALESCE((p->>'active')::boolean,true))
    AND NOT EXISTS(SELECT 1 FROM ecg_absences WHERE owner_id=${assignee} AND status='approved' AND starts<=${to}::date AND ends>=${from}::date)
    ON CONFLICT DO NOTHING RETURNING id`;
  if(added.length)return res.status(201).json({ok:true});
  const retry=await sql`SELECT id FROM ecg_event_duties WHERE id=${id} AND event_id=${eventId} AND label=${label} AND assignee=${assignee} AND requested_by=${profile.id}`;
  return retry.length?res.json({ok:true}):deny(409,'Anfrage bereits vorhanden, Person nicht verfügbar oder Kalender geändert. Bitte neu öffnen.');
 }
 if(!Number.isSafeInteger(version)||version<1)return deny(400,'Ungültige Anfrageversion.');
 let updated=[];
 if(eventId&&action==='withdraw'){
  updated=await sql`UPDATE ecg_event_duties SET status='withdrawn',version=version+1 WHERE id=${id} AND event_id=${eventId} AND version=${version} AND status IN ('pending','accepted') AND EXISTS(SELECT 1 FROM app_state WHERE id='main' AND revision=${state.revision}) RETURNING id`;
 }else if(!eventId&&action==='decline'){
  updated=await sql`UPDATE ecg_event_duties SET status='declined',version=version+1 WHERE id=${id} AND assignee=${profile.id} AND version=${version} AND status='pending' AND EXISTS(SELECT 1 FROM app_state WHERE id='main' AND revision=${state.revision}) RETURNING id`;
 }else if(!eventId&&action==='accept'){
  const [assignment]=await sql`SELECT event_id,starts_at,ends_at FROM ecg_event_duties WHERE id=${id} AND assignee=${profile.id} AND version=${version} AND status='pending'`;
  const event=assignment&&await eventFor(assignment.event_id);
  if(!event||!dutyDays(event)||+new Date(assignment.starts_at)!==Date.parse(event.start)||+new Date(assignment.ends_at)!==Date.parse(event.end)||Date.parse(event.end)<=Date.now())return deny(409,'Termin oder Anfrage geändert. Bitte die Planung informieren.');
  const [from,to]=dutyDays(event);
  updated=await sql`UPDATE ecg_event_duties SET status='accepted',version=version+1 WHERE id=${id} AND assignee=${profile.id} AND version=${version} AND status='pending'
    AND EXISTS(SELECT 1 FROM app_state WHERE id='main' AND revision=${state.revision})
    AND NOT EXISTS(SELECT 1 FROM ecg_absences WHERE owner_id=${profile.id} AND status='approved' AND starts<=${to}::date AND ends>=${from}::date) RETURNING id`;
 }else return deny(400,'Unbekannte Aktion.');
 return updated.length?res.json({ok:true}):deny(409,'Anfrage geändert oder nicht verfügbar. Bitte erneut öffnen.');
}
