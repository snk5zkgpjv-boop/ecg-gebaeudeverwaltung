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
  const start=get('.rs-start'),list=get('.rs-items'),notice=get('.rs-status');
  start.value=sheet?.start||(event.allDay?'09:00':clock.format(new Date(event.start)));
  let version=sheet?.version||0,lastBody='',mutationId='';
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
   row.querySelector('.rs-up').onclick=()=>{list.insertBefore(row,row.previousElementSibling);update();};
   row.querySelector('.rs-down').onclick=()=>{list.insertBefore(row.nextElementSibling,row);update();};
   row.querySelector('.rs-remove').onclick=()=>{row.remove();update();};
   list.append(row);update();
   return row;
  }
  for(const item of sheet?.items||[])add(item);
  start.oninput=update;list.oninput=update;update();
  get('.rs-add').onclick=()=>{if(list.children.length>=80){notice.textContent='Höchstens 80 Programmpunkte möglich.';return;}add().querySelector('input').focus();};
  get('.rs-save').onclick=async()=>{
   for(const input of view.querySelectorAll('input'))if(!input.reportValidity())return;
   const items=Array.from(list.children,row=>({title:row.querySelector('.rs-title').value.trim(),minutes:Number(row.querySelector('[type=number]').value),lead:row.querySelector('.rs-lead').value.trim()}));
   const data={version,start:start.value,items};
   const key=JSON.stringify(data);
   if(lastBody!==key){mutationId=crypto.randomUUID();lastBody=key;}
   const controls=[...view.querySelectorAll('input,button:not(.modal-close)')];
   controls.forEach(c=>c.disabled=true);notice.textContent='Speichern …';
   try{const saved=await request({...data,mutationId});if(active()){version=saved.version;notice.textContent='Ablaufplan gespeichert.';}}
   catch(e){if(active())notice.textContent=e.message;}
   finally{if(active()){controls.forEach(c=>c.disabled=false);update();}}
  };
 }catch(e){if(active())view.querySelector('[role=status]').textContent=e.message;}
};
