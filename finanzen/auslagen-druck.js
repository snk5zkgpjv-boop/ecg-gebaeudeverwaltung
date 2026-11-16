// Gemeinsame Druckansicht anhand des ECG-Papierformulars.
// Keine serverseitigen Daten; Werte werden nur als Text eingesetzt.
const euro=cents=>(Number(cents)/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateGerman=date=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return String(date||'');
  const [y,m,d]=date.split('-');return d+'.'+m+'.'+y;
};
const text=(tag,value,className)=>{
 const el=document.createElement(tag);
 if(className)el.className=className;
 el.textContent=value??'';
 return el;
};
function field(label,value=''){
 const wrap=text('div','','expense-field');
 wrap.append(text('span',label,'label'),text('span',value,'expense-line'));
 return wrap;
}
function pair(left,right){
 const wrap=text('div','','expense-field-pair');wrap.append(left,right);return wrap;
}
function row(values,header=false){
 const tr=document.createElement('tr');
 values.forEach((v,i)=>{const td=text(header?'th':'td',v);if(!header&&i===4)td.className='amount';tr.append(td)});
 return tr;
}
function choice(value,selected){
 const wrap=text('div','','expense-choice');
 wrap.append(text('span',selected?'[x]':'[ ]','expense-choice-mark'),text('span',value));
 return wrap;
}
export function renderExpensePaper(container,claim,{demo=false}={}){
 container.replaceChildren();
 const items=Array.isArray(claim.items)?claim.items:[{date:claim.date||'',description:claim.description||'',project:claim.project||'',cents:claim.cents||0}];
 const size=10;
 const pages=Math.max(1,Math.ceil(items.length/size));
 const total=items.reduce((sum,item)=>sum+Number(item.cents||0),0);
 for(let page=0;page<pages;page++){
  const sheet=text('article','','expense-sheet');
  if(demo)sheet.append(text('div','MUSTER · KEIN ZAHLUNGSBELEG','expense-watermark'));
  const head=text('div','','expense-head');
  // Das vorhandene ECG-Wort-Bildzeichen wird nur im offiziellen Druck verwendet.
  const spacer=document.createElement('span');
  const logo=document.createElement('img');
  logo.src='/willkommen/ecg-wortmarke.png';
  logo.alt='Evangeliums Christengemeinde';
  logo.className='expense-logo';
  head.append(spacer,logo);sheet.append(head);
  sheet.append(text('h1','Auslagenerstattung'));
  sheet.append(field('An:', 'Evangeliums-Christengemeinde e. V.'));
  sheet.append(field('Adresse:', 'Hauptstraße 20'));
  sheet.append(pair(field('Postleitzahl:', '73527'),field('Ort:','Schwäbisch Gmünd - Hussenhofen')));
  sheet.append(text('p','Empfänger/in:','expense-heading'));
  sheet.append(pair(field('Name:',claim.lastName||''),field('Vorname:',claim.firstName||'')));
  sheet.append(field('Straße:',claim.street||''));
  sheet.append(pair(field('Postleitzahl:',claim.postcode||''),field('Ort:',claim.city||'')));
  sheet.append(text('p','Entstandene Kosten:','expense-heading'));
  const table=text('table','','expense-table');const thead=document.createElement('thead'),tbody=document.createElement('tbody');
  thead.append(row(['Beleg Nr.','Datum','Artikel (Bezeichnung)','Anlass / Projekt','Betrag (€)'],true));
  for(let i=0;i<size;i++){
   const index=page*size+i;
   const item=items[index];
   tbody.append(row(item?[String(index+1),dateGerman(item.date),item.description||'',item.project||'',euro(item.cents||0)]:['','','','','']));
  }
  table.append(thead,tbody);sheet.append(table);
  const sum=text('div','','expense-total');
  sum.append(text('strong',page===pages-1?'Summe der Ausgaben:':'Zwischensumme der Ausgaben:'));
  sum.append(text('span',euro(page===pages-1?total:items.slice(0,(page+1)*size).reduce((n,x)=>n+Number(x.cents||0),0)),'expense-total-value'),text('span',' €'));sheet.append(sum);
  sheet.append(choice('Bitte überweisen Sie den Betrag an:',claim.reimbursementType!=='waiver'));
  sheet.append(field('Inhaber des Kontos:',claim.bankOwner||''));
  sheet.append(field('Kontonummer / IBAN:',claim.iban||''));
  sheet.append(pair(field('Bankinstitut:',claim.bankName||''),field('BIC / BLZ:',claim.bic||'')));
  sheet.append(choice('Ich möchte den Betrag spenden (Spendenbescheinigung notwendig).',claim.reimbursementType==='waiver'));
  sheet.append(text('p','Ich versichere, dass alle Angaben richtig sind und die Sachkosten tatsächlich entstanden sind. Die notwendigen Belege habe ich beigefügt.','expense-certification'));
  sheet.append(text('p','Ort, Datum, Unterschrift des/der Sachkostenempfängers/in:','expense-signature'));
  const sig=text('div','','expense-signature-line');sig.textContent=claim.signatureLine||'';sheet.append(sig);
  const footer=text('footer','','expense-footer');
  footer.append(text('span','Evangeliums-Christengemeinde e. V.'),text('span','Hauptstraße 20'),text('span','73527 Schwäbisch Gmünd'));
  sheet.append(footer);container.append(sheet);
 }
 return {pages,total};
}
