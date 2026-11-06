const preview=new URLSearchParams(location.search).get('entwurf')==='1';
const panels=[
 ['administration','Verwaltung','Kalender, Konten & Arbeitszeit','M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4','/?bereich=verwaltung'],
 ['building','Gebäude','Räume & Pflege','M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6','/?bereich=gebaeude'],
 ['events','Veranstaltungen','Planung & Abnahmen','M4 5h16v16H4zM8 3v5M16 3v5M4 11h16','#events'],
 ['personnel','Personal','Abwesenheiten & Vertretungen','M4 5h16v15H4zM8 3v5M16 3v5M7 14l3 3 6-6','#personnel'],
 ['members','Mitglieder','Profil & Mitgliederverwaltung','M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21c0-8 16-8 16 0',null],
 ['finance','Finanzen','Auslagen im Testbetrieb','M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h6',null],
 ['outdoor','Außenanlage','Gelände & Aufgaben','M12 21v-7M5 15l7-12 7 12z','#aussenanlage'],
 ['kitchen','Küche','Geräte & Dienste','M4 3v6c0 3 6 3 6 0V3M7 3v18M18 21V3c-4 3-5 8-1 10h1','/?bereich=kueche'],
];
function available(key,user){
 if(preview || user.role==='admin')return true;
 if(areaSections[key])return areaSections[key][1].some(([, ,right])=>sectionAllowed(right,user));
 if(user.role==='member')return false;
 if(['finance','members'].includes(key))return false;
 if(key==='groups')return true;
 if(key==='kitchen')return user.role!=='technician' && (user.permissions?.manageCalendar ?? user.role==='coordinator');
 return ['elder','deacon','coordinator','technician','cleaner','backup','volunteer'].includes(user.role) || user.permissions?.manageRooms===true;
}
function explain(title,text){
 document.querySelector('#detail-title').textContent=title;
 document.querySelector('#detail-text').textContent=text;
 document.querySelector('#detail').showModal();
}
const outdoorTopics=[
 ['Grünpflege & Rasen',/grün|rasen|beet|hecke|wiese|pflanz/i],
 ['Spielplatz & Sandkasten',/spielplatz|sandkasten|spielgerät|schaukel/i],
 ['Tischtennis & Gummiplatz',/tischtennis|gummiplatz|sportplatz/i],
 ['Sitzstufen & Kolosseum',/stufen|kolosseum|amphitheater|sitzbereich/i],
 ['Sonnenschirme',/sonnen.?schirm/i]
];
function outdoorTiles(areas,list){
 const groups=new Map(outdoorTopics.map(([label])=>[label,[]]));
 for(const area of areas){
  const label=outdoorTopics.find(([,pattern])=>pattern.test(area.name))?.[0]||area.name;
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label).push(area);
 }
 for(const [label,entries] of groups){
  const detail=document.createElement('details'),summary=document.createElement('summary');
  detail.className='tile';detail.dataset.key='outdoor';summary.textContent=label;detail.append(summary);
  if(!entries.length){const note=document.createElement('p');note.textContent='Noch kein Außenbereich zugeordnet.';detail.append(note);}
  for(const area of entries){
   const tasks=document.createElement('ul'),edit=document.createElement('a');
   for(const task of area.tasks){const item=document.createElement('li');item.textContent=(task.done?'Erledigt: ':'Offen: ')+task.title;tasks.append(item);}
   edit.href='/?bereich=aussenanlage&ort='+encodeURIComponent(area.id);
   edit.textContent=area.name+' bearbeiten';detail.append(tasks,edit);
  }
  list.append(detail);
 }
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
   list.className='tiles';
   outdoorTiles(areas,list);
  }catch(error){if(!request.signal.aborted)status.textContent=error.message;}
 }
 document.querySelector('#areas-back').onclick=()=>{history.replaceState(null,'',location.pathname+location.search);route();document.querySelector('[data-key=outdoor]')?.focus();};
 window.addEventListener('hashchange',route);route();
}
function tileText(title){
 const compounds={Personalverwaltung:'Personal­verwaltung',Mitgliederverwaltung:'Mitglieder­verwaltung',Vereinbarungsvorlagen:'Vereinbarungs­vorlagen',Gebäudepflege:'Gebäude­pflege',Gebäudemängel:'Gebäude­mängel',Datensicherung:'Daten­sicherung',Zeiterfassung:'Zeit­erfassung',Abwesenheiten:'Abwesen­heiten',Veranstaltungen:'Veranstal­tungen'};
 return title.replace(/[\p{L}]+/gu,word=>compounds[word]||word);
}
function labelTile(tile,key,title,description=''){
 const panel=panels.find(([id])=>id===key);
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 const path=document.createElementNS(icon.namespaceURI,'path');
 icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
 path.setAttribute('d',panel[3]);icon.append(path);
 const arrow=document.createElement('span');arrow.className='arrow';
 arrow.setAttribute('aria-hidden','true');arrow.textContent=tile.tagName==='A'?'↗':'·';
 const caption=document.createElement('span'),label=document.createElement('b');
 label.textContent=tileText(title);caption.append(label);
 if(description){const note=document.createElement('small');note.textContent=description;caption.append(note);}
 tile.append(icon,arrow,caption);
}
function setupSections(user){
 const view=document.querySelector('#section-view');
 function route(){
  const key=location.hash.slice(1),group=Object.hasOwn(areaSections,key)&&areaSections[key];
  const open=Boolean(group && available(key,user));
  view.hidden=!open;document.body.classList.toggle('section-mode',open);
  if(!open)return;
  view.querySelector('h1').textContent=group[0];
  const grid=view.querySelector('.tiles');grid.replaceChildren();
  for(const [id,title,right] of group[1]){
   if(!preview && !sectionAllowed(right,user))continue;
   const planned=right==='planned',tile=document.createElement(planned||preview?'button':'a');
   tile.className='tile';tile.dataset.key=key;
   labelTile(tile,key,title,planned?'Geplant':'');
   if(planned||preview)tile.onclick=()=>explain(title,planned?'Dieser Bereich ist geplant.':'Diese Funktion öffnet sich nach der Anmeldung.');
   else if(id==='wochenplan')tile.href='/wochenplan/';
   else if(id==='auslagen'&&key==='finance')tile.href='/finanzen/';
   else if(key==='personnel')tile.href=id==='stamm'?'/personal/stamm.html':'/personal/?ansicht='+id;
   else tile.href=key==='members'?'/members/?ansicht='+id:'/?bereich='+id;
   grid.append(tile);
  }
  scrollTo(0,0);
 }
 window.addEventListener('hashchange',route);route();
}
function show(user){
 document.querySelector('#status').hidden=true;
 document.querySelector('#mode').textContent=preview?'Designvorschau · Ansicht mit allen Bereichen':'ECG Hussenhofen';
 for(const [key,title,description,path,url] of panels){
  if(!available(key,user))continue;
  const group=Object.hasOwn(areaSections,key);
  const linked=group || (url && (!preview || key==='groups'));
  const tile=document.createElement(linked?'a':'button');
  tile.className='tile';tile.dataset.key=key;
  if(linked)tile.href=group?'#'+key:url;
  else tile.onclick=()=>explain(title,key==='members'?'Hier ist die Pflege des eigenen Profils vorgesehen.':key==='finance'?'Hier sollen Mitglieder künftig Auslagen mit Beleg einreichen können.':'Nach Anmeldung öffnet diese Kachel den vorhandenen Arbeitsbereich.');
  labelTile(tile,key,title,description);
  document.querySelector('#tiles').append(tile);
 }
 setupSections(user);
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
  import('../assets/duties.js').then(({personalDuties})=>personalDuties(user.appUserId)).catch(()=>{});
  const logout=document.querySelector('#logout');
  logout.hidden=false;
  logout.onclick=async()=>{try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw Error();location.replace('/willkommen/');}catch{alert('Abmeldung fehlgeschlagen. Bitte erneut versuchen.');}};
 }catch{document.querySelector('#status').textContent='Die Anmeldung konnte nicht geprüft werden. Bitte lade die Seite neu.';}
}
start();
