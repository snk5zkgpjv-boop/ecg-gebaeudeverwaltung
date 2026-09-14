// Maintenance suggestions are informational only; no automatic data changes.
const maintenanceTypeLabels={internal:'Interne Wartung',external:'Externe Wartung',mixed:'Intern / extern – kombiniert'};
let maintenanceTypeFilter='all';
function maintenanceView(){
 const types=maintenanceTypeFilter==='all'?Object.keys(maintenanceTypeLabels):[maintenanceTypeFilter];
 return `<h2>Wartung & Prüfungen</h2><div class="row wrap"><label>Wartungsart <select class="btn" onchange="setMaintenanceTypeFilter(this.value)"><option value="all">Alle Wartungsarten</option>${Object.entries(maintenanceTypeLabels).map(([k,v])=>`<option value="${k}" ${k===maintenanceTypeFilter?'selected':''}>${v}</option>`).join('')}</select></label>${can('manageMaintenance')?'<button class="btn primary" onclick="editMaintenance()">+ Anlage / Gerät</button>':''}</div><p class="meta">Getrennt nach Wartungsart, darunter Geschoss und Bereich. Kombinierte Anlagen bleiben als eigene Gruppe sichtbar. Herstellerhinweise findest du unter „Öffnen“.</p>${types.map(type=>`<section style="margin-top:22px">${maintenanceViewForType(type)}</section>`).join('')}`;
}
window.setMaintenanceTypeFilter=value=>{maintenanceTypeFilter=Object.hasOwn(maintenanceTypeLabels,value)?value:'all';closeModal();showMaintenance()};
function maintenanceAdvice(m){
 const name=[m.manufacturer,m.model,m.name].filter(Boolean).join(' ');
 let advice='Noch kein belastbarer modellbezogener Intervallvorschlag. Bitte Hersteller, genaue Typbezeichnung und Betriebsanleitung ergänzen. Bestehende Intervalle sind nicht automatisch herstellergeprüft.',source='',label='';
 if(/meiko/i.test(name)&&/m.?iclean\s*h[lm]?/i.test(name)){
  advice='Vorschlag Fachwartung: 12 Monate. MEIKO-Anleitung 9739947, Abschnitt 9.2, enthält jährliche Wartungsarbeiten; Zubehör und zählerabhängige Arbeiten gesondert beachten. Intern: tägliche Reinigung nach Abschnitt 9.3. Wartungsarbeiten nur durch autorisierten Haushandwerker oder Servicetechniker. Gerätegeneration und Anleitung vor Übernahme abgleichen.';
  source='https://www.meiko.com/en/products/warewashing/hood-type-dishwashing-machines/m-iclean-h/technical-data';label='MEIKO: Original-Anleitungen im Downloadbereich';
 }else if(/eloma/i.test(name)&&/genius/i.test(name)){
  advice='Vorschlag für Genius T: Fachwartung mindestens jährlich (12 Monate). Intern: Türdichtung täglich reinigen; Bereich hinter dem Luftleitblech wöchentlich bzw. nach Verschmutzung; Luftansaugfilter alle 2 Monate. Quelle: Eloma Genius T, Version 2.7, 09/2013, Seiten 5 und 42–43. Gilt für Elektro-/Gasmodelle 6-11 und 20-11 dieser Serie. Bei „Genius“ ohne T oder anderer Gerätegeneration erst Typenschild abgleichen. Gaswartung durch autorisierten Kundendienst.';
  source='https://manualzz.com/doc/1615628/eloma-genius-t-combi-steamer-operation-manual';label='Eloma-Originalanleitung (Spiegel bei Manualzz)';
 }else if(/rational|ivario/i.test(name)){
  advice='iVario Pro: Noch kein belastbar bestätigtes Wartungsintervall für das konkrete Gerät. Betriebsanleitung und Druckgar-Ausführung mit dem RATIONAL-Service abgleichen. Pflege-/Reinigungsintervalle sind kein Ersatz für Fachwartung.';
  source='https://www.rational-online.com/en_xx/customercare/downloads/manuals-safety-data-sheets/';label='RATIONAL: Betriebsanleitungen';
 }else if(/omniwash/i.test(name)){
  advice='Omniwash: Genaue Modellbezeichnung fehlt. Ohne passenden Wartungsplan keine pauschale Monatsfrist übernehmen.';source='https://www.omniwash.eu/de/homepage-2/';label='Omniwash: Hersteller und Service';
 }
 return `<div class="notice"><b>Intervallvorschlag – noch zu prüfen</b><p>${esc(advice)}</p>${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:''}<div class="meta">Recherche: 14.09.2026. Keine automatische Übernahme. Letzte Wartung und nächster Termin bleiben unverändert. App-Rolle „Technik“ ersetzt keine fachliche Qualifikation.</div></div>`;
}
function canCompleteRoomTask(task){return state.currentRole!=='technician'||(!task?.event&&task?.taskType==='technical')}

