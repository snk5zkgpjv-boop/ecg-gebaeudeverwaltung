import { inventoryTasksFor, inventoryReferencesFor, inventoryReferenceHtml } from './room-inventory.js';
import { cleaningLocationFor, cleaningSections, suggestedFee, depositFor, roomKind } from './event-usage-model.js';
import { escapeHtml as h, usagePrintHtml } from './event-usage-print.js';
window.ecgRoomInventory={tasks:inventoryTasksFor,references:inventoryReferencesFor,html:inventoryReferenceHtml};
let draft=null, busy=false, openSerial=0;
const legacyAgreement=window.createEventAgreement;
const value=id=>document.getElementById(id)?.value || '';
const selectedRooms=()=>[...document.querySelectorAll('.eu-room:checked')].map(x=>state.rooms.find(r=>r.id===x.value)).filter(Boolean);
const money=n=>n===null?'Individuelle Gebühr eintragen':n.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
function rawForm(){return {eventId:draft.eventId,eventType:value('eu-kind'),roomIds:selectedRooms().map(r=>r.id),name:value('eu-name').trim(),address:value('eu-address').trim(),contact:value('eu-contact').trim(),fee:value('eu-fee')===''?null:Number(value('eu-fee')),feeNote:value('eu-fee-note').trim(),caretaker:value('eu-caretaker').trim(),caretakerContact:value('eu-caretaker-contact').trim(),cleaningLocation:value('eu-cleaning').trim(),kitchenUsed:document.getElementById('eu-kitchen').checked,toiletsUsed:document.getElementById('eu-toilets').checked,notes:value('eu-notes').trim(),tasks:[...document.querySelectorAll('.eu-tasks')].map(t=>t.value.split('\n').map(x=>x.trim()).filter(Boolean))};}
function tasksHtml(sections){return sections.map(s=>`<div class="field wide"><label>${h(s.title)} (eine Aufgabe je Zeile)<textarea class="eu-tasks" rows="${Math.min(s.items.length+1,7)}">${h(s.items.join('\n'))}</textarea></label>${s.referenceIds?.length?`<details><summary>Bildreferenzen Freizeitraum</summary>${inventoryReferenceHtml(s.referenceIds)}</details>`:''}</div>`).join('');}
function refreshRules(){
 const rooms=selectedRooms(), fee=suggestedFee(rooms);
 document.getElementById('eu-suggested').textContent='Raumtarif: '+money(fee);
 document.getElementById('eu-deposit').textContent=money(depositFor(value('eu-kind')))+(value('eu-kind')==='wedding'?' · bar vor Veranstaltungsbeginn':' · bei privaten Feiern keine Kaution');
 const k=document.getElementById('eu-kitchen'),t=document.getElementById('eu-toilets');
 if(rooms.some(r=>roomKind(r)==='kitchen'))k.checked=true;
 if(rooms.some(r=>roomKind(r)==='toilet'))t.checked=true;
}
function regenerateTasks(){
 document.getElementById('eu-tasks').innerHTML=tasksHtml(cleaningSections(selectedRooms(),{kitchenUsed:document.getElementById('eu-kitchen').checked,toiletsUsed:document.getElementById('eu-toilets').checked}));
 draft.taskRooms=selectedRooms().map(r=>r.id).join('|');draft.taskOptions=value('eu-kind')+'|'+document.getElementById('eu-kitchen').checked+'|'+document.getElementById('eu-toilets').checked;
 draft.tasksDirty=false;
}
window.createEventAgreement=async eventId=>{
 if(!can('manageCalendar'))return;
 const ev=(state.calendarEvents||[]).find(e=>e.id===eventId);if(!ev||ev.cancelled)return;
 const owner=state.currentUserId,serial=++openSerial;
 closeModal();modal('<h2>Nutzungsvereinbarung</h2><p>Gespeicherten Entwurf laden …</p>');
 try{
  const response=await fetch('/api/state?eventUsage=1&eventId='+encodeURIComponent(eventId),{headers:await authHeaders()});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'Entwurf konnte nicht geladen werden.');
  if(serial!==openSerial||state.currentUserId!==owner||!can('manageCalendar'))return;
  const old=body.document,c=eventChecklistFor(eventId),a=old||c?.agreement||{},user=currentUser(),settings=state.eventDocumentSettings||{};
  const ids=old?.roomIds||c?.roomIds||[];
  const type=old?.eventType||(/hochzeit/i.test(ev.title)?'wedding':'private');
  const rooms=state.rooms.filter(r=>ids.includes(r.id));
  const fee=old?.fee??suggestedFee(rooms);
  const caretaker=old?.caretaker||user?.name||'';
  draft={eventId,owner,expectedVersion:old?.version||0,loaded:old,tasksDirty:false,mutation:null};
  const field=(id,label,v='',type='text')=>`<div class="field"><label for="${id}">${h(label)}</label><input id="${id}" type="${type}" value="${h(v)}"${type==='number'?' min="0" max="10000" step="0.01"':''}></div>`;
  closeModal();modal(`<h2>Nutzungsvereinbarung</h2><p><b>${h(ev.title)}</b><br>${h(new Date(ev.start).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}))}</p><p>Räume auswählen, Angaben prüfen und Unterlagen im ECG-Design erstellen. Nutzungsbedingungen, Reinigungscheckliste und Abnahme sind enthalten.</p>
  ${old?'<p class="notice">Gespeicherte Vereinbarung geladen. Die Druckansicht verwendet den zuletzt gespeicherten Stand.</p>':''}
  <div class="formgrid"><div class="field"><label for="eu-kind">Veranstaltungsart</label><select id="eu-kind"><option value="private" ${type==='private'?'selected':''}>Private Feier</option><option value="wedding" ${type==='wedding'?'selected':''}>Hochzeit</option></select></div>${field('eu-name','Veranstalter / Nutzer',a.name||c?.organizer||'')}${field('eu-address','Anschrift',a.address)}${field('eu-contact','Telefon / Kontakt',a.contact)}</div>
  <h3>Genutzte Räume</h3><div class="checklist-room-grid">${state.rooms.slice().sort((a,b)=>floorSortKey(a.floor)-floorSortKey(b.floor)||a.name.localeCompare(b.name,'de')).map(r=>`<label class="checklist-room"><input type="checkbox" class="eu-room" value="${h(r.id)}" ${ids.includes(r.id)?'checked':''}><span><b>${h(r.name)}</b><small>${h(r.floor)}</small></span></label>`).join('')}</div>
  <p><label><input id="eu-kitchen" type="checkbox" ${old?.kitchenUsed||rooms.some(r=>roomKind(r)==='kitchen')?'checked':''}> Zugehörige Küche / Kücheninventar mitbenutzt</label></p><p><label><input id="eu-toilets" type="checkbox" ${old?.toiletsUsed!==false?'checked':''}> Zugehörige Toiletten mitbenutzt</label></p>
  <h3>Gebühren und Kaution</h3><p>Freizeitraum 50 € · Untergeschoss 100 € · Erdgeschoss + Untergeschoss 200 €. Andere Raumkombinationen nach individueller Vereinbarung.</p><p id="eu-suggested"></p><div class="formgrid">${field('eu-fee','Nutzungsgebühr (€)',fee??'','number')}${field('eu-fee-note','Begründung bei abweichender / individueller Gebühr',old?.feeNote||'')}</div><p><b>Kaution separat:</b> <span id="eu-deposit"></span></p>
  <h3>Reinigung und Abnahme</h3><div class="formgrid">${field('eu-cleaning','Standort der gestellten Putzmittel',old?.cleaningLocation||cleaningLocationFor(rooms))}${field('eu-caretaker','Abnahme durch',caretaker)}${field('eu-caretaker-contact','Kontakt für die Abnahme',old?.caretakerContact||(settings.contactLines||[]).find(x=>caretaker&&x.includes(caretaker))||'')}</div>
  <details><summary>Raumabhängige Reinigungsaufgaben prüfen / bearbeiten</summary><p>Bei einer neuen Raumauswahl werden die Aufgaben neu aufgebaut. Regelmäßige Wartungsaufgaben werden nicht übernommen.</p><div class="formgrid" id="eu-tasks"></div></details><div class="field"><label for="eu-notes">Zusätzliche Vereinbarungen</label><textarea id="eu-notes" rows="3">${h(old?.notes||'')}</textarea></div>
  <p>Unterschriftsfelder sind zum Unterzeichnen vorgesehen. Die Abnahme wird erst nach der tatsächlichen Rückgabe unterschrieben.</p><p id="eu-status" role="status"></p><div class="row wrap"><button class="btn primary" id="eu-save-print">Speichern und PDF / Drucken</button><button class="btn" id="eu-save">Entwurf speichern</button>${old?'<button class="btn" id="eu-print-saved">Gespeicherte Fassung öffnen</button>':''}<button class="btn" id="eu-legacy">Bisherige Küchen-/Kooperationsvereinbarung</button><button class="btn" onclick="closeModal()">Schließen</button></div>`);
  regenerateTasks();if(old?.sections)document.getElementById('eu-tasks').innerHTML=tasksHtml(old.sections);
  refreshRules();
  document.getElementById('eu-tasks').addEventListener('input',()=>draft.tasksDirty=true);
  for(const el of document.querySelectorAll('.eu-room,#eu-kitchen,#eu-toilets'))el.addEventListener('change',()=>{
    if(draft.tasksDirty&&!confirm('Raumauswahl ändern und die bearbeiteten Reinigungsaufgaben neu erzeugen?')){el.checked=!el.checked;return;}
    refreshRules();document.getElementById('eu-fee').value=suggestedFee(selectedRooms())??'';document.getElementById('eu-cleaning').value=cleaningLocationFor(selectedRooms());regenerateTasks();
  });
  document.getElementById('eu-kind').addEventListener('change',refreshRules);
  document.getElementById('eu-save').onclick=()=>saveUsage(false);
  document.getElementById('eu-save-print').onclick=()=>saveUsage(true);
  if(old)document.getElementById('eu-print-saved').onclick=()=>openPrint(old);
  document.getElementById('eu-legacy').onclick=()=>legacyAgreement(eventId);
 }catch(err){if(serial===openSerial&&state.currentUserId===owner){closeModal();modal(`<h2>Nutzungsvereinbarung</h2><p role="alert">${h(err.message)}</p><button class="btn" onclick="closeModal()">Schließen</button>`);}}
};
function openPrint(doc,tab=null){
 const w=tab||window.open('','_blank');if(!w){alert('Bitte Pop-ups für die Druckansicht erlauben.');return;}
 w.document.open();w.document.write(usagePrintHtml(doc,new URL('/assets/ecg-letterhead.jpeg',location.origin).href));w.document.close();
}
async function saveUsage(print){
 if(busy||!draft||!can('manageCalendar')||state.currentUserId!==draft.owner)return;
 const raw=rawForm();if(!raw.roomIds.length||!raw.name||raw.fee===null||!raw.caretaker||!raw.cleaningLocation){document.getElementById('eu-status').textContent='Bitte Räume, Veranstalter, Nutzungsgebühr, Putzmittelstandort und Abnahmeverantwortlichen ausfüllen.';return;}
 const fingerprint=JSON.stringify(raw);
 if(draft.mutation?.fingerprint!==fingerprint)draft.mutation={fingerprint,id:crypto.randomUUID()};
 const current=draft,tab=print?window.open('','_blank'):null;
 if(print&&!tab){document.getElementById('eu-status').textContent='Bitte Pop-ups erlauben oder zuerst den Entwurf speichern.';return;}
 if(tab)tab.document.body.textContent='Vereinbarung wird gespeichert …';
 busy=true;for(const b of document.querySelectorAll('#eu-save,#eu-save-print'))b.disabled=true;
 document.getElementById('eu-status').textContent='Wird auf dem Server gespeichert …';
 try{
  const response=await fetch('/api/state?eventUsage=1',{method:'PATCH',headers:await authHeaders({'content-type':'application/json'}),body:JSON.stringify({eventUsage:{document:raw,expectedVersion:current.expectedVersion,mutationId:current.mutation.id}})});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'Speichern fehlgeschlagen.');
  if(state.currentUserId!==current.owner||!can('manageCalendar')||draft!==current){tab?.close();return;}
  if(!body.ok||!body.document||body.document.eventId!==current.eventId)throw new Error('Serverbestätigung fehlt. Bitte erneut speichern.');
  current.expectedVersion=body.document.version;current.loaded=body.document;current.mutation=null;
  document.getElementById('eu-status').textContent='Auf dem Server gespeichert. Beim erneuten Öffnen des Termins wieder verfügbar.';
  if(print)openPrint(body.document,tab);
 }catch(err){tab?.close();if(draft===current&&state.currentUserId===current.owner){const status=document.getElementById('eu-status');if(status)status.textContent=err.message+' Der Entwurf bleibt in diesem geöffneten Formular erhalten.';}}
 finally{busy=false;for(const b of document.querySelectorAll('#eu-save,#eu-save-print'))b.disabled=false;}
}
