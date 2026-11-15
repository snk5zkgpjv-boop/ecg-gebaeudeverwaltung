const $=s=>document.querySelector(s);
const fmt=c=>(c/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api='/api/state?expenses=1';
let user=null,scanData=null,scanName=null,finance=false;
let submissionKey=crypto.randomUUID();
const info=(msg)=>{$('#status').textContent=msg};
function position(entry={}){
 const section=document.createElement('section');section.className='position';
 section.innerHTML=`<div class="position-grid"><div><label>Datum</label><input class="date" type="date" required></div><div><label>Betrag in Euro</label><input class="amount" type="text" inputmode="decimal" placeholder="0,00" required></div></div><label>Bezeichnung / Artikel</label><input class="description" maxlength="200" required><label>Anlass / Projekt</label><input class="project" maxlength="120"><button class="remove" type="button">Position entfernen</button>`;
 section.querySelector('.date').value=entry.date||'';
 section.querySelector('.description').value=entry.description||'';
 section.querySelector('.project').value=entry.project||'';
 section.querySelector('.amount').value=entry.amountEuros||'';
 section.querySelector('.remove').onclick=()=>{section.remove();if(!$('#positions').children.length)position();recalc()};
 section.querySelector('.amount').oninput=recalc;
 $('#positions').append(section);recalc();
}
function parseAmount(s){
 const raw=String(s).trim().replace(/\s/g,'');
 if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(raw))throw Error('Bitte gültige Eurobeträge mit höchstens zwei Nachkommastellen eingeben.');
 const [whole,frac='']=raw.replace(',','.').split('.');
 const cents=Number(whole)*100+Number(frac.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Jeder Betrag muss größer als null sein.');
 return cents;
}
function itemsFromForm(){
 return Array.from($('#positions').children).map(el=>({
  description:el.querySelector('.description').value.trim(),
  project:el.querySelector('.project').value.trim(),
  date:el.querySelector('.date').value,
  cents:parseAmount(el.querySelector('.amount').value)
 }));
}
function recalc(){try{$('#total').textContent=fmt(itemsFromForm().reduce((sum,item)=>sum+item.cents,0));}catch{$('#total').textContent='Bitte Beträge prüfen';}}
async function json(url,options){
 const response=await fetch(url,{cache:'no-store',...options});
 let body;try{body=await response.json()}catch{throw Error('Ungültige Serverantwort.')}
 if(!response.ok)throw Error(body.error||'Anfrage fehlgeschlagen.');
 return body;
}
function loadImage(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Foto kann nicht geöffnet werden.'));reader.readAsDataURL(file);
 });
}
async function compressImage(file){
 const data=await loadImage(file);
 if(file.type==='application/pdf')return {name:file.name,type:file.type,data:String(data).split(',')[1]};
 const image=new Image();image.src=data;await image.decode();
 const scale=Math.min(1,1600/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return {name:file.name.replace(/\.[^.]+$/,'.jpg'),type:'image/jpeg',data:canvas.toDataURL('image/jpeg',.78).split(',')[1]};
}
function printPaper(claim,includeBank=false){
 const items=claim.items||[];
 const total=claim.total_cents??items.reduce((a,x)=>a+x.cents,0);
 $('#paper').innerHTML=`<h1>Auslagenerstattung – Evangeliums-Christengemeinde</h1><p>ECG Hussenhofen · Hauptstraße 20 · 73527 Schwäbisch Gmünd</p><p><b>Antragsteller:</b> ${esc(claim.applicant_name||user?.name||'')}<br><b>Vorgang:</b> ${esc(claim.id||'Entwurf')}<br><b>Status:</b> ${esc(claim.status||'Entwurf')}</p><table><thead><tr><th>Datum</th><th>Ausgabe</th><th>Projekt / Anlass</th><th>Betrag</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.description)}</td><td>${esc(x.project)}</td><td>${fmt(x.cents)}</td></tr>`).join('')}</tbody></table><p style="text-align:right"><strong>Gesamtsumme: ${fmt(total)}</strong></p><p>Erstattungsart: ${claim.reimbursement_type==='waiver'?'Verzicht auf Kostenerstattung – gesonderte Prüfung':'Banküberweisung'}</p>${includeBank&&claim.reimbursement_type!=='waiver'?`<p>Kontoinhaber: ${esc(claim.bank_owner||'')}<br>IBAN: ${esc(claim.bank_iban||'')}</p>`:''}<p class="print-note">Eingereichte Belege: ${(claim.receipts||[]).length}. Das Original und die Belege werden elektronisch verwaltet. Diese Druckansicht ist keine Spendenbescheinigung.</p><p>Ausgedruckt am ${new Date().toLocaleDateString('de-DE')}.</p>`;
 window.print();
}
async function refresh(){
 const mine=await json(api);
 const container=$('#mine');container.replaceChildren();
 if(!mine.claims.length)container.textContent='Noch keine Anträge.';
 for(const claim of mine.claims){
  const div=document.createElement('article');div.className='claim-card';
  div.innerHTML=`<strong>${fmt(claim.total_cents)}</strong> · ${esc(claim.status)}<p>${new Date(claim.created_at).toLocaleDateString('de-DE')} · ${esc(claim.items.map(x=>x.description).join(', '))}</p>`;
  const print=document.createElement('button');print.textContent='Antrag drucken / PDF';print.onclick=()=>printPaper(claim);
  if(claim.note){const message=document.createElement('p');message.textContent='Rückmeldung des Finanzteams: '+claim.note;div.append(message);}for(const event of claim.history||[]){if(!event.note)continue;const msg=document.createElement('p');msg.textContent=(event.event==='reply'?'Antwort: ':'Hinweis: ')+event.note;div.append(msg);}div.append(print);if(claim.status==='question'){const respond=document.createElement('button');respond.textContent='Rückfrage beantworten / erneut vorlegen';respond.onclick=async()=>{const answer=prompt('Antwort auf die Rückfrage (max. 500 Zeichen):');if(!answer?.trim())return;try{await json(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reply',id:claim.id,answer:answer.trim()})});await refresh()}catch(e){alert(e.message)}};div.append(respond)}container.append(div);
 }
 if(!finance)return;
 const all=await json(api+'&scope=team');const box=$('#team');box.replaceChildren();
 if(!all.claims.length)box.textContent='Keine eingereichten Anträge.';
 for(const claim of all.claims){
  const div=document.createElement('article');div.className='claim-card';
  div.innerHTML=`<strong>${esc(claim.applicant_name)}</strong> · ${fmt(claim.total_cents)}<p>Status: ${esc(claim.status)}</p><p>${esc(claim.items.map(x=>x.description).join(', '))}</p>`;
  const print=document.createElement('button');print.textContent='Drucken / PDF';print.onclick=()=>printPaper(claim,true);div.append(print);
  for(const event of claim.history||[]){if(!event.note)continue;const line=document.createElement('p');line.textContent=(event.event==='reply'?'Antwort des Antragstellers: ':'Bearbeitungsvermerk: ')+event.note;div.append(line)}
  for(const id of claim.receipts||[]){
   const link=document.createElement('a');link.href=api+'&receipt='+encodeURIComponent(id.id);link.textContent='Beleg: '+id.name;link.rel='noopener';link.style.display='block';div.append(link);
  }
  const actions={submitted:[['approve','Freigeben'],['question','Rückfrage'],['reject','Ablehnen']],approved:claim.reimbursement_type==='refund'?[['pay','Auszahlung dokumentieren']]:[]};
  for(const [action,label] of actions[claim.status]||[]){
   if(claim.applicant_id===user.appUserId||(action==='pay'&&claim.reviewer_id===user.appUserId))continue;
   const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{
    const note=action==='question'||action==='reject'?prompt('Begründung / Rückfrage:'):'';
    if((action==='question'||action==='reject')&&note===null)return;
    if((action==='approve'||action==='pay')&&!confirm(label+'?'))return;
    try{b.disabled=true;await json(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:claim.id,note:note||''})});await refresh();}catch(e){alert(e.message);b.disabled=false;}
   };div.append(b);
  }
  box.append(div);
 }
}
$('#add').onclick=()=>position();
$('#print').onclick=()=>{
 try{
 const items=itemsFromForm();
 const type=$('input[name=kind]:checked').value;
 printPaper({applicant_name:user.name,items,total_cents:items.reduce((s,x)=>s+x.cents,0),reimbursement_type:type,bank_owner:$('#bank-owner').value,bank_iban:$('#iban').value},true);
 }catch(e){info(e.message);}
};
document.querySelectorAll('input[name=kind]').forEach(el=>el.addEventListener('change',()=>{$('#bank').hidden=$('input[name=kind]:checked').value==='waiver'}));
$('#scan').onchange=async()=>{
 const file=$('#scan').files?.[0];scanData=null;scanName=null;$('#recognize').disabled=true;if(!file)return;
 try{const prepared=await compressImage(file);scanData='data:'+prepared.type+';base64,'+prepared.data;scanName=prepared.name;$('#recognize').disabled=false;$('#scan-status').textContent='Foto vorbereitet. Jetzt Erkennung starten.';}catch(e){$('#scan-status').textContent=e.message;}
};
$('#recognize').onclick=async()=>{
 if(!scanData)return;
 if(!$('#scan-consent').checked){$('#scan-status').textContent='Bitte der KI-Bildübertragung zustimmen oder die Angaben manuell eintragen.';return;}
 $('#recognize').disabled=true;$('#scan-status').textContent='Foto wird ausgewertet …';
 try{
 const result=await json('/api/ai?expensesScan=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:scanData})});
 const draft=result.draft;
 $('#positions').replaceChildren();
 for(const item of draft.items||[])position(item);
 if(!$('#positions').children.length)position();
 if(draft.reimbursementType==='waiver')$('input[name=kind][value=waiver]').click();
 $('#iban').value=draft.iban||'';$('#bank-owner').value=draft.bankOwner||'';
 $('#scan-status').textContent='Daten als Entwurf übernommen. Bitte jede Position und insbesondere Beträge, Datum und IBAN mit dem Foto vergleichen. '+(draft.warnings||[]).join(' ');
 $('#confirm').checked=false;
 }catch(e){$('#scan-status').textContent=e.message;}
 finally{$('#recognize').disabled=false;}
};
$('#form').onsubmit=async ev=>{
 ev.preventDefault();
 const btn=$('#send');btn.disabled=true;
 try{
 const items=itemsFromForm();
 const selected=Array.from($('#files').files||[]).slice(0,6);
 const files=await Promise.all(selected.map(compressImage));
 if(scanData&&!files.some(f=>f.name===scanName)&&files.length<6)files.push({name:scanName,type:scanData.split(';')[0].slice(5),data:scanData.split(',')[1]});
 if(!files.length)throw Error('Mindestens einen Beleg hinzufügen.');
 const type=$('input[name=kind]:checked').value;
 const result=await json(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',submissionKey,items,files,reimbursementType:type,iban:$('#iban').value,bankOwner:$('#bank-owner').value})});
 info('Antrag erfolgreich eingereicht. Vorgang '+result.id);submissionKey=crypto.randomUUID();
 $('#form').reset();$('#positions').replaceChildren();position();scanData=null;scanName=null;await refresh();
 }catch(e){info('Nicht eingereicht: '+e.message);}finally{btn.disabled=false;}
};
async function start(){
 try{
 const res=await fetch('/api/auth/session',{cache:'no-store'});if(res.status===401){location.replace('/?einstieg=portal');return;}
 if(!res.ok)throw Error('Anmeldung nicht verfügbar.');
 const body=await res.json();user=body.user;
 if(!user||user.mustChangePassword)throw Error('Bitte zuerst die Anmeldung abschließen.');
 finance=user.role==='admin'||user.role==='financeDeacon';
 if(user.role==='admin'){
  const link=document.createElement('a');link.href='/finanzen/erfassung.html?test=1';link.textContent='Admin-Testmodus (Musteranträge)';link.className='parent-link';$('#applicant').before(link);
  if(new URLSearchParams(location.search).get('test')==='1'){
   $('#app').hidden=false;$('#form').hidden=false;$('#claims').hidden=true;$('#finance').hidden=false;
   $('#finance').querySelector('h2').textContent='Admin-Test: Finanzablauf';
   const {initAdminTest}=await import('./admin-test.js');
   const demo=initAdminTest($('#team'),printPaper);
   position();
   $('#form').onsubmit=ev=>{
    ev.preventDefault();
    try{
     const items=itemsFromForm(),total_cents=items.reduce((s,x)=>s+x.cents,0);
     const reimbursement_type=$('input[name=kind]:checked').value;
     const claim={id:'DEMO-'+crypto.randomUUID().slice(0,8).toUpperCase(),applicant_name:'Testperson (Admin-Vorschau)',applicant_id:'demo-new',items,total_cents,reimbursement_type,status:'submitted',receipts:[],created_at:new Date().toISOString()};
     demo.add(claim);info('Demo-Antrag lokal erstellt. Keine Übertragung an ECG oder Finanzteam.');
     $('#form').reset();$('#positions').replaceChildren();position();
    }catch(e){info('Demo-Antrag nicht erstellt: '+e.message);}
   };
   info('Testmodus mit fiktiven Daten. Formulareingaben bleiben nur in dieser Browseransicht.');return;
  }
 }
 $('#applicant').textContent=user.name;$('#finance').hidden=!finance;$('#app').hidden=false;info('');
 position();await refresh();
 }catch(e){info(e.message);}
}
start();