const el=id=>document.getElementById(id);
const views={eigene:'Meine Abwesenheiten',team:'Teamkalender',freigaben:'Freigaben & Vertretungen'};
const teamNames={pastoral:'Pastoren & Älteste',building:'Hausmeister & Reinigung'};
const statuses={approved:'Genehmigt',pending:'Zur Freigabe',declined:'Abgelehnt',cancelled:'Zurückgezogen'};
const coverage={confirmed:'Zugesagt',asked:'Angefragt',declined:'Abgelehnt',open:'Offen'};
const selected=new URLSearchParams(location.search).get('ansicht');
const scope=Object.hasOwn(views,selected)?selected:'eigene';
let user,state,requestId=crypto.randomUUID(),generation=0;
el('heading').textContent=views[scope];document.title=views[scope]+' · ECG';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
el('month').value=today.slice(0,7);
async function api(body){
 const url='/api/state?personnel='+scope+'&month='+encodeURIComponent(el('month').value);
 const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{'X-ECG-User-Id':user.appUserId,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await r.json();if(!r.ok)throw Error(result.error||'Abruf fehlgeschlagen.');return result;
}
const pretty=s=>s.split('-').reverse().join('.');
const name=id=>state.accounts.find(a=>a.id===id)?.name||'Teammitglied';
function candidates(team,owner){
 const roster=state.roster||[],group=roster.find(p=>p.account_id===owner)?.cover_group;
 const active=state.accounts.filter(a=>a.id!==owner&&a.teams.includes(team));
 if(team==='building'&&group==='caretaker')return active.filter(a=>state.diakonie.includes(a.id));
 if(team==='building'&&group==='cleaning')return roster.filter(p=>p.account_id!==owner).map(p=>{
  const a=active.find(a=>a.id===p.account_id);
  return a||{id:'staff:'+p.id,name:p.name+' (vormerken – ohne Teamzugang)'};
 });
 return active;
}
function selection(value){return value.startsWith('staff:')?{planned:value.slice(6)}:{deputy:value};}
function deputies(){el('deputy').replaceChildren(new Option('Noch offen',''),...candidates(el('team').value,user.appUserId).map(a=>new Option(a.name,a.id)));}
function item(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function render(){
 const list=el('entries');list.replaceChildren();
 const rows=state.rows;if(!rows.length)list.append(item('p',scope==='team'?'Keine bestätigten Abwesenheiten in diesem Monat.':'Keine Vorgänge vorhanden.'));
 for(const row of rows){
  const card=document.createElement('article');
  card.append(item('h3',name(row.owner_id)),item('p',pretty(row.starts)+' – '+pretty(row.ends)+' · '+teamNames[row.team]));
  if(scope!=='team')card.append(item('p',row.kind+' · '+statuses[row.status]));
  card.append(item('p','Vertretung: '+(row.deputy_id?name(row.deputy_id)+' · ':'')+coverage[row.coverage]));
  if(row.planned_staff){const p=state.roster.find(p=>p.id===row.planned_staff);card.append(item('p','Vorgemerkt: '+(p?.name||'Personal')+' · Zusage offen'));}
  if(row.handover){const text=item('p',row.handover);text.style.whiteSpace='pre-line';card.append(item('h4','Aufgaben für die Vertretung'),text);}
  if(scope!=='team'&&['approved','pending'].includes(row.status)&&(row.owner_id===user.appUserId||scope==='freigaben')){
   const edit=item('button','Aufgaben bearbeiten');card.append(edit);
   edit.onclick=()=>{edit.disabled=true;const label=item('label','Übergabeaufgaben'),area=document.createElement('textarea');area.maxLength=4000;area.rows=6;area.value=row.handover||'';label.append(area);const save=item('button','Aufgaben speichern');card.append(label,save);
    save.onclick=async()=>{save.disabled=true;try{await api({action:'handover',id:row.id,version:row.version,handover:area.value});await reload();}catch(e){el('notice').textContent=e.message;save.disabled=false;}};};
  }
  if(scope==='freigaben'&&row.status==='pending'){
   const overlap=rows.filter(other=>other.id!==row.id&&other.team===row.team&&other.status==='approved'&&other.starts<=row.ends&&other.ends>=row.starts);
   if(overlap.length)card.append(item('p','Überschneidung mit genehmigter Abwesenheit: '+overlap.map(other=>name(other.owner_id)).join(', ')));
   action(card,row,'approve','Genehmigen');action(card,row,'decline','Ablehnen');
  }
  if(scope==='freigaben'&&row.status==='approved'&&row.team==='pastoral'&&state.linked)action(card,row,'publish','In Google-Kalender übernehmen');
  if(row.deputy_id===user.appUserId&&row.coverage==='asked'&&['pending','approved'].includes(row.status)){action(card,row,'cover','Vertretung zusagen');action(card,row,'refuse','Vertretung ablehnen');}
  if(['pending','approved'].includes(row.status)&&(scope==='freigaben'||row.owner_id===user.appUserId)){
   const options=candidates(row.team,row.owner_id).filter(p=>p.id!==row.deputy_id);
   if(options.length){
    const label=item('label','Vertretung anfragen'),select=document.createElement('select');
    select.append(new Option('Person wählen',''),...options.map(p=>new Option(p.name,p.id)));label.append(select);card.append(label);
    const button=item('button','Anfragen');button.disabled=true;select.onchange=()=>{button.disabled=!select.value;};
    button.onclick=async()=>{button.disabled=true;try{await api({action:'nominate',id:row.id,version:row.version,...selection(select.value)});await reload();}catch(e){el('notice').textContent=e.message;button.disabled=false;}};card.append(button);
   }
  }
  if(row.owner_id===user.appUserId&&row.status==='pending'&&scope==='eigene')action(card,row,'cancel','Antrag zurückziehen');
  list.append(card);
 }
 if(scope==='team'&&state.teams.includes('pastoral')){
  list.append(item('h2','Gemeinsamer Abwesenheitskalender'));
  if(!state.linked||state.calendarError)list.append(item('p',state.calendarError||'Der neue Google-Kalender ist noch nicht angebunden.'));
  else{
   const external=state.external.filter(e=>!rows.some(row=>row.id===e.requestId));
   if(!external.length)list.append(item('p','Keine zusätzlichen Kalendereinträge in diesem Monat.'));
   for(const e of external){const card=document.createElement('article');card.append(item('h3',e.owner||'Abwesenheit'),item('p',pretty(e.starts)+' – '+pretty(e.ends)+' · Google-Kalender'));list.append(card);}
  }
 }
}
function action(card,row,action,label){const button=item('button',label);card.append(button);button.onclick=async()=>{
 button.disabled=true;try{await api({action,id:row.id,version:row.version});await reload();if(action==='publish')el('notice').textContent='Übertragung bestätigt.';}catch(e){el('notice').textContent=e.message;}finally{button.disabled=false;}
};}
async function reload(){
 const n=++generation;const data=await api();if(n!==generation)return;state=data;render();el('notice').textContent='';
 if(scope==='eigene'&&el('request').hidden){el('team').replaceChildren(...state.teams.map(t=>new Option(teamNames[t],t)));deputies();el('handover').value=state.template;el('request').hidden=false;}
 el('month-field').hidden=scope!=='team';
}
el('month').onchange=()=>reload().catch(e=>el('notice').textContent=e.message);
el('starts').onchange=()=>{el('ends').min=el('starts').value;if(el('ends').value<el('starts').value)el('ends').value=el('starts').value;};
el('team').onchange=deputies;
el('request').onsubmit=async event=>{
 event.preventDefault();const button=el('request').querySelector('button');button.disabled=true;
 try{
  await api({id:requestId,action:'request',team:el('team').value,kind:el('kind').value,starts:el('starts').value,ends:el('ends').value,...selection(el('deputy').value),handover:el('handover').value});
  requestId=crypto.randomUUID();el('request').reset();el('handover').value=state.template;deputies();await reload();el('notice').textContent='Antrag eingereicht.';
 }catch(e){el('notice').textContent=e.message;}finally{button.disabled=false;}
};
try{const r=await fetch('/api/auth/session',{cache:'no-store'});if([401,403].includes(r.status))location.replace('/?einstieg=portal');else{if(!r.ok)throw Error('Anmeldung konnte nicht geprüft werden.');({user}=await r.json());await reload();}}catch(e){el('notice').textContent=e.message;}
