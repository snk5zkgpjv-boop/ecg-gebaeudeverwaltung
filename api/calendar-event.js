import { neon } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { serviceAccountAccessToken } from '../lib/google-calendar-token.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt'});
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Datenbank nicht eingerichtet'});
  const sql=neon(process.env.DATABASE_URL);
  const auth=await requireUser(req,res,sql);
  if(!auth)return;
  if(auth.profile.role==='technician'||!(auth.profile.role==='admin'||auth.profile.permissions?.manageCalendar))
    return res.status(403).json({error:'Keine Berechtigung zur Terminplanung'});
  if(process.env.GOOGLE_CALENDAR_WRITE_ENABLED!=='true')
    return res.status(503).json({error:'Google-Schreibzugriff ist noch nicht freigegeben.'});
  const calendarId=String(process.env.GOOGLE_CALENDAR_ID||'').trim();
  if(!calendarId || !(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)))
    return res.status(503).json({error:'Google-Kalender-Schreibkonto ist nicht vollständig eingerichtet.'});
  const {title,start,end,roomId}=req.body||{};
  if(typeof title!=='string'||!title.trim()||title.length>180||
     typeof start!=='string'||typeof end!=='string'||typeof roomId!=='string'||roomId.length>160)
    return res.status(400).json({error:'Titel, Zeit und Raum müssen angegeben werden.'});
  // Require explicit timezone or Z to avoid local/UTC ambiguity.
  if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(start)||!/(?:Z|[+-]\d{2}:\d{2})$/.test(end))
    return res.status(400).json({error:'Termine benötigen einen eindeutigen Zeitzonenoffset.'});
  const from=Date.parse(start),to=Date.parse(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>14*86400000)
    return res.status(400).json({error:'Ungültiger Zeitraum.'});
  const rows=await sql`SELECT data->'rooms' AS rooms FROM app_state WHERE id='main'`;
  const room=(rows[0]?.rooms||[]).find(r=>r.id===roomId);
  if(!room)return res.status(400).json({error:'Raum nicht gefunden.'});
  const url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  try{
    const token=await serviceAccountAccessToken('https://www.googleapis.com/auth/calendar.events');
    if(!token)return res.status(503).json({error:'Google-Schreibkonto nicht verfügbar.'});
    const headers={authorization:`Bearer ${token}`,accept:'application/json'};
    const listUrl=new URL(url);
    listUrl.searchParams.set('timeMin',new Date(from).toISOString());
    listUrl.searchParams.set('timeMax',new Date(to).toISOString());
    listUrl.searchParams.set('singleEvents','true');
    listUrl.searchParams.set('maxResults','2500');
    // Fail closed on pagination rather than silently missing conflicts.
    let conflicts=[];
    const pages=new Set();
    do{
      const list=await fetch(listUrl,{headers,signal:AbortSignal.timeout(15000)});
      if(!list.ok)throw new Error('Google-Kalender kann nicht auf Buchungskonflikte geprüft werden.');
      const body=await list.json();
      conflicts.push(...(body.items||[]).filter(ev=>
        ev.status!=='cancelled'&&ev.transparency!=='transparent'&&
        (String(ev.location||'').trim().toLocaleLowerCase('de-DE')===String(room.name).trim().toLocaleLowerCase('de-DE') ||
         (Array.isArray(room.calendarAliases)&&room.calendarAliases.some(a=>String(a).trim().toLocaleLowerCase('de-DE')===String(ev.location||'').trim().toLocaleLowerCase('de-DE')))) &&
        Date.parse(ev.start?.dateTime||ev.start?.date)<to&&Date.parse(ev.end?.dateTime||ev.end?.date)>from));
      if(!body.nextPageToken)break;
      if(pages.has(body.nextPageToken))throw new Error('Kalender-Konfliktprüfung unvollständig.');
      pages.add(body.nextPageToken);
      listUrl.searchParams.set('pageToken',body.nextPageToken);
    }while(true);
    if(conflicts.length)return res.status(409).json({error:'Der Raum ist im ausgewählten Zeitraum bereits belegt.'});
    const event={summary:title.trim(),location:room.name,description:'',start:{dateTime:new Date(from).toISOString(),timeZone:'Europe/Berlin'},end:{dateTime:new Date(to).toISOString(),timeZone:'Europe/Berlin'}};
    const created=await fetch(url,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(15000)});
    if(!created.ok){console.error('google calendar event create failed',created.status);return res.status(502).json({error:'Google Kalender hat den Termin nicht angenommen.'});}
    const body=await created.json();
    return res.status(201).json({ok:true,id:body.id,roomId:room.id});
  }catch(e){console.error('calendar event create error',e?.message);return res.status(502).json({error:'Termin konnte nicht erstellt werden. Bitte Google Kalender kontrollieren, bevor du es erneut versuchst.'});}
}
