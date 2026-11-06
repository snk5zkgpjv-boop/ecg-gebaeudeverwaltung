import {createHash} from 'node:crypto';

function planData(input){
 if(!input || typeof input.start!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start)||!Array.isArray(input.items)||input.items.length>80)throw Error('Startzeit und höchstens 80 Punkte angeben.');
 const items=input.items.map(row=>{
  if(!row||typeof row.title!=='string'||!row.title.trim()||row.title.length>160||typeof row.lead!=='string'||row.lead.length>120||!Number.isInteger(row.minutes)||row.minutes<1||row.minutes>1440)throw Error('Jeder Punkt benötigt einen Titel und eine Dauer zwischen 1 und 1440 Minuten.');
  return {title:row.title.trim(),minutes:row.minutes,lead:row.lead.trim()};
 });
 if(items.reduce((sum,row)=>sum+row.minutes,0)>1440)throw Error('Ein Ablauf darf höchstens 24 Stunden umfassen.');
 return {start:input.start,items};
}
export async function runSheet(req,res,sql,auth,has){
 res.setHeader('Cache-Control','private, no-store');
 if(auth.user?.must_change_password||!has(auth.profile,'manageCalendar'))return res.status(403).json({error:'Kalenderverwaltung mit vollständig freigeschaltetem Konto erforderlich.'});
 if(req.headers['x-ecg-user-id']!==auth.profile.id)return res.status(409).json({error:'Konto gewechselt. Bitte neu anmelden.'});
 const eventId=req.query.eventId;
 if(typeof eventId!=='string'||!eventId.trim()||eventId.length>512)return res.status(400).json({error:'Ungültiger Termin.'});
 const docFor=data=>(data.eventRunSheets||[]).find(doc=>doc.eventId===eventId);
 if(req.method==='GET')return res.json({sheet:docFor(auth.state)||null});
 if(req.method!=='PATCH')return res.status(405).json({error:'Methode nicht erlaubt.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON erforderlich.'});
 const {version,mutationId}=req.body||{};
 if(!Number.isSafeInteger(version)||version<0||typeof mutationId!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(mutationId))return res.status(400).json({error:'Ungültige Speicherdaten.'});
 let data;
 try{data=planData(req.body);}catch(e){return res.status(400).json({error:e.message});}
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 for(let tryNo=0;tryNo<3;tryNo++){
  const [row]=await sql`SELECT data,revision FROM app_state WHERE id='main'`;
  const user=row?.data.users?.find(u=>u.id===auth.profile.id);
  if(!user||user.active===false||!has(user,'manageCalendar'))return res.status(403).json({error:'Kalenderverwaltung erforderlich.'});
  if(!row.data.calendarEvents?.some(e=>e.id===eventId && !e.cancelled))return res.status(409).json({error:'Termin fehlt oder fällt aus. Bitte den Kalender aktualisieren.'});
  const old=docFor(row.data);
  if(old?.mutationId===mutationId && old.hash===hash && old.author===user.id)return res.json({sheet:old});
  if((old?.version||0)!==version)return res.status(409).json({error:'Ablaufplan inzwischen geändert. Bitte Entwurf vergleichen und den Termin erneut öffnen.'});
  const sheet={eventId,...data,version:version+1,mutationId,hash,author:user.id};
  const sheets=[...(row.data.eventRunSheets||[]).filter(d=>d.eventId!==eventId),sheet];
  const saved=await sql`UPDATE app_state SET data=jsonb_set(data,'{eventRunSheets}',${JSON.stringify(sheets)}::jsonb),revision=revision+1,updated_at=now() WHERE id='main' AND revision=${row.revision} RETURNING revision`;
  if(saved.length)return res.json({sheet});
 }
 return res.status(409).json({error:'Gleichzeitige Änderung. Bitte erneut speichern.'});
}
