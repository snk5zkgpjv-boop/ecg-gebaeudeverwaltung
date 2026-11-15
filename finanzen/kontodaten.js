const byId=id=>document.getElementById(id);
let current=null,revision=null;
function present(bank){
 byId('holder').textContent=bank.accountHolder||'Nicht hinterlegt';
 byId('iban').textContent=(bank.bankAccount||'').replace(/(.{4})/g,'$1 ').trim()||'Nicht hinterlegt';
 byId('bic').textContent=bank.bankBic||'Nicht hinterlegt';
 byId('bank-name').hidden=byId('bank-name-label').hidden=!bank.bankName;
 byId('bank-name').textContent=bank.bankName||'';
 byId('edit-holder').value=bank.accountHolder||'';
 byId('edit-iban').value=bank.bankAccount||'';
 byId('edit-bic').value=bank.bankBic||'';
 byId('edit-name').value=bank.bankName||'';
 byId('details').hidden=false;
 current=bank;
}
async function fetchJson(options){
 const response=await fetch('/api/state?bankAccount=1',{cache:'no-store',...options});
 const body=await response.json().catch(()=>({error:'Ungültige Serverantwort.'}));
 if(!response.ok)throw Object.assign(new Error(body.error||'Abruf fehlgeschlagen.'),{status:response.status});
 return body;
}
byId('copy-iban').onclick=async()=>{
 if(!current?.bankAccount)return;
 try{await navigator.clipboard.writeText(current.bankAccount);byId('status').textContent='IBAN kopiert.'}
 catch{byId('status').textContent='Kopieren nicht möglich. Bitte IBAN manuell auswählen.'}
};
byId('print').onclick=()=>window.print();
byId('form').onsubmit=async event=>{
 event.preventDefault();
 const button=byId('form').querySelector('[type=submit]');button.disabled=true;
 try{
  const bank={accountHolder:byId('edit-holder').value,bankAccount:byId('edit-iban').value,bankBic:byId('edit-bic').value,bankName:byId('edit-name').value};
  const data=await fetchJson({method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,bank})});
  revision=data.revision;present(data.bank);byId('status').textContent='Kontodaten gespeichert.';
 }catch(error){byId('status').textContent=error.message}
 finally{button.disabled=false}
};
try{
 const data=await fetchJson();
 if(data.canEdit){revision=data.revision;byId('editor').hidden=false}
 present(data.bank);
 byId('status').textContent=data.bank.bankAccount?'':'Kontodaten sind noch nicht hinterlegt.';
}catch(error){
 if(error.status===401||error.status===403)byId('status').textContent='Bitte anmelden und die Seite erneut öffnen.';
 else byId('status').textContent=error.message;
}