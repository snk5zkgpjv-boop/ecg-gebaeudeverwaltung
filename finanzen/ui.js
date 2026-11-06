import {receipts,openPilot,listReceipts,changeReceipt} from './pilot.js';
const el=id=>document.getElementById(id);
const labels={offen:'Offen',eingereicht:'Eingereicht',freigegeben:'Freigegeben',gebucht:'Im Testjournal'};
const actions={offen:['einreichen','Auslage einreichen'],eingereicht:['freigeben','Testfreigabe erteilen'],freigegeben:['buchen','Ins Testjournal buchen']};
const money=cents=>(cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const statuses=message=>el('status').textContent=message;
const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
let owner=null,db=null,generation=0,updating=false,financeLead=false;
const local=new URLSearchParams(location.search).get('lokal')==='1';
if(local){
 el('scope-note').textContent='Persönlicher Testlauf mit Musterbelegen. Änderungen werden nur in diesem Browser gespeichert.';
 el('switch').textContent='Zum gemeinsamen ECG-Testjournal';el('switch').href='./';
}
async function server(body){
 const res=await fetch('/api/state?financePilot=1',{method:body?'POST':'GET',cache:'no-store',headers:{'X-ECG-User-Id':owner,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await res.json();
 if(!res.ok){if([401,403].includes(res.status))el('pilot').hidden=true;throw Error(data.error||'Testjournal nicht erreichbar.');}
 return data;
}

async function account(){
 const response=await fetch('/api/auth/session',{cache:'no-store'});
 if(response.status===401){location.replace('/?einstieg=portal');throw Error('Anmeldung erforderlich.');}
 if(!response.ok)throw Error('Zugang konnte nicht geprüft werden.');
 const {user}=await response.json();
 if(!user?.appUserId||user.mustChangePassword||['member','technician'].includes(user.role)||(user.role!=='admin'&&user.permissions?.viewFinance!==true)){
  generation++;el('pilot').hidden=true;throw Error('Für das Finanzmodul fehlt die Freigabe.');
 }
 financeLead=['admin','financeDeacon'].includes(user.role);
 return user.appUserId;
}
async function render(){
 const current=++generation;
 const rows=local?await listReceipts(db,owner):(await server()).rows;
 if(current!==generation)return;
 const cards=el('receipts'),journal=el('journal');cards.replaceChildren();journal.replaceChildren();
 for(const receipt of receipts){
  const state=rows.find(row=>row.receiptId===receipt.id),status=state?.status||'offen';
  const card=element('article','');card.dataset.id=receipt.id;
  card.append(element('h3',receipt.title),element('p',receipt.costCenter+' · '+money(receipt.cents)),element('p',labels[status]));
  const details=element('details','');
  details.append(element('summary','Musterbeleg ansehen'),element('p','Beleg '+receipt.id+' · Beispielkasse · '+receipt.title+' · '+money(receipt.cents)));
  card.append(details);
  const next=actions[status];
  if(next&&(local||financeLead||next[0]==='einreichen')){
   const button=element('button',next[1]);button.disabled=updating;
   button.onclick=()=>save(receipt.id,next[0]);card.append(button);
  }else if(next){card.append(element('p','Nächster Schritt durch die Finanzdiakonie oder Administration.'));}
  cards.append(card);
  if(state?.journal)journal.append(element('p',state.journal.id+' · '+receipt.title+' · '+money(state.journal.cents)));
 }
 if(!journal.children.length)journal.append(element('p','Noch keine Testbuchungen.'));
 el('pilot').hidden=false;
}
async function save(id,action){
 if(updating)return;
 updating=true;el('receipts').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{
  if(await account()!==owner){el('pilot').hidden=true;throw Error('Konto gewechselt. Bitte Seite neu laden.');}
  if(local)await changeReceipt(db,owner,id,action);
  else await server({id,action});
  statuses('Teststand gespeichert.');
 }catch(e){statuses(e.message);}
 finally{updating=false;if(!el('pilot').hidden)await render().catch(e=>statuses(e.message));}
}
try{
 owner=await account();if(local)db=await openPilot();await render();statuses('');
 window.addEventListener('focus',async()=>{try{if(await account()!==owner)throw Error('Konto gewechselt. Bitte Seite neu laden.');await render();}catch(e){el('pilot').hidden=true;statuses(e.message);}});
}catch(e){statuses(e.message);}