// Block direct UI calls as well as hiding controls. The API enforces these rules independently.
for(const name of ['startTime','stopTime','showTimeReport','setTimeSharing','editTimeEntry','saveTimeEntry','deleteTimeEntry','completeEventTask','editRoom','saveRoomEdit','duplicateRoom','createFromTemplate','showTemplates','editOutdoor','saveOutdoor','addTask','saveTask','editTask','saveTaskEdit','deleteTask','deleteTaskFromRoomEdit','importData','resetDemo']){
 const original=window[name];if(typeof original==='function')window[name]=function(...args){if(state.currentRole==='technician')return;return original.apply(this,args)};
}
const technicianBindAuth=bindAuthUser;
bindAuthUser=function(){technicianBindAuth();if(state.currentRole==='technician'){state.timeEntries=[];state.timeRunning=null;state.myTimeSharing=false;state.sharedTimeUsers=[]}};

// Only task managers may assign the task type. Never infer technical work from a room name.
function appendTaskType(task){
 if(!can('manageTasks'))return;
 const modalBody=document.querySelectorAll('#modalRoot .modal');const body=modalBody[modalBody.length-1];if(!body)return;
 const field=document.createElement('div');field.className='field';field.style.marginTop='12px';
 field.innerHTML=`<label>Aufgabenart</label><select id="taskTypeChoice"><option value="cleaning">Putzaufgabe / allgemein</option><option value="technical" ${task?.taskType==='technical'?'selected':''}>Technikaufgabe</option></select><small>Nur ausdrücklich markierte Technikaufgaben können von der Technikrolle abgehakt werden.</small>`;
 body.appendChild(field);
}
const taskTypeAdd=window.addTask,taskTypeEdit=window.editTask,taskTypeSave=window.saveTask,taskTypeSaveEdit=window.saveTaskEdit;
window.addTask=id=>{if(!can('manageTasks'))return;taskTypeAdd(id);appendTaskType(null)};
window.editTask=(rid,tid)=>{if(!can('manageTasks'))return;taskTypeEdit(rid,tid);appendTaskType(state.rooms.find(r=>r.id===rid)?.tasks.find(t=>t.id===tid))};
window.saveTask=id=>{if(!can('manageTasks'))return;const type=$('#taskTypeChoice')?.value==='technical'?'technical':'cleaning';const task=t($('#atTitle').value.trim()||'Neue Aufgabe',$('#atInterval').value);task.taskType=type;state.rooms.find(r=>r.id===id).tasks.push(task);save();closeModal();editRoom(id)};
window.saveTaskEdit=(rid,tid)=>{if(!can('manageTasks'))return;const type=$('#taskTypeChoice')?.value==='technical'?'technical':'cleaning';state.rooms.find(r=>r.id===rid).tasks.find(t=>t.id===tid).taskType=type;taskTypeSaveEdit(rid,tid)};
const technicianSettings=settingsView;
settingsView=function(){let html=technicianSettings();if(state.currentRole==='technician')html=html.replace(/<button[^>]*onclick="(?:importData|resetDemo)\(\)"[^>]*>[^<]*<\/button>/g,'');return html};
