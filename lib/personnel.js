import {calendarBusy,personnelCalendarId,publishAbsence} from './personnel-calendar.js';
import {sessionUser,profileFor} from './auth.js';

export const teamKeys={pastoral:['staffPastoral','approvePastoral'],building:['staffBuilding','approveBuilding']};
export function teamsFor(profile,approve=false){
 return Object.entries(teamKeys).filter(([,rights])=>profile.role==='admin'||(approve?[rights[1]]:rights).some(key=>profile.permissions?.[key]===true)).map(([team])=>team);
}
function date(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Bitte ein gültiges Datum wählen.');
 return value;
}
const uuid=value=>typeof value==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export async function personnel(req,res,sql){
 res.setHeader('Cache-Control','private, no-store');
 const user=await sessionUser(req,sql);if(!user)return res.status(401).json({error:'Bitte anmelden.'});
 const [state]=await sql`SELECT data->'users' AS users FROM app_state WHERE id='main'`;
 const profile=profileFor(state??{},user);
 if(!profile||profile.active===false||user.must_change_password)return res.status(403).json({error:'Konto nicht freigegeben.'});
 if(req.headers['x-ecg-user-id']!==profile.id)return res.status(409).json({error:'Konto gewechselt. Seite neu öffnen.'});
 if(req.query.personnel==='stamm'){
  if(profile.role!=='admin')return res.status(403).json({error:'Personalverwaltung nur für Administratoren.'});
  if(req.method==='GET')return res.json({staff:await sql`SELECT id,xmin::text AS revision,name,duty,employment,hourly FROM ecg_staff ORDER BY name`});
  if(!['POST','PATCH'].includes(req.method))return res.status(405).json({error:'Methode nicht erlaubt.'});
  const {name,duty,employment,hourly}=req.body||{};
  if(typeof name!=='string'||!name.trim()||name.trim().length>120||typeof duty!=='string'||duty.length>120||typeof hourly!=='boolean'||!['Offen','Vollzeit','Teilzeit','Minijob','Sonstige'].includes(employment))return res.status(400).json({error:'Personalangaben prüfen.'});
  if(req.method==='PATCH'){
   const {id,revision}=req.body;
   if(!uuid(id)||typeof revision!=='string'||!/^\d{1,10}$/.test(revision))return res.status(400).json({error:'Ungültiger Datensatz.'});
   try{
    const rows=await sql`UPDATE ecg_staff SET name=${name.trim()}, duty=${duty.trim()}, employment=${employment}, hourly=${hourly} WHERE id=${id} AND xmin::text=${revision} RETURNING id`;
    return rows.length?res.json({ok:true}):res.status(409).json({error:'Der Eintrag hat sich geändert. Bitte die Seite neu laden und die aktuellen Angaben prüfen.'});
   }catch(e){
    if(e.code==='23505')return res.status(409).json({error:'Dieser Name ist bereits angelegt.'});
    throw e;
   }
  }
  const result=await sql`INSERT INTO ecg_staff(name,duty,employment,hourly) VALUES(${name.trim()},${duty.trim()},${employment},${hourly}) ON CONFLICT DO NOTHING RETURNING id`;
  return result.length?res.status(201).json({ok:true}):res.status(409).json({error:'Dieser Name ist bereits angelegt.'});
 }
 const teams=teamsFor(profile),leads=teamsFor(profile,true),scope=req.query.personnel;
 if(!teams.length||(scope==='freigaben'&&!leads.length))return res.status(403).json({error:'Keine Berechtigung für diesen Bereich.'});
 const accounts=state.users.filter(p=>p.active!==false).map(p=>({id:p.id,name:p.name,teams:teamsFor(p).filter(t=>teams.includes(t))})).filter(p=>p.teams.length);
 if(req.method==='GET'){
  let rows;
  if(scope==='team'){
   const month=String(req.query.month||'');
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Ungültiger Monat.'});
   const start=month+'-01';
   rows=await sql`SELECT id,owner_id,team,starts::text,ends::text,deputy_id,coverage FROM ecg_absences WHERE team=ANY(${teams}::text[]) AND status='approved' AND ends>=${start}::date AND starts<${start}::date+interval '1 month' ORDER BY starts,ends`;
  }else{
   const allowed=scope==='freigaben'?leads:teams;
   rows=await sql`SELECT id,owner_id,team,kind,starts::text,ends::text,status,deputy_id,coverage,version FROM ecg_absences WHERE team=ANY(${allowed}::text[]) AND (${scope==='freigaben'} OR owner_id=${profile.id} OR deputy_id=${profile.id}) ORDER BY starts DESC`;
  }
  const linked=Boolean(personnelCalendarId())&&teams.includes('pastoral');
  let external=[],calendarError='';
  if(scope==='team'&&linked){
   try{external=await calendarBusy(req.query.month,accounts);}catch{calendarError='Google-Kalender derzeit nicht erreichbar.';}
  }
  if(scope==='eigene')rows=rows.map(row=>row.owner_id===profile.id?row:{...row,kind:'Abwesenheit'});
  return res.json({teams,leads,accounts,rows,linked,external,calendarError});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt.'});
 if(!String(req.headers['content-type']).startsWith('application/json'))return res.status(415).json({error:'JSON erforderlich.'});
 const b=req.body??{};
 if(!uuid(b.id))return res.status(400).json({error:'Ungültiger Vorgang.'});
 let rows;
 if(b.action==='request'){
  let starts,ends;try{starts=date(b.starts);ends=date(b.ends);}catch(e){return res.status(400).json({error:e.message});}
  if(!teams.includes(b.team)||!['Urlaub','Abwesenheit','Sabbatjahr'].includes(b.kind)||ends<starts)return res.status(400).json({error:'Team, Zeitraum oder Art ungültig.'});
  const deputy=b.deputy||null;
  if(deputy&&(deputy===profile.id||!accounts.some(p=>p.id===deputy&&p.teams.includes(b.team))))return res.status(400).json({error:'Vertretung gehört nicht zum Team.'});
  rows=await sql`INSERT INTO ecg_absences(id,owner_id,team,kind,starts,ends,deputy_id,coverage) VALUES(${b.id},${profile.id},${b.team},${b.kind},${starts},${ends},${deputy},${deputy?'asked':'open'}) ON CONFLICT(id) DO NOTHING RETURNING id`;
  if(!rows.length)rows=await sql`SELECT id FROM ecg_absences WHERE id=${b.id} AND owner_id=${profile.id} AND team=${b.team} AND kind=${b.kind} AND starts=${starts} AND ends=${ends} AND deputy_id IS NOT DISTINCT FROM ${deputy}`;
 }else if(b.action==='publish'){
  if(!leads.includes('pastoral')||!personnelCalendarId())return res.status(403).json({error:'Kalenderübertragung nicht freigegeben.'});
  const [row]=await sql`SELECT id,owner_id,starts::text,ends::text FROM ecg_absences WHERE id=${b.id} AND team='pastoral' AND status='approved'`;
  const owner=accounts.find(p=>p.id===row?.owner_id)?.name;
  if(!owner)return res.status(409).json({error:'Bestätigte Abwesenheit oder zugehöriges Konto fehlt.'});
  try{await publishAbsence(row,owner);return res.json({ok:true});}catch(e){return res.status(409).json({error:e.message});}
 }else if(!Number.isInteger(b.version)||b.version<1){return res.status(400).json({error:'Ungültige Version.'});
 }else if(['approve','decline'].includes(b.action)){
  if(!leads.length)return res.status(403).json({error:'Freigaberecht fehlt.'});
  rows=await sql`UPDATE ecg_absences SET status=${b.action==='approve'?'approved':'declined'},decided_by=${profile.id},version=version+1 WHERE id=${b.id} AND team=ANY(${leads}::text[]) AND status='pending' AND version=${b.version} RETURNING id`;
 }else if(b.action==='nominate'){
  const deputy=accounts.find(p=>p.id===b.deputy);
  if(!deputy)return res.status(400).json({error:'Vertretung auswählen.'});
  rows=await sql`UPDATE ecg_absences SET deputy_id=${deputy.id},coverage='asked',version=version+1
    WHERE id=${b.id} AND status IN ('pending','approved') AND version=${b.version}
    AND owner_id<>${deputy.id} AND team=ANY(${deputy.teams}::text[]) AND team=ANY(${teams}::text[])
    AND (owner_id=${profile.id} OR team=ANY(${leads}::text[])) RETURNING id`;
 }else if(['cover','refuse'].includes(b.action)){
  rows=await sql`UPDATE ecg_absences SET coverage=${b.action==='cover'?'confirmed':'declined'},version=version+1 WHERE id=${b.id} AND deputy_id=${profile.id} AND team=ANY(${teams}::text[]) AND status IN ('pending','approved') AND coverage='asked' AND version=${b.version} RETURNING id`;
 }else if(b.action==='cancel'){
  rows=await sql`UPDATE ecg_absences SET status='cancelled',version=version+1 WHERE id=${b.id} AND owner_id=${profile.id} AND team=ANY(${teams}::text[]) AND status='pending' AND version=${b.version} RETURNING id`;
 }else return res.status(400).json({error:'Unbekannte Aktion.'});
 return rows.length?res.json({ok:true}):res.status(409).json({error:'Vorgang geändert oder nicht für diese Aktion freigegeben. Bitte neu laden.'});
}
