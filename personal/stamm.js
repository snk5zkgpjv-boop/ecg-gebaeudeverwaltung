const el=id=>document.getElementById(id);
let user,editing=null,saving=false;
async function api(body){
 const method=body?(body.id?'PATCH':'POST'):'GET';
 const r=await fetch('/api/state?personnel=stamm',{method,cache:'no-store',headers:{'X-ECG-User-Id':user.appUserId,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await r.json();
 if(!r.ok)throw Error(result.error||'Anfrage fehlgeschlagen.');
 return result;
}
async function refresh(){
 const {staff,accounts}=await api();
 el('editor').elements.account_id.replaceChildren(new Option('Ohne Konto',''),...accounts.map(a=>new Option(a.name,a.id)));
 const entries=el('entries');entries.replaceChildren();
 for(const row of staff){
  const article=document.createElement('article'),name=document.createElement('h3'),details=document.createElement('p');
  name.textContent=row.name;details.textContent=[row.duty,row.employment==='Offen'?'Beschäftigungsart offen':row.employment,row.hourly?'Abrechnung nach Stunden':''].filter(Boolean).join(' · ');
  const edit=document.createElement('button');edit.textContent='Bearbeiten';edit.setAttribute('aria-label',row.name+' bearbeiten');
  edit.onclick=()=>openEditor(row);
  const identity=document.createElement('div'),account=document.createElement('p');
  account.className='account-state';
  const linked=accounts.find(a=>a.id===row.account_id);
  account.textContent=linked?'Benutzerkonto: '+linked.name:row.account_id?'Konto zugeordnet (inaktiv)':'Kein Benutzerkonto verknüpft';
  identity.append(name,details);article.append(identity,account,edit);entries.append(article);
 }
 el('registry').hidden=false;el('status').textContent=staff.length+' Beschäftigte';
}
function openEditor(row=null){
 if(saving)return;
 editing=row;el('coverage-settings').hidden=!row;
 const form=el('editor');form.reset();
 if(row){
  for(const key of ['name','duty','employment'])form.elements[key].value=row[key];
  form.elements.hourly.checked=row.hourly;
  for(const key of ['account_id','cover_group','handover'])form.elements[key].value=row[key]||'';
 }
 el('edit-title').textContent=row?'Personal bearbeiten':'Personal anlegen';
 form.hidden=false;form.elements.name.focus();form.scrollIntoView({block:'center'});
}
el('new').onclick=()=>openEditor();
el('cancel').onclick=()=>{if(saving)return;editing=null;el('editor').reset();el('editor').hidden=true;};
el('editor').onsubmit=async e=>{
 e.preventDefault();if(saving)return;saving=true;const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form));data.hourly=form.elements.hourly.checked;
  if(editing){data.id=editing.id;data.revision=editing.revision;}
  await api(data);editing=null;form.reset();form.hidden=true;await refresh();
  el('status').textContent='Gespeichert: '+data.name;
 }catch(e){el('status').textContent=e.message;}finally{button.disabled=false;saving=false;}
};
try{
 const r=await fetch('/api/auth/session',{cache:'no-store'});
 if(r.status===401)location.replace('/?einstieg=portal');
 else{if(!r.ok)throw Error('Anmeldung prüfen.');({user}=await r.json());await refresh();}
}catch(e){el('status').textContent=e.message;}
