const labels={pending:'Angefragt',accepted:'Zugesagt',declined:'Abgelehnt',withdrawn:'Zurückgezogen'};
const node=(tag,txt)=>{const e=document.createElement(tag);e.textContent=txt;return e;};
async function api(account,eventId,body){
 const url='/api/state?duties=1'+(eventId?'&eventId='+encodeURIComponent(eventId):'');
 const res=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{'X-ECG-User-Id':account,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await res.json();
 if(!res.ok)throw Error(data.error||'Dienstanfragen konnten nicht geladen werden.');
 return data;
}
function control(label,action,notice){
 const b=node('button',label);b.type='button';b.className='btn';
 b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){notice.textContent=e.message;}finally{b.disabled=false;}};
 return b;
}
export function addDutyPlanner(view,account,eventId){
 const box=document.createElement('section');box.className='duty-planner';
 const notice=node('p','');notice.setAttribute('role','status');
 const list=document.createElement('div');
 const button=control('Dienste einteilen',load,notice);
 box.append(button,notice,list);view.querySelector('.modal').append(box);
 async function load(){
  const {accounts,requests}=await api(account,eventId);
  if(!view.isConnected)return;
  list.replaceChildren();notice.textContent='';button.hidden=true;
  const title=node('label','Dienst'),input=document.createElement('input');input.maxLength=120;input.placeholder='z. B. Moderation';title.append(input);
  const who=node('label','Personal mit aktivem Benutzerkonto'),select=document.createElement('select');
  select.add(new Option('Person auswählen',''));
  for(const p of accounts){
   const opt=new Option(p.name+(p.unavailable?' · nicht verfügbar':''),p.id);opt.disabled=p.unavailable;select.add(opt);
  }
  who.append(select);
  let requestId=crypto.randomUUID();input.oninput=select.onchange=()=>{requestId=crypto.randomUUID();};
  const send=control('Dienst anfragen',async()=>{
   if(!input.value.trim()||!select.value)throw Error('Bitte Dienst und Person angeben.');
   await api(account,eventId,{action:'request',id:requestId,label:input.value,assignee:select.value});await load();
  },notice);
  list.append(node('h3','Dienstanfragen'),title,who,send);
  for(const r of requests){
   const line=node('p',r.label+' · '+(accounts.find(p=>p.id===r.assignee)?.name||'Konto inaktiv')+' · '+labels[r.status]);
   if(['pending','accepted'].includes(r.status))line.append(' ',control('Zurückziehen',async()=>{
    await api(account,eventId,{action:'withdraw',id:r.id,version:r.version});await load();
   },notice));
   list.append(line);
  }
 }
}
export async function personalDuties(account){
 const box=document.getElementById('personal-duties');
 let generation=0;
 async function load(){
  const ticket=++generation;
  const {requests}=await api(account,'');
  if(ticket!==generation)return;
  box.replaceChildren();box.hidden=!requests.length;
  if(!requests.length)return;
  const notice=node('p','');notice.setAttribute('role','status');
  box.append(node('h2','Meine Dienste'),notice);
  for(const r of requests){
   const card=document.createElement('article'),when=new Date(r.starts_at).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'});
   card.append(node('h3',r.label),node('p',when+' · '+r.event_title),node('p',labels[r.status]));
   if(r.status==='pending')for(const [action,label] of [['accept','Zusagen'],['decline','Absagen']]){
    card.append(control(label,async()=>{await api(account,'',{id:r.id,action,version:r.version});await load();},notice));
   }
   box.append(card);
  }
 }
 async function refresh(){
  box.replaceChildren();box.hidden=true;
  try{await load();}catch(e){box.hidden=false;box.textContent=e.message;}
 }
 function conceal(){generation++;box.replaceChildren();box.hidden=true;}
 window.addEventListener('pagehide',conceal);
 window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();else refresh();});
 await refresh();
}
