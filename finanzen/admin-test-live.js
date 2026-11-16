import {renderExpensePaper} from './auslagen-druck.js';
const $=id=>document.getElementById(id);
const fmt=c=>(c/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const labels={submitted:'Eingereicht',question:'Rückfrage offen',approved:'Freigegeben',paid:'Ausgezahlt',rejected:'Abgelehnt'};
let claims=[];
const status=txt=>{$('status').textContent=txt};
function reset(){
 claims=[
  {id:'MUSTER-001',description:'Papierhandtücher (fiktiv)',project:'Gebäudepflege',date:'2026-11-12',cents:1850,state:'submitted'},
  {id:'MUSTER-002',description:'Bastelmaterial (fiktiv)',project:'Kinderstunde',date:'2026-11-13',cents:2490,state:'approved'}
 ];
 render();
}
function printClaim(c){
 renderExpensePaper($('paper'),{
  items:[{date:c.date,description:c.description,project:c.project,cents:c.cents}],
  reimbursementType:'refund',
  // In der Demo grundsätzlich keine echten personenbezogenen Bankangaben.
  lastName:'Musterperson',
  firstName:'Test',
  city:'Musterort',
  bankOwner:'Musterperson Test'
 },{demo:true});
 window.print();
}

function render(){
 const list=$('claims');list.replaceChildren();
 for(const c of claims){
  const card=document.createElement('article');card.className='card';
  const title=document.createElement('strong');title.textContent=c.id+' · '+labels[c.state]+' · '+fmt(c.cents);
  const text=document.createElement('p');text.textContent=c.date+' · '+c.description+' · '+c.project;
  card.append(title,text);
  const actions=[];
  if(c.state==='submitted')actions.push(['question','Rückfrage'],['approved','Freigeben'],['rejected','Ablehnen']);
  if(c.state==='question')actions.push(['submitted','Erneut vorlegen']);
  if(c.state==='approved')actions.push(['paid','Auszahlung simulieren']);
  for(const [next,label] of actions){
    const button=document.createElement('button');button.textContent=label;
    button.onclick=()=>{c.state=next;render()};
    card.append(button);
  }
  const print=document.createElement('button');print.textContent='Antrag drucken / PDF';
  print.onclick=()=>printClaim(c);card.append(print);
  list.append(card);
 }
}
$('form').onsubmit=e=>{
 e.preventDefault();
 const date=$('date').value,raw=$('amount').value.replace(/\s/g,'').replace(',','.');
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)){status('Bitte einen gültigen Betrag eingeben.');return}
 const cents=Math.round(Number(raw)*100);
 if(!Number.isSafeInteger(cents)||cents<=0){status('Bitte einen Betrag größer als null eingeben.');return}
 claims.unshift({id:'MUSTER-'+String(claims.length+1).padStart(3,'0'),description:$('description').value.trim(),project:$('project').value.trim(),date,cents,state:'submitted'});
 $('form').reset();status('Musterantrag im Browser erstellt – keine Daten versendet.');render();
};
$('reset').onclick=()=>{reset();status('Musteranträge zurückgesetzt.')};
try{
 const response=await fetch('/api/auth/session',{cache:'no-store'});
 if(!response.ok)throw new Error('Bitte über die ECG-App anmelden.');
 const {user}=await response.json();
 if(!user||user.mustChangePassword||!['admin','financeDeacon'].includes(user.role))throw new Error('Nur Administration und Finanzdiakonie dürfen den Testbereich nutzen.');
 $('app').hidden=false;reset();status('Demo bereit. Es werden keine echten Finanzdaten verarbeitet.');
}catch(e){status(e.message)}
