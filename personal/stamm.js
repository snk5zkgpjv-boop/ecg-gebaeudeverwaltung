const el=id=>document.getElementById(id);
let user;
async function api(body){
 const r=await fetch('/api/state?personnel=stamm',{method:body?'POST':'GET',cache:'no-store',headers:{'X-ECG-User-Id':user.appUserId,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await r.json();
 if(!r.ok)throw Error(result.error||'Anfrage fehlgeschlagen.');
 return result;
}
async function refresh(){
 const {staff}=await api();
 const entries=el('entries');entries.replaceChildren();
 for(const row of staff){
  const article=document.createElement('article'),name=document.createElement('h3'),details=document.createElement('p');
  name.textContent=row.name;details.textContent=[row.duty,row.employment==='Offen'?'Beschäftigungsart offen':row.employment,row.hourly?'Abrechnung nach Stunden':''].filter(Boolean).join(' · ');
  article.append(name,details);entries.append(article);
 }
 el('registry').hidden=false;el('status').textContent=staff.length+' Beschäftigte';
}
el('new').onclick=()=>{el('editor').hidden=false;el('editor').elements.name.focus();};
el('cancel').onclick=()=>{el('editor').reset();el('editor').hidden=true;};
el('editor').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form));data.hourly=form.elements.hourly.checked;
  await api(data);form.reset();form.hidden=true;await refresh();
 }catch(e){el('status').textContent=e.message;}finally{button.disabled=false;}
};
try{
 const r=await fetch('/api/auth/session',{cache:'no-store'});
 if(r.status===401)location.replace('/?einstieg=portal');
 else{if(!r.ok)throw Error('Anmeldung prüfen.');({user}=await r.json());await refresh();}
}catch(e){el('status').textContent=e.message;}
