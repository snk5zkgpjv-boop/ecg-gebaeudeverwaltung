// Each operation has its own durable key: other tabs cannot erase an in-flight change.
const timeOutboxPrefix='ecgTimeChange:v1:';
let manualTimeUserId=null;
let timeChangeEpoch=0,timeFlushPromise=null,timeLastMessage='',timeLastUser='',timeRetryTimer=null;
function pendingTimeChanges(userId=state.currentUserId){
 const result=[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(timeOutboxPrefix))continue;const op=JSON.parse(localStorage.getItem(key));if(op.userId===userId)result.push(op);}
 return result.sort((a,b)=>a.queuedAt-b.queuedAt||a.id.localeCompare(b.id));
}
function timeBase(entry){const fields=['id','userId','start','end','roomId','workLabel','note','volunteer','timeRevision'];return entry?Object.fromEntries(fields.map(k=>[k,entry[k]??(k==='volunteer'?false:'')])):null;}
function mergePendingTimes(entries){
 let result=[...(entries||[])];
 for(const op of pendingTimeChanges()){result=result.filter(e=>e.id!==op.entryId);if(op.entry)result.unshift({...op.entry,timeRevision:op.id});}
 return result;
}
function timeSaveStatusHtml(){
 let count;try{count=pendingTimeChanges().length;}catch{return '<div data-time-save-status role="status">Gerätespeicher nicht lesbar. Bitte Daten nicht löschen.</div>';}
 const message=count?`${count} Zeitänderung(en) auf diesem Gerät gesichert – noch nicht auf dem Server bestätigt. ${timeLastUser===state.currentUserId?timeLastMessage:''}`:(timeLastUser===state.currentUserId?timeLastMessage:'');
 return `<div data-time-save-status role="status" aria-live="polite" class="meta" style="margin:10px 0">${esc(message)}${count?'<div class="row wrap"><button class="btn tiny" onclick="flushTimeChanges()">Übertragung erneut versuchen</button><button class="btn tiny" onclick="showPendingTimeChanges()">Offene Änderungen ansehen</button></div>':''}</div>`;
}
function updateTimeSaveStatus(message){if(message!==undefined){timeLastMessage=message;timeLastUser=state.currentUserId;}document.querySelectorAll('[data-time-save-status]').forEach(el=>{el.outerHTML=timeSaveStatusHtml();});}
function queueTimeChange(action,before,entry){
 if(state.currentRole==='technician'||!state.currentUserId||before&&before.userId!==state.currentUserId||entry&&entry.userId!==state.currentUserId)return false;
 let previous;try{previous=pendingTimeChanges();}catch{alert('Gerätespeicher nicht verfügbar. Die Änderung wurde nicht abgeschlossen.');return false;}
 const id=crypto.randomUUID(),op={id,userId:state.currentUserId,entryId:(entry||before).id,action,before:timeBase(before),entry:entry?{...entry}:null,queuedAt:Math.max(Date.now(),...previous.map(o=>o.queuedAt+1))};
 try{localStorage.setItem(timeOutboxPrefix+id,JSON.stringify(op));}catch{alert('Der Gerätespeicher ist voll oder gesperrt. Die Arbeitszeit wurde nicht abgeschlossen. Bitte die Angaben sichern und erneut versuchen.');return false;}
 timeChangeEpoch++;state.timeEntries=mergePendingTimes(state.timeEntries);
 try{localStorage.setItem('cleaningAppState',JSON.stringify(state));}catch{/* The separate operation is already durably stored. */}
 updateTimeSaveStatus('Übertragung wird versucht …');void flushTimeChanges();return true;
}
function flushTimeChanges(){
 if(timeFlushPromise)return timeFlushPromise;
 timeFlushPromise=sendTimeChanges().catch(()=>updateTimeSaveStatus('Übertragung nicht bestätigt. Bitte Gerätespeicher prüfen; gespeicherte Entwürfe bleiben erhalten.')).finally(()=>{timeFlushPromise=null;clearTimeout(timeRetryTimer);try{if(pendingTimeChanges().length)timeRetryTimer=setTimeout(flushTimeChanges,30000);}catch{}});
 return timeFlushPromise;
}
async function sendTimeChanges(){
 const userId=state.currentUserId;
 if(!authSession||state.currentRole==='technician')return;
 for(const op of pendingTimeChanges(userId)){
  if(state.currentUserId!==userId||!authSession)return;
  try{
   const response=await fetch('/api/state',{method:'PATCH',headers:await authHeaders({'content-type':'application/json'}),body:JSON.stringify({timeChange:op}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();
   if(state.currentUserId!==userId)return;
   if(!response.ok)throw new Error(result.error||'Server nicht erreichbar.');
   if(result.ok!==true||result.operationId!==op.id||!Array.isArray(result.entries))throw new Error('Serverbestätigung unvollständig.');
   // Apply the confirmed snapshot before removing its receipt from this device.
   const remaining=pendingTimeChanges(userId).filter(x=>x.id!==op.id);
   let own=result.entries;
   for(const next of remaining){own=own.filter(e=>e.id!==next.entryId);if(next.entry)own.unshift({...next.entry,timeRevision:next.id});}
   state.timeEntries=[...own,...state.timeEntries.filter(e=>e.userId!==userId)];
   try{localStorage.setItem('cleaningAppState',JSON.stringify(state));}catch{/* Receipt remains retryable until the next statement. */}
   localStorage.removeItem(timeOutboxPrefix+op.id);timeChangeEpoch++;
   updateTimeSaveStatus('Auf dem Server gespeichert.');render();refreshOpenTimeReport();
  }catch(error){if(state.currentUserId===userId)updateTimeSaveStatus(error.message+' Die Änderung bleibt auf diesem Gerät erhalten.');return;}
 }
}
function refreshOpenTimeReport(){const report=document.getElementById('shareMyTimes')?.closest('.modal-backdrop');if(report)renderTimeReport(report);}
function showPendingTimeChanges(){modal(`<h2>Noch nicht bestätigte Zeitänderungen</h2><p>Diese Angaben sind auf diesem Gerät gesichert. Bei einem Konflikt bleiben sie hier zur Prüfung erhalten. Bitte die App-Daten nicht löschen.</p>${pendingTimeChanges().map(op=>{const e=op.entry||op.before;return `<div class="card"><b>${esc(({create:'Nachtrag / beendeter Timer',update:'Bearbeitung',delete:'Löschung'})[op.action])}: ${esc(e.workLabel||'Arbeitszeit')}</b><p>${esc(new Date(e.start).toLocaleString('de-DE'))} – ${esc(new Date(e.end).toLocaleString('de-DE'))}</p><p>${esc(e.note||'')}</p><button class="btn tiny" onclick="discardPendingTimeEntry(${esc(JSON.stringify(op.entryId))})">Lokale Änderungen verwerfen</button></div>`}).join('')}${timeSaveStatusHtml()}<button class="btn" onclick="closeModal()">Schließen</button>`);}
function openManualTimeEntry(){
 if(state.currentRole==='technician')return;
 manualTimeUserId=state.currentUserId;
 modal(`<h2>Arbeitszeit nachtragen</h2><p>Eigene Arbeitszeit manuell erfassen. Uhrzeiten in der Gerätezeitzone (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}). Pausen bitte als getrennte Einsätze erfassen.</p><form onsubmit="event.preventDefault();saveManualTimeEntry()"><div class="formgrid"><div class="field"><label>Beginn<input id="manualTimeStart" type="datetime-local" required></label></div><div class="field"><label>Ende<input id="manualTimeEnd" type="datetime-local" required></label></div><div class="field wide"><label>Tätigkeit<input id="manualTimeLabel" maxlength="200" value="Arbeitszeit allgemein" required></label></div><div class="field wide"><label>Bemerkung<textarea id="manualTimeNote" maxlength="4000" rows="3"></textarea></label></div><label class="wide"><input id="manualTimeVolunteer" type="checkbox"> Freiwilliger Dienst</label></div><button type="submit" class="btn primary" style="margin-top:12px">Arbeitszeit speichern</button></form>`);
}
function validTimeChange(entry){
 const bounds=completedTimeBounds(entry);if(!bounds||bounds.end-bounds.start>86400000){alert('Bitte einen abgeschlossenen Zeitraum von höchstens 24 Stunden angeben.');return false;}
 if(!entry.workLabel.trim()){alert('Bitte eine Tätigkeit angeben.');return false;}
 if(state.timeEntries.some(e=>e.id!==entry.id&&e.userId===entry.userId&&Date.parse(e.start)<bounds.end&&Date.parse(e.end)>bounds.start)){alert('Der Zeitraum überschneidet sich mit einer vorhandenen eigenen Buchung.');return false;}
 return true;
}
function saveManualTimeEntry(){
 if(state.currentRole==='technician'||state.currentUserId!==manualTimeUserId)return;
 const raw={id:uid('time'),userId:state.currentUserId,start:$('#manualTimeStart').value,end:$('#manualTimeEnd').value,workLabel:$('#manualTimeLabel').value.trim(),note:$('#manualTimeNote').value.trim(),volunteer:$('#manualTimeVolunteer').checked,roomId:''};
 if(!validTimeChange(raw))return;
 raw.start=new Date(raw.start).toISOString();raw.end=new Date(raw.end).toISOString();
 if(!queueTimeChange('create',null,raw))return;closeModal();render();refreshOpenTimeReport();
}
window.addEventListener('online',()=>flushTimeChanges());
window.addEventListener('storage',event=>{if(event.key?.startsWith(timeOutboxPrefix)){timeChangeEpoch++;updateTimeSaveStatus();void flushTimeChanges();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void flushTimeChanges();});

async function discardPendingTimeEntry(entryId){
 const userId=state.currentUserId;
 if(!confirm('Alle noch nicht bestätigten lokalen Änderungen zu dieser Buchung verwerfen? Bereits auf dem Server gespeicherte Zeiten bleiben bestehen. Danach kannst du den aktuellen Eintrag bearbeiten oder neu nachtragen.'))return;
 await flushTimeChanges();
 try{
  const epoch=timeChangeEpoch,response=await fetch('/api/state',{headers:await authHeaders(),cache:'no-store'});
  if(!response.ok)throw Error('Serverstand konnte nicht geladen werden. Die lokalen Änderungen bleiben erhalten.');
  const remote=await response.json();
  if(state.currentUserId!==userId||epoch!==timeChangeEpoch)throw Error('Inzwischen geändert. Bitte erneut prüfen.');
  for(const op of pendingTimeChanges(userId).filter(x=>x.entryId===entryId))localStorage.removeItem(timeOutboxPrefix+op.id);
  state.timeEntries=mergePendingTimes(remote.timeEntries||[]);timeChangeEpoch++;
  try{localStorage.setItem('cleaningAppState',JSON.stringify(state));}catch{}
  closeModal();render();refreshOpenTimeReport();updateTimeSaveStatus('Aktuellen Serverstand geladen.');void flushTimeChanges();
 }catch(error){alert(error.message);}
}
