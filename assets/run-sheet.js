import {blockOptions,templates,makeBlock,makeTemplate,suggestTemplate} from './run-sheet-templates.js';
import {addRunSheetOutputs} from './run-sheet-output.js';
const clock=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

window.openRunSheet=async eventId=>{
 const event=state.calendarEvents?.find(e=>e.id===eventId);
 if(!event||event.cancelled||!can('manageCalendar'))return;
 const owner=state.currentUserId;
 const view=modal('<h2>Ablaufplan</h2><p role="status">Plan wird geladen …</p>');
 const url='/api/state?runSheet=1&eventId='+encodeURIComponent(event.id);
 const active=()=>view.isConnected&&owner===state.currentUserId&&can('manageCalendar');
 async function request(body){
  if(!active())throw Error('Konto gewechselt.');
  const res=await fetch(url,{method:body?'PATCH':'GET',cache:'no-store',headers:{'X-ECG-User-Id':owner,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const json=await res.json();
  if(!res.ok)throw Error(json.error||'Ablaufplan konnte nicht geladen werden.');
  return json.sheet;
 }
 try{
  const sheet=await request();
  if(!active())return;
  modal('<h2>Ablaufplan</h2><p class="rs-event"></p><label>Beginn (Ortszeit)<input type="time" class="rs-start" required></label><ol class="rs-items"></ol><button class="btn rs-add">Punkt hinzufügen</button><p class="rs-total"></p><p role="status" class="rs-status"></p><button class="btn primary rs-save">Ablaufplan speichern</button>',view);
  const get=s=>view.querySelector(s);
  get('.rs-event').textContent=event.title;
  if(!location.pathname.startsWith('/tests/')){
   import('./duties.js').then(({addDutyPlanner})=>{if(active())addDutyPlanner(view,owner,event.id);})
    .catch(()=>{if(active())get('.rs-status').textContent='Dienstplanung konnte nicht geladen werden.';});
  }
  const start=get('.rs-start'),list=get('.rs-items'),notice=get('.rs-status');
  const tools=document.createElement('section');
  tools.className='rs-tools';
  tools.innerHTML='<h3>Vorlagen und Bausteine</h3><label>Ablaufvorlage<select class="rs-template"></select></label><p class="rs-preview"></p><div class="row wrap"><button class="btn rs-append">Vorlage anhängen</button><button class="btn rs-replace">Punkte ersetzen</button><button class="btn rs-undo" hidden>Rückgängig</button></div><label>Einzelner Baustein<select class="rs-block"></select></label><button class="btn rs-block-add">Baustein hinzufügen</button>';
  list.before(tools);
  const source=get('.rs-template'),block=get('.rs-block'),undo=get('.rs-undo');
  source.replaceChildren(new Option('Vorlage auswählen',''),...templates.map(t=>new Option(t.title,t.id)));
  source.value=suggestTemplate(event.title);
  block.replaceChildren(...blockOptions.map(b=>new Option(b.title+' · '+b.minutes+' Min.',b.id)));
  source.onchange=()=>{
   const t=templates.find(t=>t.id===source.value);
   get('.rs-append').disabled=!t;get('.rs-replace').disabled=!t;
   get('.rs-preview').textContent=t?t.note+' Vorschlag: '+makeTemplate(t.id).map(r=>r.title+' ('+r.minutes+' Min.)').join(' · '):'';
  };
  source.onchange();
  start.value=sheet?.start||(event.allDay?'09:00':clock.format(new Date(event.start)));
  let version=sheet?.version||0,lastBody='',mutationId='',undoItems=null;
  function clearUndo(){undoItems=null;undo.hidden=true;}
  function update(){
   const [hours,minutes]=start.value.split(':').map(Number);
   let elapsed=0;
   for(const row of list.children){
    const t=hours*60+minutes+elapsed;
    row.querySelector('strong').textContent=Number.isFinite(t)?String(Math.floor(t/60)%24).padStart(2,'0')+':'+String(t%60).padStart(2,'0')+(t>=1440?' (+1 Tag)':''):'–';
    elapsed+=Number(row.querySelector('[type=number]').value)||0;
    row.querySelector('.rs-up').disabled=!row.previousElementSibling;
    row.querySelector('.rs-down').disabled=!row.nextElementSibling;
   }
   get('.rs-total').textContent='Gesamtdauer: '+elapsed+' Minuten';
  }
  function add(item={}){
   const row=document.createElement('li');
   row.innerHTML='<strong></strong><label>Programmpunkt<input class="rs-title" maxlength="160" required></label><label>Dauer (Min.)<input type="number" min="1" max="1440" required></label><label>Zuständig (optional)<input class="rs-lead" maxlength="120"></label><div class="row wrap"><button class="btn tiny rs-up">Nach oben</button><button class="btn tiny rs-down">Nach unten</button><button class="btn tiny rs-remove">Entfernen</button></div>';
   row.querySelector('.rs-title').value=item.title||'';
   row.querySelector('[type=number]').value=item.minutes??5;
   row.querySelector('.rs-lead').value=item.lead||'';
   row.querySelector('.rs-up').onclick=()=>{clearUndo();list.insertBefore(row,row.previousElementSibling);update();};
   row.querySelector('.rs-down').onclick=()=>{clearUndo();list.insertBefore(row.nextElementSibling,row);update();};
   row.querySelector('.rs-remove').onclick=()=>{clearUndo();row.remove();update();};
   list.append(row);update();
   return row;
  }
  for(const item of sheet?.items||[])add(item);
  start.oninput=update;list.oninput=()=>{clearUndo();update();};update();
  function currentItems(){
   return Array.from(list.children,row=>({title:row.querySelector('.rs-title').value,minutes:row.querySelector('[type=number]').value,lead:row.querySelector('.rs-lead').value}));
  }
  function readDraft(){
   for(const field of [start,...list.querySelectorAll('input')])if(!field.reportValidity())return null;
   const items=currentItems().map(row=>({title:row.title.trim(),minutes:Number(row.minutes),lead:row.lead.trim()}));
   if(items.some(row=>!row.title)||items.reduce((sum,r)=>sum+r.minutes,0)>1440){notice.textContent='Bitte Titel und Gesamtdauer (maximal 24 Stunden) prüfen.';return null;}
   return {start:start.value,items};
  }
  function applyPreset(items,replace){
   if(items.length+(replace?0:list.children.length)>80){notice.textContent='Höchstens 80 Programmpunkte möglich.';return;}
   if(replace&&list.children.length&&!confirm('Alle aktuellen Programmpunkte in diesem Entwurf durch die Vorlage ersetzen?'))return;
   undoItems=currentItems();undo.hidden=false;
   if(replace)list.replaceChildren();
   for(const item of items)add(item);
   notice.textContent='In den Entwurf übernommen. Zum Übernehmen für diesen Termin speichern.';
  }
  get('.rs-append').onclick=()=>applyPreset(makeTemplate(source.value),false);
  get('.rs-replace').onclick=()=>applyPreset(makeTemplate(source.value),true);
  get('.rs-block-add').onclick=()=>applyPreset([makeBlock(block.value)],false);
  undo.onclick=()=>{const before=undoItems;if(!before)return;list.replaceChildren();for(const row of before)add(row);clearUndo();update();notice.textContent='Vorherige Programmpunkte wiederhergestellt.';};
  get('.rs-add').onclick=()=>{if(list.children.length>=80){notice.textContent='Höchstens 80 Programmpunkte möglich.';return;}clearUndo();add().querySelector('input').focus();};
  const outputs=document.createElement('div');outputs.className='rs-output';get('.rs-save').after(outputs);
  addRunSheetOutputs(outputs,()=>{if(!active())return null;const draft=readDraft();return draft?{event,...draft}:null;});
  get('.rs-save').onclick=async()=>{
   const draft=readDraft();if(!draft)return;
   const data={version,...draft};
   const key=JSON.stringify(data);
   if(lastBody!==key){mutationId=crypto.randomUUID();lastBody=key;}
   const controls=[start,get('.rs-add'),get('.rs-save'),...list.querySelectorAll('input,button'),...tools.querySelectorAll('select,button')];
   controls.forEach(c=>c.disabled=true);notice.textContent='Speichern …';
   try{const saved=await request({...data,mutationId});if(active()){version=saved.version;clearUndo();notice.textContent='Ablaufplan gespeichert.';}}
   catch(e){if(active())notice.textContent=e.message;}
   finally{if(active()){controls.forEach(c=>c.disabled=false);source.onchange();update();}}
  };
 }catch(e){if(active())view.querySelector('[role=status]').textContent=e.message;}
};
