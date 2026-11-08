function currentSection(){
 const query=new URLSearchParams(location.search);
 const id=query.get('bereich') || (query.has('room')?'raeume':query.has('asset')||query.has('location')?'inventar':null);
 for(const [parent,[name,items]] of Object.entries(areaSections)){
  if(parent==='members'||parent==='personnel')continue;
  const item=items.find(([key,,right])=>key===id && right!=='planned');
  if(item)return {parent,name,id,title:item[1],right:item[2]};
 }
 if(id==='aussenanlage')return {parent:'aussenanlage',name:'Außenanlage',title:'Außenbereiche',id};
 return null;
}
function roomWorkView(technical,kitchenOnly=false){
 const kitchenId=kitchenConfig()?.roomId;
 const rooms=state.rooms.filter(room=>kitchenOnly?room.id===kitchenId:room.id!==kitchenId);
 const followups=technical?[]:generatedEventTasks();
 const blocks=[];
 for(const room of rooms){
  const tasks=[...room.tasks.filter(task=>(task.taskType==='technical')===technical),...followups.filter(task=>task.room.id===room.id)];
  if(!tasks.length)continue;
  blocks.push('<section class="card"><h3>'+esc(room.floor)+' · '+esc(room.name)+'</h3>'+
   (!technical&&roomCleaningTasks(room.id).length?'<button class="btn" onclick="confirmRoomCleaning('+esc(JSON.stringify(room.id))+')">Wochenreinigung abschließen</button>':'')+
   tasks.map(task=>taskRow(room,task)).join('')+'</section>');
 }
 return blocks.join('')||'<p class="empty">Keine passenden Raumaufgaben eingetragen.</p>';
}
let readCalendarViewState=null;
function resetReadCalendarState(){readCalendarViewState=null;}
function readCalendarState(){
 if(!readCalendarViewState || readCalendarViewState.session!==authSession)readCalendarViewState={session:authSession,snapshot:null,error:'',loading:false};
 return readCalendarViewState;
}
function calendarRangeLabel(event){
 const parseDay=value=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('date');
  const date=new Date(value+'T12:00:00Z');
  if(date.toISOString().slice(0,10)!==value)throw Error('date');
  return date;
 };
 const dateLabel=value=>new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',dateStyle:'medium'}).format(parseDay(value));
 if(event.allDay){
  try{
   const start=event.startDate||String(event.start||'').slice(0,10);
   let end=String(event.end||'').slice(0,10);
   if(event.endDateExclusive){
    const exclusive=parseDay(event.endDateExclusive);exclusive.setUTCDate(exclusive.getUTCDate()-1);end=exclusive.toISOString().slice(0,10);
   }
   if(end<start)throw Error('range');
   return (start===end?dateLabel(start):dateLabel(start)+' – '+dateLabel(end))+' · ganztägig';
  }catch{return 'Zeitraum nicht verfügbar';}
 }
 const start=new Date(event.start),end=new Date(event.end);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start)return 'Zeitraum nicht verfügbar';
 const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
 const full=value=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}).format(value);
 const time=value=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',timeStyle:'short'}).format(value);
 return full(start)+' – '+(day(start)===day(end)?time(end):full(end))+' Uhr';
}
function readOnlyCalendar(){
 const view=readCalendarState(),snapshot=view.snapshot;
 const events=[...(snapshot?.events||state.calendarEvents||[])].sort((a,b)=>new Date(a.start)-new Date(b.start));
 const updated=snapshot?.syncedAt||state.settings?.calendarLastSync;
 const date=new Date(updated);
 const freshness=updated&&Number.isFinite(+date)?'Letzte erfolgreiche Aktualisierung: '+new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'}).format(date)+' Uhr':'Aktualisierungszeit unbekannt';
 const source=snapshot?'Direkt geladener Stand dieser Ansicht.':'Gespeicherter Kalenderstand; Änderungen seit der letzten Aktualisierung können fehlen.';
 return `<div class="notice"><b>${esc(freshness)}</b><p>${esc(source)}</p><p>Alle Uhrzeiten in deutscher Ortszeit. Ganztägige Zeiträume einschließlich des letzten angezeigten Tages.</p></div><div class="row wrap" style="margin:12px 0"><button class="btn primary" onclick="refreshReadOnlyCalendar()"${view.loading?' disabled':''}>${view.loading?'Wird aktualisiert …':'Kalender aktualisieren'}</button><span role="status">${esc(view.error)}</span></div>`+
  (events.map(event=>'<article class="card" style="margin-bottom:12px"><b>'+esc(event.title)+'</b>'+(event.cancelled?' <strong class="pill warn">Fällt aus</strong>':'')+'<div>'+esc(calendarRangeLabel(event))+'</div></article>').join('')||'<p>Keine Termine im angezeigten Kalenderstand.</p>');
}
window.refreshReadOnlyCalendar=async()=>{
 const session=authSession,owner=session?.user?.appUserId;
 if(!owner)return;
 const view=readCalendarState();if(view.loading)return;
 view.loading=true;view.error='';render();
 try{
  const response=await readAppResponse('/api/calendar?readOnly=1',{cache:'no-store',headers:{'X-ECG-User-Id':owner}},20000);
  if(authSession!==session||readCalendarViewState!==view)return;
  if([401,403,409].includes(response.status))return showLoginGate('Dein Kalenderzugang wurde geändert. Bitte erneut anmelden.');
  const body=await response.json();
  if(!response.ok||!Array.isArray(body.events))throw Error('load');
  view.snapshot={events:body.events,syncedAt:body.syncedAt};
 }catch{
  if(authSession===session&&readCalendarViewState===view)view.error='Aktualisierung fehlgeschlagen. Der bisherige Stand bleibt sichtbar; bitte erneut versuchen.';
 }finally{
  view.loading=false;
  if(authSession===session&&readCalendarViewState===view)render();
 }
};

