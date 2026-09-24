// Read-only personal totals, ISO weeks in Europe/Berlin regardless of device timezone.
const timeSummaryDay=86400000;
function timeSummaryMonday(value){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const d=new Date(Date.UTC(+p.year,+p.month-1,+p.day));
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.getTime();
}
function timeSummaryMidnight(day){
 const zone=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',timeZoneName:'shortOffset'}).formatToParts(new Date(day)).find(p=>p.type==='timeZoneName').value;
 const m=zone.match(/GMT([+-])(\d+)(?::(\d+))?/);
 const offset=m?(m[1]==='-'?-1:1)*(+m[2]*60+(+m[3]||0)):0;
 return day-offset*60000;
}
function timeSummaryWeekLabel(monday){
 const thursday=new Date(monday+3*timeSummaryDay),year=thursday.getUTCFullYear();
 const week=Math.ceil(((thursday-Date.UTC(year,0,1))/timeSummaryDay+1)/7);
 return `KW ${week} / ${year}`;
}
function completedTimeBounds(entry,now=Date.now()){
 if(!entry?.start||!entry.end)return null;
 const start=Date.parse(entry.start),end=Date.parse(entry.end);
 return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=now?{start,end}:null;
}
function personalTimeWeeks(entries,userId,now=Date.now()){
 const current=timeSummaryMonday(now),weeks=new Map([[current,0],[current-7*timeSummaryDay,0]]);
 for(const e of entries||[]){
  if(e.userId!==userId)continue;
  const bounds=completedTimeBounds(e,now);if(!bounds)continue;
  const {start,end}=bounds;
  let cursor=start,monday=timeSummaryMonday(start);
  while(cursor<end){const boundary=timeSummaryMidnight(monday+7*timeSummaryDay),stop=Math.min(end,boundary);weeks.set(monday,(weeks.get(monday)||0)+stop-cursor);cursor=stop;monday+=7*timeSummaryDay;}
 }
 return [...weeks].sort(([a],[b])=>b-a).map(([monday,ms])=>({monday,ms,label:timeSummaryWeekLabel(monday),relative:monday===current?'Diese Woche':monday===current-7*timeSummaryDay?'Letzte Woche':''}));
}
function timeSummaryDuration(ms){
 if(!Number.isFinite(ms)||ms<0)return 'Ungültige Dauer';
 const seconds=Math.round(ms/1000),minutes=Math.floor(seconds/60),rest=seconds%60;
 return `${Math.floor(minutes/60)} Std. ${String(minutes%60).padStart(2,'0')} Min.${rest?` ${String(rest).padStart(2,'0')} Sek.`:''}`;
}
function recentPersonalTimeEntries(entries,userId,now=Date.now()){return (entries||[]).filter(e=>e.userId===userId&&completedTimeBounds(e,now)).slice().sort((a,b)=>Date.parse(b.start)-Date.parse(a.start)).slice(0,3);}
function personalTimeWeekEntries(entries,userId,monday,now=Date.now()){
 const from=timeSummaryMidnight(monday),until=timeSummaryMidnight(monday+7*timeSummaryDay);
 return (entries||[]).filter(e=>e.userId===userId).map(entry=>{
  const bounds=completedTimeBounds(entry,now);if(!bounds)return null;
  const {start,end}=bounds;
  if(end<=from||start>=until)return null;
  const clippedStart=Math.max(start,from),clippedEnd=Math.min(end,until);
  return {entry,start:clippedStart,end:clippedEnd,ms:clippedEnd-clippedStart,partial:start<from||end>until};
 }).filter(Boolean).sort((a,b)=>a.start-b.start);
}
function timeWeekDate(value){return new Date(value).toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});}
function timeWeekRange(monday){return `${timeWeekDate(monday)} - ${timeWeekDate(monday+6*timeSummaryDay)}`;}
function timeWeekEntryTable(rows,editable=false){
 const stamp=value=>new Date(value).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 return `<table class="time-week-table" style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th scope="col">Datum / Uhrzeit</th><th scope="col">Tätigkeit / Bemerkung</th><th scope="col">Dauer</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td style="vertical-align:top;padding:10px 8px 10px 0;border-bottom:1px solid #ddd">${stamp(r.start)}<br>bis ${stamp(r.end)}${r.partial?'<br><small>Wochenanteil</small>':''}</td><td style="vertical-align:top;padding:10px 8px;border-bottom:1px solid #ddd;white-space:pre-wrap;overflow-wrap:anywhere"><b>${esc(timeEntryLabel(r.entry))}</b>${r.entry.note?`<br>${esc(r.entry.note)}`:''}${r.entry.volunteer?'<br><small>Freiwilliger Dienst</small>':''}${editable&&r.entry.userId===state.currentUserId&&state.currentRole!=='technician'?`<div class="row wrap no-print" style="margin-top:8px"><button class="btn tiny" onclick="closeModal();editTimeEntry(${esc(JSON.stringify(r.entry.id))})">Bearbeiten</button><button class="btn tiny danger" onclick="closeModal();deleteTimeEntry(${esc(JSON.stringify(r.entry.id))})">Löschen</button></div>`:''}</td><td style="vertical-align:top;padding:10px 0 10px 8px;border-bottom:1px solid #ddd">${timeSummaryDuration(r.ms)}</td></tr>`).join(''):'<tr><td colspan="3" style="padding:16px 0">Keine abgeschlossenen eigenen Buchungen in dieser Woche.</td></tr>'}</tbody></table><p><b>Wochensumme: ${timeSummaryDuration(rows.reduce((sum,r)=>sum+r.ms,0))}</b></p>`;
}
function openPersonalTimeWeek(monday){
 if(state.currentRole==='technician'||!Number.isFinite(monday))return;
 const rows=personalTimeWeekEntries(state.timeEntries,state.currentUserId,monday);
 modal(`<h2>${timeSummaryWeekLabel(monday)}</h2><p>${timeWeekRange(monday)}</p><div class="row wrap"><button class="btn primary" onclick="exportPersonalTimeWeeks(${monday})">Woche als PDF / Drucken</button></div><div style="overflow-x:auto;margin-top:16px">${timeWeekEntryTable(rows,true)}</div><p class="meta">Eigene abgeschlossene Zeiten · Deutschland. Bei wochenübergreifenden Buchungen wird nur der Anteil dieser Woche angezeigt. Bearbeiten und Löschen betreffen die gesamte Buchung. Einzelzeiten und Summen sind auf Sekunden gerundet; kleine Rundungsabweichungen sind möglich.</p><button class="btn" onclick="closeModal()">Zurück zur Übersicht</button>`);
}
function personalTimeExportHtml(monday=null,now=Date.now()){
 const weeks=personalTimeWeeks(state.timeEntries,state.currentUserId,now).filter(w=>monday===null||w.monday===monday);
 const name=currentUser()?.name||'Eigene Arbeitszeiten';
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ECG Zeiterfassung - ${monday===null?'Alle Kalenderwochen':timeSummaryWeekLabel(monday)}</title><style>@page{size:A4;margin:16mm;@bottom-center{content:"Seite " counter(page);font-size:9pt;color:#666}}*{box-sizing:border-box}body{font:11pt Arial,sans-serif;color:#1c2833;max-width:1000px;margin:24px auto;padding:0 16px}h1{font-size:20pt;margin-bottom:8px}h2{font-size:16pt;color:#24504d}p{line-height:1.5}.week{break-before:page}.week:first-of-type{break-before:auto}table{table-layout:fixed;font-size:10pt}th{padding:10px 4px;background:#edf3f2;border-bottom:2px solid #24504d}th:first-child{width:29%}th:last-child{width:20%}td{overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}small,.meta{color:#59656c}.controls{padding:16px;background:#edf3f2;margin-bottom:24px}button{font:inherit;padding:12px;cursor:pointer}@media print{body{max-width:none;margin:0;padding:0}.controls{display:none}}@media screen and (max-width:600px){table{font-size:9pt}}</style></head><body><div class="controls"><button onclick="window.print()">Drucken / als PDF sichern</button><p>Im Druckdialog als PDF sichern oder ausdrucken. Auf dem iPhone die Druckvorschau öffnen und über Teilen in Dateien sichern.</p></div><h1>ECG - Arbeitszeitnachweis</h1><p><b>${esc(name)}</b><br>Eigene abgeschlossene Buchungen, einschließlich freiwilliger Dienste.<br>Zeitzone: Deutschland. Wochenübergreifende Buchungen sind anteilig zugeordnet.<br>Einzelzeiten und Summen sind auf Sekunden gerundet; kleine Rundungsabweichungen sind möglich.</p>${weeks.map(w=>`<section class="week"><h2>${w.label}</h2><p>${timeWeekRange(w.monday)}</p>${timeWeekEntryTable(personalTimeWeekEntries(state.timeEntries,state.currentUserId,w.monday,now))}</section>`).join('')}<p><b>Gesamtsumme dieses Exports: ${timeSummaryDuration(weeks.reduce((sum,w)=>sum+w.ms,0))}</b></p></body></html>`;
}
function exportPersonalTimeWeeks(monday=null){
 if(state.currentRole==='technician')return;
 const html=personalTimeExportHtml(monday),w=window.open('','_blank');
 if(!w){alert('Bitte Pop-ups für den PDF-/Druckexport erlauben.');return;}
 w.document.open();w.document.write(html);w.document.close();w.focus();
}
function personalTimeSummaryHtml(){
 const weeks=personalTimeWeeks(state.timeEntries,state.currentUserId);
 const date=value=>new Date(value).toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit'});
 return `<section aria-label="Meine Wochenstunden"><h3>Meine Stunden je Kalenderwoche</h3><p class="meta">Kalenderwoche antippen, um die zugehörigen Einträge zu sehen.</p><button class="btn" onclick="exportPersonalTimeWeeks()">Alle Wochen als PDF / Drucken</button><p class="meta">Montag bis Sonntag · abgeschlossene eigene Zeitbuchungen, einschließlich freiwilliger Dienste. Laufende Timer zählen nach dem Beenden. Zeitzone: Deutschland. Einzelzeiten und Summen sind auf Sekunden gerundet; kleine Rundungsabweichungen sind möglich.</p><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th scope="col" style="text-align:left">Kalenderwoche</th><th scope="col" style="text-align:right">Geleistet</th></tr></thead><tbody>${weeks.map(w=>`<tr><td style="padding:10px 0;border-bottom:1px solid var(--line)"><button class="btn soft" onclick="openPersonalTimeWeek(${w.monday})" aria-label="${w.label}: Einträge anzeigen"><b>${w.relative?`${w.relative} · `:''}${w.label}</b></button><div class="meta">${date(w.monday)}–${date(w.monday+6*timeSummaryDay)}</div></td><td style="text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)">${timeSummaryDuration(w.ms)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row" style="text-align:left;padding-top:12px">Gesamt erfasst</th><td style="text-align:right;white-space:nowrap;padding-top:12px"><b>${timeSummaryDuration(weeks.reduce((sum,w)=>sum+w.ms,0))}</b></td></tr></tfoot></table></div></section>`;
}
