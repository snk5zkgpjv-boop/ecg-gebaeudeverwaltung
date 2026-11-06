import {serviceAccountAccessToken} from './google-calendar-token.js';

export function personnelCalendarId(){
 const id=process.env.ECG_PASTORAL_ABSENCE_CALENDAR_ID?.trim();
 return id&&id!==process.env.GOOGLE_CALENDAR_ID?.trim()?id:null;
}
export function nextDay(value){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
const normal=text=>String(text||'').normalize('NFC').toLocaleLowerCase('de').trim();
const matchName=(text,name)=>name&&(' '+normal(text).replace(/[^\p{L}\p{N}]+/gu,' ')+' ').includes(' '+normal(name).replace(/[^\p{L}\p{N}]+/gu,' ')+' ');
function day(value){
 return value.date||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(value.dateTime));
}
function endDay(event){
 if(event.end?.date){const d=new Date(event.end.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
 return day({dateTime:new Date(Date.parse(event.end.dateTime)-1).toISOString()});
}
async function calendar(write=false){
 const id=personnelCalendarId();if(!id)throw Error('Abwesenheitskalender noch nicht verbunden.');
 const token=await serviceAccountAccessToken(write?'https://www.googleapis.com/auth/calendar.events':undefined);
 if(!token)throw Error('Kalenderzugang fehlt.');
 return {url:'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(id)+'/events',headers:{authorization:'Bearer '+token,'content-type':'application/json'}};
}
async function events(client,start,end){
 // Include both Berlin offset variants, then clip precisely by Berlin dates.
 const url=new URL(client.url);url.searchParams.set('timeMin',start+'T00:00:00+02:00');url.searchParams.set('timeMax',nextDay(end)+'T00:00:00+01:00');
 url.searchParams.set('singleEvents','true');url.searchParams.set('maxResults','250');const result=[];
 do{
  const r=await fetch(url,{headers:client.headers,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Abwesenheitskalender konnte nicht gelesen werden.');
  const page=await r.json();result.push(...(page.items||[]).filter(e=>e.status!=='cancelled'&&day(e.start)<=end&&endDay(e)>=start));
  if(!page.nextPageToken)break;url.searchParams.set('pageToken',page.nextPageToken);
 }while(true);
 return result;
}
export async function calendarBusy(month,accounts){
 const last=new Date(month+'-01T12:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
 const list=await events(await calendar(),month+'-01',last.toISOString().slice(0,10));
 return list.map(e=>({id:e.id,requestId:e.extendedProperties?.private?.ecgAbsenceId||null,
  owner:accounts.find(p=>p.teams.includes('pastoral')&&matchName(e.summary,p.name))?.name||null,starts:day(e.start),ends:endDay(e)}));
}
export async function publishAbsence(row,owner){
 const client=await calendar(true),id='ecg'+row.id.replaceAll('-','');
 const list=await events(client,row.starts,row.ends);
 if(list.some(e=>e.id===id&&e.extendedProperties?.private?.ecgAbsenceId===row.id))return;
 if(list.some(e=>matchName(e.summary,owner)))throw Error('Überschneidender Google-Eintrag für diese Person vorhanden. Bitte zuerst im Kalender prüfen.');
 const r=await fetch(client.url,{method:'POST',headers:client.headers,signal:AbortSignal.timeout(15000),body:JSON.stringify({id,summary:owner+' – abwesend',start:{date:row.starts},end:{date:nextDay(row.ends)},extendedProperties:{private:{ecgAbsenceId:row.id}}})});
 if(!r.ok)throw Error('Übertragung nicht bestätigt. Bitte Kalenderzugriff prüfen und erneut versuchen.');
}