function workSectionView(section){
 const button=(action,text)=>'<button class="btn primary" onclick="'+action+'">'+text+'</button>';
 switch(section.id){
  case 'pflege':return roomWorkView(false);
  case 'technik':return roomWorkView(true);
  case 'wartung':return maintenanceView();
  case 'raeume':return button('exportRoomChecklist()','Raumchecklisten drucken')+roomsView();
  case 'inventar':return inventoryView();
  case 'ausleihe':return button('showLoans()','Ausleihen und Rückgaben öffnen');
  case 'maengel':return issuesView(state.issues.filter(issue=>!issue.outdoorId));
  case 'grundrisse':return floorplanView();
  case 'benutzer':return userManagementView();
  case 'arbeitszeit':return timeWorkCard()+button('showTimeReport()','Arbeitszeiten und Berichte öffnen');
  case 'kalender':
   if(can('manageCalendar'))return calendarView();
   return readOnlyCalendar();
  case 'termine':return can('manageCalendar')?calendarView(true):readOnlyCalendar();
  case 'vereinbarungen':return button('showEventDocumentSettings()','Vereinbarungsvorlagen bearbeiten');
  case 'daten':return backupView();
  case 'system':return button('showSystemStatus()','Systemstatus prüfen');
  case 'kuechenpflege':return roomWorkView(false,true);
  case 'kuechendienst':return kitchenPending(true)||'<p>Keine offenen Küchendienste.</p>';
  case 'kuechenordnung':return button('editKitchenContacts()','Kontakte, Bestand und Küchenordnung öffnen');
  case 'kuechengeraete':{
   const assets=(state.maintenanceAssets||[]).filter(m=>kitchenConfig()?.roomId && m.roomId===kitchenConfig().roomId);
   return assets.length?'<div class="kitchen-devices">'+assets.map(m=>button('openMaintenance('+esc(JSON.stringify(m.id))+')',esc(m.name))) .join('')+'</div>':'<p>Keine Geräte zugeordnet.</p>';
  }
  case 'aussenanlage':{
   const id=new URLSearchParams(location.search).get('ort');
   const areas=id?state.outdoorAreas.filter(area=>area.id===id):state.outdoorAreas;
   const issues=state.issues.filter(issue=>issue.outdoorId && (!id||issue.outdoorId===id));
   return outdoorView(areas)+(issues.length?'<h2>Mängel der Außenanlage</h2>'+issues.map(issueCard).join(''):'');
  }
 }
}
