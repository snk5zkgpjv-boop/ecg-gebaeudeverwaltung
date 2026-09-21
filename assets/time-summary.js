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
function personalTimeWeeks(entries,userId,now=Date.now()){
 const current=timeSummaryMonday(now),weeks=new Map([[current,0],[current-7*timeSummaryDay,0]]);
 for(const e of entries||[]){
  if(e.userId!==userId||!e.start||!e.end)continue;
  const start=Date.parse(e.start),end=Date.parse(e.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now)continue;
  let cursor=start,monday=timeSummaryMonday(start);
  while(cursor<end){const boundary=timeSummaryMidnight(monday+7*timeSummaryDay),stop=Math.min(end,boundary);weeks.set(monday,(weeks.get(monday)||0)+stop-cursor);cursor=stop;monday+=7*timeSummaryDay;}
 }
 return [...weeks].sort(([a],[b])=>b-a).map(([monday,ms])=>({monday,ms,label:timeSummaryWeekLabel(monday),relative:monday===current?'Diese Woche':monday===current-7*timeSummaryDay?'Letzte Woche':''}));
}
function timeSummaryDuration(ms){const minutes=Math.round(ms/60000);return `${Math.floor(minutes/60)} Std. ${String(minutes%60).padStart(2,'0')} Min.`;}
function recentPersonalTimeEntries(entries,userId){return (entries||[]).filter(e=>e.userId===userId&&e.end).slice().sort((a,b)=>Date.parse(b.start)-Date.parse(a.start)).slice(0,3);}
function personalTimeSummaryHtml(){
 const weeks=personalTimeWeeks(state.timeEntries,state.currentUserId);
 const date=value=>new Date(value).toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit'});
 return `<section aria-label="Meine Wochenstunden"><h3>Meine Stunden je Kalenderwoche</h3><p class="meta">Montag bis Sonntag · abgeschlossene eigene Zeitbuchungen, einschließlich freiwilliger Dienste. Laufende Timer zählen nach dem Beenden. Zeitzone: Deutschland.</p><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th scope="col" style="text-align:left">Kalenderwoche</th><th scope="col" style="text-align:right">Geleistet</th></tr></thead><tbody>${weeks.map(w=>`<tr><td style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${w.relative?`${w.relative} · `:''}${w.label}</b><div class="meta">${date(w.monday)}–${date(w.monday+6*timeSummaryDay)}</div></td><td style="text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)">${timeSummaryDuration(w.ms)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row" style="text-align:left;padding-top:12px">Gesamt erfasst</th><td style="text-align:right;white-space:nowrap;padding-top:12px"><b>${timeSummaryDuration(weeks.reduce((sum,w)=>sum+w.ms,0))}</b></td></tr></tfoot></table></div></section>`;
}
