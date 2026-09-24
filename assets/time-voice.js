// Audio is sent only after the user stops the recording. It is never kept in app state.
let ecgVoice=null;
let cloudSaveQueue=Promise.resolve();
const originalCloudSync=syncCloud;
syncCloud=function(){cloudSaveQueue=cloudSaveQueue.then(()=>originalCloudSync()).catch(()=>{});return cloudSaveQueue;};
function voiceMessage(v,text){if(v.root.isConnected)v.root.querySelector('[data-voice-status]').textContent=text;}
function voiceActive(v){return ecgVoice===v&&v.root.isConnected&&state.currentUserId===v.userId;}
async function voiceRequest(body){
 const response=await fetch('/api/ai?timeVoice=1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json().catch(()=>({error:'Serverantwort nicht lesbar. Bitte erneut versuchen; eine Aufnahme gegebenenfalls kürzer halten.'}));if(!response.ok){const error=new Error(result.error||'Anfrage fehlgeschlagen.');error.status=response.status;throw error;}return result;
}
function voiceSetBusy(v,busy){v.busy=busy;v.root.querySelectorAll('[data-voice-action],#voiceTranscript').forEach(b=>b.disabled=busy||((b.matches('[data-record],[data-analyze]'))&&v.aiReady!==true));}
function voiceCleanup(v){clearTimeout(v.timer);if(v.recorder?.state==='recording')v.recorder.stop();v.stream?.getTracks().forEach(t=>t.stop());}
function openVoiceTime(){
 if(state.currentRole==='technician')return;
 if(ecgVoice&&voiceActive(ecgVoice))return;
 const root=modal(`<h2>Arbeitszeit einsprechen</h2><p>Datum, Beginn, Ende und Tätigkeiten nennen. Beispiel: „Gestern von 8 bis 10 Uhr die Außenanlagen gepflegt.“ Mehrere Einsätze sind möglich. Pausen bitte mit Uhrzeiten nennen.</p><p class="meta">Aufnahme und Text werden zur Erkennung an OpenAI gesendet. Kein Audio wird in der ECG-Datenbank gespeichert. Erst nach deiner Bestätigung werden Buchungen gespeichert. Alternativ tippen oder das Mikrofon der iPhone-Tastatur nutzen.</p><div class="row wrap"><button class="btn primary" data-voice-action data-record disabled onclick="voiceRecord()">🎙 Aufnahme starten</button><button class="btn danger" data-stop hidden onclick="voiceStop()">Aufnahme beenden</button></div><div class="field" style="margin-top:12px"><label for="voiceTranscript">Gesprochener Text / Ergänzungen</label><textarea id="voiceTranscript" rows="5" maxlength="12000" oninput="voiceInvalidate()"></textarea></div><div class="row wrap" style="margin-top:12px"><button class="btn primary" data-voice-action data-analyze disabled onclick="voiceAnalyze()">Angaben auswerten</button><button class="btn" data-voice-action onclick="voiceManual()">Manuell eintragen</button></div><p role="status" aria-live="polite" data-voice-status>Einrichtung wird geprüft …</p><div data-voice-preview></div>`);
 const v={root,userId:state.currentUserId,requestId:crypto.randomUUID(),busy:false,aiReady:false,recorder:null,stream:null,timer:null};ecgVoice=v;
 const observer=new MutationObserver(()=>{if(!root.isConnected){voiceCleanup(v);observer.disconnect();if(ecgVoice===v)ecgVoice=null;}});observer.observe(document.getElementById('modalRoot'),{childList:true});
 fetch('/api/ai?timeVoice=1',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);if(voiceActive(v)){v.aiReady=b.ai===true;voiceSetBusy(v,v.busy);if(!v.busy)voiceMessage(v,b.ai?'Bereit. Aufnahme starten oder Text eingeben.':(b.unavailableReason||'KI nicht verfügbar oder nicht freigeschaltet.')+' Alternativ über die Tastatur diktieren und „Manuell eintragen“ wählen.');}}).catch(e=>{if(voiceActive(v))voiceMessage(v,e.message+' Bitte Dialog erneut öffnen oder manuell eintragen.');});
}
function voiceInvalidate(){const v=ecgVoice;if(!v||v.busy)return;v.root.querySelector('[data-voice-preview]').innerHTML='';v.frozen=null;v.requestId=crypto.randomUUID();}
async function voiceRecord(){
 const v=ecgVoice;if(!v||v.busy||!v.aiReady)return;
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){voiceMessage(v,'Dieser Browser unterstützt keine Aufnahme. Bitte das Mikrofon der Tastatur verwenden.');return;}
 voiceInvalidate();voiceSetBusy(v,true);voiceMessage(v,'Mikrofonzugriff wird angefragt …');
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!voiceActive(v)){stream.getTracks().forEach(t=>t.stop());return;}v.stream=stream;
  const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(m=>MediaRecorder.isTypeSupported?.(m));
  let recorder;try{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);}catch{recorder=new MediaRecorder(stream);}
  const chunks=[];v.recorder=recorder;v.recordingFailed=false;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onerror=()=>{v.recordingFailed=true;v.root.querySelector('[data-stop]').hidden=true;voiceCleanup(v);voiceMessage(v,'Aufnahme fehlgeschlagen. Bitte erneut versuchen.');voiceSetBusy(v,false);};
  recorder.onstop=async()=>{
   clearTimeout(v.timer);stream.getTracks().forEach(t=>t.stop());if(!voiceActive(v)||v.recordingFailed)return;
   v.root.querySelector('[data-stop]').hidden=true;voiceMessage(v,'Aufnahme wird in Text umgewandelt …');
   try{
    const audioMime=recorder.mimeType||chunks.find(chunk=>chunk.type)?.type||mime;
    const blob=new Blob(chunks,{type:audioMime});if(blob.size>2500000||!blob.size)throw new Error('Aufnahme leer oder zu groß. Bitte kürzer aufnehmen.');
    const audio=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    const result=await voiceRequest({action:'transcribe',audio,mime:audioMime});if(!voiceActive(v))return;
    const field=v.root.querySelector('#voiceTranscript');field.value=[field.value,result.text].filter(Boolean).join('\n');voiceMessage(v,'Text erkannt. Bitte prüfen und „Angaben auswerten“ wählen.');
   }catch(e){voiceMessage(v,e.message);}finally{if(voiceActive(v))voiceSetBusy(v,false);}
  };
  recorder.start(1000);v.root.querySelector('[data-stop]').hidden=false;voiceMessage(v,'Aufnahme läuft – maximal 90 Sekunden. Zum Abschluss „Aufnahme beenden“ antippen.');v.timer=setTimeout(()=>voiceStop(),90000);
 }catch(e){voiceCleanup(v);if(voiceActive(v)){voiceSetBusy(v,false);voiceMessage(v,e.name==='NotAllowedError'?'Mikrofon nicht freigegeben. Bitte Browserberechtigung erlauben oder über die Tastatur diktieren.':e.message);}}
}
function voiceStop(){const v=ecgVoice;if(v?.recorder?.state==='recording')v.recorder.stop();}
function voiceManual(){const v=ecgVoice;if(!v||v.busy)return;voicePreview(v,{questions:['Datum und Zeiten bitte vollständig eintragen.'],entries:[{note:v.root.querySelector('#voiceTranscript').value}]});}
async function voiceAnalyze(){
 const v=ecgVoice;if(!v||v.busy)return;const text=v.root.querySelector('#voiceTranscript').value.trim();if(!text)return voiceMessage(v,'Bitte zuerst aufnehmen oder Text eingeben.');
 voiceSetBusy(v,true);voiceMessage(v,'Datum, Zeiten und Tätigkeiten werden ausgewertet …');
 try{const result=await voiceRequest({action:'analyze',text});if(voiceActive(v))voicePreview(v,result.draft);}catch(e){voiceMessage(v,e.message);}finally{if(voiceActive(v))voiceSetBusy(v,false);}
}
function voicePreview(v,draft){
 v.frozen=null;v.requestId=crypto.randomUUID();
 const entries=draft.entries?.length?draft.entries:[{}];
 const input=(name,label,type,value,max='')=>`<div class="field"><label>${label}<input data-field="${name}" type="${type}" value="${esc(value||'')}" ${max?`maxlength="${max}"`:''} required></label></div>`;
 v.root.querySelector('[data-voice-preview]').innerHTML=`<h3>Vorschau – bitte kontrollieren</h3>${(draft.questions||[]).length?`<div class="notice">${draft.questions.map(q=>esc(q)).join('<br>')}<br>Fehlendes unten ergänzen oder den Text oben vervollständigen und erneut auswerten.</div>`:''}<p class="meta">Alle Zeiten gelten für Deutschland. Ende am Folgetag ausdrücklich eintragen. Mehrere Einsätze werden gemeinsam gespeichert.</p><form onsubmit="event.preventDefault();voiceSave()">${entries.map((e,i)=>`<fieldset data-voice-entry style="border:1px solid var(--line);border-radius:12px;margin:12px 0;padding:12px"><legend>Einsatz ${i+1}</legend><div class="formgrid">${input('date','Datum Beginn','date',e.date)}${input('startTime','Beginn','time',e.startTime)}${input('endDate','Datum Ende','date',e.endDate||e.date)}${input('endTime','Ende','time',e.endTime)}<div class="wide">${input('workLabel','Tätigkeit','text',e.workLabel,200)}</div><div class="field wide"><label>Bemerkung<textarea data-field="note" rows="4" maxlength="4000">${esc(e.note||'')}</textarea></label></div><label class="wide"><input data-field="volunteer" type="checkbox" ${e.volunteer?'checked':''}> Freiwilliger Dienst</label></div></fieldset>`).join('')}<label style="display:block;margin:12px 0"><input type="checkbox" required> Datum, Zeiten, Pausen und Tätigkeiten geprüft</label><button type="submit" class="btn primary" data-voice-action>Verbindlich speichern</button></form>`;
 voiceMessage(v,'Noch nichts gespeichert. Bitte die Vorschau kontrollieren.');
}
function voiceSyncText(sync){return ({synced:'Organisationstool: Übertragung bestätigt.',pending:'Organisationstool: Übertragung noch offen. Du kannst sie erneut versuchen; beim nächsten App-Speichern wird sie ebenfalls versucht.',not_configured:'Organisationstool: Synchronisation ist noch nicht vollständig eingerichtet.',not_applicable:'Für dieses Benutzerkonto ist keine Übertragung ins Organisationstool eingerichtet.'})[sync?.status]||'Organisationstool: Status unbekannt.';}
async function voiceRetrySync(){const v=ecgVoice;if(!v||v.busy)return;voiceSetBusy(v,true);try{const b=await voiceRequest({action:'sync'});voiceMessage(v,'In ECG gespeichert. '+voiceSyncText(b.sync));}catch(e){voiceMessage(v,'In ECG gespeichert. Übertragung nicht bestätigt: '+e.message);}finally{if(voiceActive(v))voiceSetBusy(v,false);}}
async function voiceSave(){
 const v=ecgVoice;if(!v||v.busy||!voiceActive(v))return;
 if(!v.frozen){
  const entries=[...v.root.querySelectorAll('[data-voice-entry]')].map(box=>Object.fromEntries([...box.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.type==='checkbox'?input.checked:input.value])));
  v.frozen={action:'save',requestId:v.requestId,entries};
 }
 v.root.querySelectorAll('[data-voice-entry] input,[data-voice-entry] textarea').forEach(input=>input.disabled=true);
 voiceSetBusy(v,true);voiceMessage(v,'Wird in ECG gespeichert …');
 try{
  clearTimeout(syncTimer);await syncCloud();if(!voiceActive(v))return;
  const b=await voiceRequest(v.frozen);if(!voiceActive(v))return;
  const ids=new Set(b.entries.map(e=>e.id));state.timeEntries=[...b.entries,...(state.timeEntries||[]).filter(e=>!ids.has(e.id))];b.entries.forEach(e=>timeEntryIdsSeen.add(e.id));
  try{localStorage.setItem('cleaningAppState',JSON.stringify(state));}catch{/* Server save is authoritative. */}
  render();const report=document.getElementById('shareMyTimes')?.closest('.modal-backdrop');if(report)renderTimeReport(report);
  v.root.querySelector('[data-voice-preview]').innerHTML=`<div class="notice">${b.entries.length} Buchung(en) in ECG gespeichert. Sie erscheinen in der Wochenübersicht und im PDF.</div><div class="row wrap" style="margin-top:12px"><button class="btn" data-voice-action onclick="voiceRetrySync()">Übertragung erneut prüfen</button><button class="btn primary" onclick="closeModal()">Fertig</button></div>`;
  voiceMessage(v,'Gespeichert. '+voiceSyncText(b.sync));v.frozen=null;
 }catch(e){voiceMessage(v,e.message+' Bitte Zeiten prüfen und bei Bedarf erneut speichern.');
  // A changed draft gets a fresh request only after explicit new analysis; retry is idempotent.
  if(e.status===400||e.status===409){v.frozen=null;v.requestId=crypto.randomUUID();v.root.querySelectorAll('[data-voice-entry] input,[data-voice-entry] textarea').forEach(input=>input.disabled=false);}
  else v.root.querySelectorAll('[data-voice-entry] input,[data-voice-entry] textarea').forEach(input=>input.disabled=true);
 }finally{if(voiceActive(v))voiceSetBusy(v,false);}
}
