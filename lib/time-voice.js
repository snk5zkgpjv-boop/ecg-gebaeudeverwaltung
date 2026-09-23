// Civil times are always interpreted in Germany, not in the phone's timezone.
export function berlinLocalISO(date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}$/.test(time||''))throw new Error('Datum und Uhrzeit bitte vollständig angeben.');
 const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number),wall=Date.UTC(y,m-1,d,h,min);
 if(y<2000||y>2100||h>23||min>59||new Date(wall).toISOString().slice(0,10)!==date)throw new Error('Ungültiges Datum oder Uhrzeit.');
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches=[1,2].map(offset=>wall-offset*3600000).filter(ms=>fmt.format(new Date(ms))===`${date} ${time}`);
 if(matches.length!==1)throw new Error('Diese Uhrzeit ist wegen der Zeitumstellung nicht eindeutig oder existiert nicht. Bitte manuell klären.');
 return new Date(matches[0]).toISOString();
}
export function validateVoiceEntries(raw,userId,requestId,now=Date.now()){
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId||''))throw new Error('Ungültige Anfragenummer. Bitte die Eingabe erneut öffnen.');
 if(!Array.isArray(raw)||raw.length<1||raw.length>10)throw new Error('Bitte zwischen einer und zehn Buchungen angeben.');
 const entries=raw.map((e,i)=>{
  const start=berlinLocalISO(e.date,e.startTime),end=berlinLocalISO(e.endDate||e.date,e.endTime);
  if(Date.parse(end)<=Date.parse(start)||Date.parse(end)>now||Date.parse(end)-Date.parse(start)>24*3600000)throw new Error('Zeitraum muss abgeschlossen sein und darf höchstens 24 Stunden dauern. Pausen bitte durch getrennte Buchungen auslassen.');
  if(typeof e.workLabel!=='string'||!e.workLabel.trim()||e.workLabel.length>200||typeof e.note!=='string'||e.note.length>4000)throw new Error('Bitte eine Tätigkeit (max. 200 Zeichen) und eine gültige Bemerkung (max. 4000 Zeichen) angeben.');
  return {id:`voice_${userId}_${requestId}_${i}`,userId,start,end,roomId:'',workLabel:e.workLabel.trim(),note:e.note.trim(),volunteer:e.volunteer===true,source:'voice'};
 });
 for(let i=0;i<entries.length;i++)for(let j=0;j<i;j++)if(overlaps(entries[i],entries[j]))throw new Error('Die neuen Buchungen überschneiden sich. Bitte Zeiten oder Pausen prüfen.');
 return entries;
}
export function overlaps(a,b){return Date.parse(a.start)<Date.parse(b.end)&&Date.parse(b.start)<Date.parse(a.end);}
export function pendingVoiceEntries(existing,entries){
 const pending=[];
 for(const entry of entries){
  const same=existing.find(e=>e.id===entry.id);
  if(same){if(['userId','start','end','workLabel','note','volunteer'].some(k=>(same[k]??false)!==(entry[k]??false)))throw new Error('Diese Anfrage wurde bereits anders gespeichert. Bitte die Übersicht prüfen.');continue;}
  if(existing.some(e=>e.userId===entry.userId&&overlaps(e,entry)))throw new Error('Für diesen Zeitraum gibt es bereits eine Buchung oder Überschneidung. Bitte zuerst die Zeiterfassung prüfen.');
  pending.push(entry);
 }
 return pending;
}
export const voiceSchema={type:'object',additionalProperties:false,properties:{questions:{type:'array',items:{type:'string'}},entries:{type:'array',items:{type:'object',additionalProperties:false,properties:{date:{type:'string'},startTime:{type:'string'},endDate:{type:'string'},endTime:{type:'string'},workLabel:{type:'string'},note:{type:'string'},volunteer:{type:'boolean'}},required:['date','startTime','endDate','endTime','workLabel','note','volunteer']}}},required:['questions','entries']};
