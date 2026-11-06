const preview=new URLSearchParams(location.search).get('entwurf')==='1';
const panels=[
 ['building','Gebäude','Räume & Pflege','M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6','/?bereich=gebaeude'],
 ['members','Mitglieder','Mein Profil · geplant','M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21c0-8 16-8 16 0',null],
 ['finance','Finanzen','Auslagen · geplant','M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h6',null],
 ['outdoor','Außenanlage','Gelände & Aufgaben','M12 21v-7M5 15l7-12 7 12z','#aussenanlage'],
 ['kitchen','Küche','Geräte & Dienste','M4 3v6c0 3 6 3 6 0V3M7 3v18M18 21V3c-4 3-5 8-1 10h1','/?bereich=kueche'],
 ['groups','Gruppen','Treffen & Angebote','M9 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M1 20c0-7 11-7 11 0M13 15c5-3 10 0 10 5','/willkommen/#gruppen']
];
function available(key,user){
 if(preview || user.role==='admin')return true;
 if(['finance','members'].includes(key))return false;
 if(key==='groups')return true;
 if(key==='kitchen')return user.role!=='technician' && (user.permissions?.manageCalendar ?? user.role==='coordinator');
 return ['coordinator','technician','cleaner','backup','volunteer'].includes(user.role) || user.permissions?.manageRooms===true;
}
function explain(title,text){
 document.querySelector('#detail-title').textContent=title;
 document.querySelector('#detail-text').textContent=text;
 document.querySelector('#detail').showModal();
}
function setupOutdoor(user){
 const panel=document.querySelector('#outdoor-view'),list=document.querySelector('#areas-list'),status=document.querySelector('#areas-status');
 let active;
 async function route(){
  active?.abort();
  const open=location.hash==='#aussenanlage';
  panel.hidden=!open;
  document.body.classList.toggle('outdoor-mode',open);
  list.replaceChildren();
  if(!open)return;
  const request=new AbortController();active=request;
  status.textContent='Außenbereiche werden geladen …';
  document.querySelector('#areas-back').focus();
  try{
   const response=await fetch('/api/state?section=outdoor',{cache:'no-store',signal:request.signal,headers:{'X-ECG-User-Id':user.appUserId}});
   if(!response.ok)throw Error(response.status===401?'Bitte erneut anmelden.':'Außenbereiche konnten nicht geladen werden.');
   const {areas}=await response.json();
   if(request.signal.aborted)return;
   status.textContent=areas.length?'':'Bisher sind keine Außenbereiche eingetragen.';
   for(const area of areas){
    const detail=document.createElement('details'),summary=document.createElement('summary'),tasks=document.createElement('ul');
    summary.textContent=area.name+' · '+area.tasks.length+' Aufgaben';
    for(const task of area.tasks){const item=document.createElement('li');item.textContent=(task.done?'Erledigt: ':'Offen: ')+task.title;tasks.append(item);}
    detail.append(summary,tasks);list.append(detail);
   }
  }catch(error){if(!request.signal.aborted)status.textContent=error.message;}
 }
 document.querySelector('#areas-back').onclick=()=>{history.replaceState(null,'',location.pathname+location.search);route();document.querySelector('[data-key=outdoor]')?.focus();};
 window.addEventListener('hashchange',route);route();
}
function show(user){
 document.querySelector('#status').hidden=true;
 document.querySelector('#mode').textContent=preview?'Designvorschau · Ansicht mit allen Bereichen':'ECG Hussenhofen';
 for(const [key,title,description,path,url] of panels){
  if(!available(key,user))continue;
  const linked=url && (!preview || key==='groups');
  const tile=document.createElement(linked?'a':'button');
  tile.className='tile';tile.dataset.key=key;
  if(linked)tile.href=url;
  else tile.onclick=()=>explain(title,key==='members'?'Hier ist die Pflege des eigenen Profils vorgesehen.':key==='finance'?'Hier sollen Mitglieder künftig Auslagen mit Beleg einreichen können.':'Nach Anmeldung öffnet diese Kachel den vorhandenen Arbeitsbereich.');
  tile.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg><span class="arrow" aria-hidden="true">'+(url?'↗':'·')+'</span><span><b>'+title+'</b><small>'+description+'</small></span>';
  document.querySelector('#tiles').append(tile);
 }
 if(!preview && available('outdoor',user))setupOutdoor(user);
}
async function start(){
 if(preview){show({});return;}
 try{
  const response=await fetch('/api/auth/session',{cache:'no-store'});
  if([401,403].includes(response.status)){location.replace('/?einstieg=portal');return;}
  if(!response.ok)throw Error();
  const {user}=await response.json();
  if(!user || user.mustChangePassword){location.replace('/?einstieg=portal');return;}
  show(user);
  const logout=document.querySelector('#logout');
  logout.hidden=false;
  logout.onclick=async()=>{try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw Error();location.replace('/willkommen/');}catch{alert('Abmeldung fehlgeschlagen. Bitte erneut versuchen.');}};
 }catch{document.querySelector('#status').textContent='Die Anmeldung konnte nicht geprüft werden. Bitte lade die Seite neu.';}
}
start();
