const el=id=>document.getElementById(id);
const adminView=new URLSearchParams(location.search).get('ansicht')==='mitgliederverwaltung';
const fields={name:'Name',birthDate:'Geburtsdatum',street:'Straße und Hausnummer',postalCode:'PLZ',city:'Ort',email:'E-Mail',phone:'Telefon'};
let user,records=[],accounts=[],current,photo=null,pending=[];
function status(message){el('status').textContent=message;}
async function api(body){
 const result=await fetch('/api/state?members='+(adminView?'list':'self'),{method:body?'POST':'GET',cache:'no-store',headers:{'X-ECG-User-Id':user.appUserId,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const json=await result.json();if(!result.ok)throw Error(json.error||'Anfrage fehlgeschlagen.');return json;
}
function edit(member={}){
 current=member;photo=null;el('photo').value='';el('editor').hidden=false;el('registry').hidden=true;
 el('edit-title').textContent=adminView?(member.id?'Mitglied bearbeiten':'Mitglied anlegen'):'Persönliche Angaben';
 for(const key of Object.keys(fields))el(key).value=member.data?.[key]??'';
 el('portrait').hidden=!member.photo;if(member.photo)el('portrait').src=member.photo;else el('portrait').removeAttribute('src');
 el('account-label').hidden=!adminView;el('account').value=member.account_id||'';el('cancel').hidden=!adminView;
}
function list(){
 el('registry').hidden=false;el('editor').hidden=true;const node=el('list');node.replaceChildren();
 const matches=records.filter(m=>m.data.name.toLocaleLowerCase('de').includes(el('search').value.toLocaleLowerCase('de')));
 for(const member of matches){const b=document.createElement('button');b.textContent=member.data.name;b.onclick=()=>{status('');edit(member)};node.append(b);}
 if(!matches.length)node.textContent='Keine Mitglieder gefunden.';
}
async function reload(){
 const result=await api();
 if(!adminView){edit(result.member);return;}
 records=result.members;accounts=result.accounts;
 el('account').replaceChildren(new Option('Ohne Kontozuordnung',''),...accounts.map(a=>new Option(a.name,a.id)));list();
}
for(const [key,label] of Object.entries(fields)){
 const field=document.createElement('label'),input=document.createElement('input');field.textContent=label;input.id=key;input.required=key==='name';input.type=key==='birthDate'?'date':key==='email'?'email':key==='phone'?'tel':'text';field.append(input);el('fields').append(field);
}
el('photo').onchange=async()=>{
 const file=el('photo').files[0];if(!file)return;
 el('save').disabled=true;
 try{
  if(file.size>10000000||!['image/jpeg','image/png'].includes(file.type))throw Error('Bitte JPG oder PNG bis 10 MB auswählen.');
  const img=await createImageBitmap(file),scale=Math.min(1,640/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);img.close();
  photo=canvas.toDataURL('image/jpeg',0.82);el('portrait').src=photo;el('portrait').hidden=false;status('Foto ausgewählt. Zum Übernehmen speichern.');
 }catch(e){status(e.message);}finally{el('save').disabled=false;}
};
el('editor').onsubmit=async event=>{
 event.preventDefault();el('save').disabled=true;
 try{
  const data=Object.fromEntries(Object.keys(fields).map(key=>[key,el(key).value]));
  await api({data,version:current.version||0,id:current.id,accountId:el('account').value,photo});await reload();status('Gespeichert.');
 }catch(e){status(e.message);}finally{el('save').disabled=false;}
};
el('new').onclick=()=>edit();el('search').oninput=list;el('cancel').onclick=list;
el('import').onclick=()=>{el('importer').hidden=!el('importer').hidden;};
const download=document.createElement('button');
download.textContent='Als Excel exportieren';el('import').after(download);
download.onclick=async()=>{
 download.disabled=true;
 try{
  const r=await fetch('/api/state?members=list&download=xlsx',{cache:'no-store',headers:{'X-ECG-User-Id':user.appUserId}});
  if(!r.ok)throw Error('Export fehlgeschlagen. Bitte Anmeldung und Berechtigung prüfen.');
  const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');
  a.href=url;a.download='ECG-Mitglieder.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status('Excel-Datei zum Download bereitgestellt.');
 }catch(e){status(e.message);}finally{download.disabled=false;}
};
const headings={name:'name',vorname:'first',nachname:'last',familienname:'last',geburtsdatum:'birthDate',geburtstag:'birthDate',straße:'street',strasse:'street',adresse:'street',plz:'postalCode',postleitzahl:'postalCode',ort:'city',wohnort:'city',email:'email',telefon:'phone',telefonnummer:'phone'};
function date(value){
 if(value instanceof Date)return value.toISOString().slice(0,10);
 const str=String(value),match=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(str);
 if(match)return match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(str))throw Error('Geburtsdatum in Excel als Datum, TT.MM.JJJJ oder JJJJ-MM-TT angeben.');
 return str;
}
el('file').onchange=async()=>{
 pending=[];el('confirm').hidden=true;el('preview').replaceChildren();el('summary').textContent='';
 try{
  const file=el('file').files[0];if(!file)return;
  if(!/\.xlsx$/i.test(file.name)||file.size>2000000)throw Error('Bitte eine .xlsx-Datei bis 2 MB wählen.');
  const [header,...rows]=await readXlsxFile(file);
  const keys=(header||[]).map(h=>headings[String(h).trim().toLowerCase().replace(/[-\s]/g,'')]);
  if(!keys.includes('name')&&!keys.includes('last'))throw Error('Spalte „Name“ oder „Nachname“ fehlt.');
  if(rows.length>2000)throw Error('Höchstens 2000 Zeilen je Import.');
  const parsed=rows.filter(row=>row.some(v=>v!==null&&v!=='')).map((row,index)=>{
   const item={};keys.forEach((key,i)=>{if(key&&row[i]!=null)item[key]=key==='birthDate'?date(row[i]):String(row[i]).trim();});
   item.name=item.name||[item.first,item.last].filter(Boolean).join(' ');delete item.first;delete item.last;
   if(!item.name)throw Error('Name fehlt in Datenzeile '+(index+1)+'.');return item;
  });
  const table=el('preview');for(const row of [Object.values(fields),...parsed.map(item=>Object.keys(fields).map(k=>item[k]||''))]){
   const tr=table.insertRow();for(const text of row)tr.insertCell().textContent=text;
  }
  pending=parsed;el('summary').textContent=pending.length+' Zeilen zur Prüfung. Identische Namen mit gleichem Geburtsdatum und gleicher E-Mail werden übersprungen. Konten ordnest du anschließend zu.';el('confirm').hidden=!pending.length;
 }catch(e){status(e.message);}
};
el('confirm').onclick=async()=>{
 el('confirm').disabled=true;
 try{const r=await api({rows:pending});pending=[];el('importer').hidden=true;el('confirm').hidden=true;el('file').value='';el('preview').replaceChildren();await reload();status(r.added+' angelegt, '+r.skipped+' übersprungen.');}
 catch(e){status(e.message);}finally{el('confirm').disabled=false;}
};
try{
 const session=await fetch('/api/auth/session',{cache:'no-store'});
 if([401,403].includes(session.status)){location.replace('/?einstieg=portal');}else{
  if(!session.ok)throw Error('Anmeldung konnte nicht geprüft werden.');
  ({user}=await session.json());el('title').textContent=adminView?'Mitgliederverwaltung':'Mein Profil';await reload();status('');
 }
}catch(e){status(e.message);}
