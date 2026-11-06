function currentSection(){
 const query=new URLSearchParams(location.search);
 const id=query.get('bereich') || (query.has('room')?'raeume':query.has('asset')||query.has('location')?'inventar':null);
 for(const [parent,[name,items]] of Object.entries(areaSections)){
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
  case 'kalender':return calendarView();
  case 'termine':return calendarView(true);
  case 'vereinbarungen':return button('showEventDocumentSettings()','Vereinbarungsvorlagen bearbeiten');
  case 'daten':return backupView();
  case 'system':return button('showSystemStatus()','Systemstatus prüfen');
  case 'kuechenpflege':return roomWorkView(false,true);
  case 'kuechendienst':return kitchenPending(true)||'<p>Keine offenen Küchendienste.</p>';
  case 'kuechenordnung':return button('editKitchenContacts()','Kontakte, Bestand und Küchenordnung öffnen');
  case 'kuechengeraete':{
   const assets=(state.maintenanceAssets||[]).filter(m=>kitchenConfig()?.roomId && m.roomId===kitchenConfig().roomId);
   return assets.map(m=>button('openMaintenance('+esc(JSON.stringify(m.id))+')',esc(m.name))).join('')||'<p>Keine Geräte zugeordnet.</p>';
  }
  case 'aussenanlage':{
   const id=new URLSearchParams(location.search).get('ort');
   const areas=id?state.outdoorAreas.filter(area=>area.id===id):state.outdoorAreas;
   const issues=state.issues.filter(issue=>issue.outdoorId && (!id||issue.outdoorId===id));
   return outdoorView(areas)+(issues.length?'<h2>Mängel der Außenanlage</h2>'+issues.map(issueCard).join(''):'');
  }
 }
}
