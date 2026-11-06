const el=id=>document.getElementById(id);
const format=(v,opts)=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',...opts}).format(v);
const dateKey=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(v);
const today=new Date(dateKey(new Date())+'T12:00Z');today.setUTCDate(today.getUTCDate()-today.getUTCDay());el('start').value=today.toISOString().slice(0,10);
let start,groups,seq=0;
function add(day,event){
 const row=document.createElement('div');row.className='event';
 const check=document.createElement('input');check.type='checkbox';check.checked=event.checked;check.ariaLabel='Im PDF anzeigen';
 const time=document.createElement('input');time.type='text';time.style.width='6em';time.value=event.time;time.ariaLabel='Uhrzeit';
 const title=document.createElement('input');title.type='text';title.maxLength=180;title.value=event.title;title.ariaLabel='Veranstaltung';
 const type=document.createElement('select');for(const t of ['Regulär','Hervorheben','Fällt aus'])type.add(new Option(t,t));type.value=event.cancelled?'Fällt aus':event.special?'Hervorheben':'Regulär';
 row.append(check,time,title,type);groups[day].append(row);
}
async function load(){
 const token=++seq;el('days').replaceChildren();el('export').disabled=true;start=el('start').value;const first=new Date(start+'T12:00Z');
 if(first.getUTCDay()!==0){el('status').textContent='Bitte einen Sonntag als Wochenbeginn wählen.';return;}
 el('status').textContent='Gemeindekalender wird geladen …';
 try{const r=await fetch('/api/calendar?week='+start,{cache:'no-store'});if(r.status===401){location.replace('/?einstieg=portal');return;}const data=await r.json();if(!r.ok)throw Error(data.error);if(token!==seq)return;
 groups=[];for(let d=0;d<8;d++){const date=new Date(+first+d*86400000),key=date.toISOString().slice(0,10);const section=document.createElement('section'),h=document.createElement('h2');h.textContent=(d===0?'Heute · ':'')+format(date,{weekday:'long',day:'2-digit',month:'2-digit'});section.append(h);groups[d]=document.createElement('div');section.append(groups[d]);el('days').append(section);
 const events=data.events.filter(e=>(e.allDay?e.start.slice(0,10):dateKey(new Date(e.start)))===key).sort((a,b)=>a.start.localeCompare(b.start));
 for(const e of events){const special=/themen(tag|abend)|männerfrühstück|frauen.?caf[ée]|abendmahl|weihnachts(basar|markt)|adventskonzert/i.test(e.title);
 const regular=/^(gottesdienst|bibelstunde|gebetsstunde|jugend(stunde|kreis)?|kinderstunde|jungschar|teenkreis|krabbelgruppe)(\b|$)/i.test(e.title);add(d,{...e,checked:regular||special,special,time:e.allDay?'Ganztägig':format(new Date(e.start),{hour:'2-digit',minute:'2-digit'}),cancelled:e.cancelled||/fällt aus|abgesagt/i.test(e.title)});}
 const btn=document.createElement('button');btn.textContent='+ Termin ergänzen';btn.onclick=()=>add(d,{checked:true,title:'',time:'19:00'});section.append(btn);}
 el('status').textContent='Nur angehakte Termine erscheinen im PDF. Sondertermine werden grün, Ausfälle rot dargestellt.';el('export').disabled=false;
 }catch(e){if(token===seq)el('status').textContent=e.message;}
}
el('start').onchange=load;el('load').onclick=load;
el('export').onclick=async()=>{const items=[];groups.forEach((g,day)=>{for(const row of g.children){const [check,time,title,type]=row.children;if(check.checked)items.push({day,time:time.value.trim(),title:title.value.trim(),special:type.value==='Hervorheben',cancelled:type.value==='Fällt aus'});}});
 try{if(!items.length)throw Error('Bitte mindestens einen Termin auswählen.');
 const r=await fetch('/api/calendar?weekPdf=1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start,items})});if(!r.ok)throw Error('PDF konnte nicht erstellt werden. Titel und Uhrzeiten prüfen.');
 const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='ECG-Wochenplan-'+start+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){el('status').textContent=e.message;}};
load();
