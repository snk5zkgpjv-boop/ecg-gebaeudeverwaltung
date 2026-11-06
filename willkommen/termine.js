const regular={0:['Gottesdienst','10:00'],3:['Bibelstunde','19:00'],5:['Gebetsstunde','19:00']};
const additional=[
 {key:'2026-11-07',time:'09:00',end:'11:00',title:'Männerfrühstück',detail:'Mit Eduard Adam · bis 11:00 Uhr',kind:'breakfast'},
 {key:'2026-11-28',time:'',title:'Adventsmarkt',detail:'Weihnachtsmarkt der ECG Hussenhofen',kind:'market'}
];
const berlinDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
const berlinTime=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
const longDate=new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
const shortDate=new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'});
const stream='https://www.ecg-online.de/medien/livestream/video/';
const source='https://www.ecg-online.de/termine/';
const dayOf=event=>new Date(event.key+'T12:00:00Z');
const moment=(event,fmt)=>fmt.format(dayOf(event))+(event.time?' · '+event.time+' Uhr':'');
const order=(a,b)=>a.key.localeCompare(b.key)||a.time.localeCompare(b.time);
function upcoming(entries,now){
 const today=berlinDay.format(now),time=berlinTime.format(now);
 return entries.filter(e=>e.key>today || (e.key===today && (!e.end || time<e.end))).sort(order);
}
export function publicEvents(now,program=[]){
 const today=berlinDay.format(now),day=new Date(today+'T12:00:00Z');
 const events=[...program];
 for(let i=0;i<17;i++,day.setUTCDate(day.getUTCDate()+1)){
  const key=day.toISOString().slice(0,10),item=regular[day.getUTCDay()];
  if(item && !program.some(e=>e.key===key && e.time===item[1]))events.push({key,time:item[1],title:item[0],regular:true});
 }
 return upcoming(events,now).slice(0,5);
}
function mergeProgram(entries){
 const list=[...entries];
 for(const item of additional){
  const match=list.find(e=>e.key===item.key && (e.title.toLowerCase().includes(item.title.toLowerCase()) || (item.kind==='market' && /weihnachtsmarkt/i.test(e.title))));
  if(match){Object.assign(match,{kind:item.kind,end:item.end,time:match.time||item.time});}
  else list.push(item);
 }
 return list.sort(order);
}
let program=mergeProgram([]),slides=[],index=0,paused=false,loading=false;
const $=id=>document.getElementById(id);
function cards(now){
 const seen=new Set();
 return upcoming(program,now).filter(e=>{
  const name=e.title.toLowerCase();
  if(seen.has(name))return false;
  seen.add(name);return true;
 });
}
function kind(event){
 if(!event)return 'welcome';
 if(event.kind)return event.kind;
 if(event.key==='2026-12-13' && /adventskonzert/i.test(event.title))return 'concert';
 return /eduard adam/i.test(event.title)?'themes':'general';
}
function draw(){
 const slide=slides[index],type=kind(slide),hero=$('guest-banner');
 hero.dataset.kind=type;
 $('banner-when').textContent=slide?moment(slide,longDate):'ECG Hussenhofen';
 $('banner-title').textContent=slide?.title||'Herzlich willkommen.';
 $('banner-detail').textContent=slide?.detail||'Evangeliums-Christengemeinde Hussenhofen';
 $('banner-link').href=slide?(slide.kind?'#naechste-termine':source):'#naechste-termine';
 $('banner-link').textContent=slide && !slide.kind?'Zum Programm ↗':'Zu den Terminen ↓';
 $('banner-count').textContent=(index+1)+' / '+slides.length;
 $('banner-controls').hidden=slides.length<2;
}
function render(){
 const now=new Date(),old=slides[index]?.title;
 slides=[null,...cards(now)];index=old?Math.max(0,slides.findIndex(s=>s?.title===old)):0;draw();
 const [first,...rest]=publicEvents(now,program);
 $('when').textContent=(first.key===berlinDay.format(now)?'Heute · ':'')+moment(first,longDate);
 $('title').textContent=first.title;
 $('note').textContent=first.regular?'Der Link öffnet die Videoseite der ECG.':[first.detail,(!first.kind?'Übertragung für diesen Sondertermin nicht bestätigt.':'')].filter(Boolean).join(' · ');
 const video=document.querySelector('.video');video.hidden=Boolean(first.kind);video.href=stream;
 $('rows').replaceChildren(...rest.map(event=>{
  const row=document.createElement('div');row.className='row';
  const time=document.createElement('time');time.dateTime=event.key+(event.time?'T'+event.time:'');time.textContent=moment(event,shortDate);
  row.append(time,document.createTextNode(event.title));return row;
 }));
}
function step(delta){index=(index+delta+slides.length)%slides.length;draw();}
function pause(value){paused=value;$('banner-pause').textContent=paused?'Abspielen':'Pause';}
async function refresh(){
 if(loading)return;loading=true;
 try{
  const r=await fetch('/api/public-program',{signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error();
  const {entries}=await r.json();
  program=mergeProgram(entries);
  try{localStorage.setItem('ecg-public-program-v1',JSON.stringify(entries));}catch{}
  render();
 }catch{/* Der zuletzt geladene öffentliche Stand bleibt sichtbar. */}
 finally{loading=false;}
}
async function start(){
 let previous;
 try{previous=JSON.parse(localStorage.getItem('ecg-public-program-v1'));}catch{}
 if(!Array.isArray(previous)){try{previous=await (await fetch('/willkommen/programm-stand.json')).json();}catch{previous=[];}}
 program=mergeProgram(previous);render();
 pause(matchMedia('(prefers-reduced-motion: reduce)').matches);
 $('banner-prev').onclick=()=>{pause(true);step(-1);};
 $('banner-next').onclick=()=>{pause(true);step(1);};
 $('banner-pause').onclick=()=>pause(!paused);
 let touch=null;
 const hero=$('guest-banner');
 hero.addEventListener('touchstart',e=>{touch=e.touches[0].clientX;},{passive:true});
 hero.addEventListener('touchend',e=>{if(touch===null)return;const dx=e.changedTouches[0].clientX-touch;touch=null;if(Math.abs(dx)>55){pause(true);step(dx<0?1:-1);}},{passive:true});
 setInterval(()=>{if(!paused&&!document.hidden && !hero.contains(document.activeElement))step(1);},8000);
 setInterval(render,60000);setInterval(()=>{if(!document.hidden)refresh();},600000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
 refresh();
}
if(typeof document!=='undefined')start();
