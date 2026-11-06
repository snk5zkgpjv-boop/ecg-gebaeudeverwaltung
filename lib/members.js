import {sessionUser,profileFor} from './auth.js';

const lengths={name:120,birthDate:10,street:160,postalCode:12,city:100,email:200,phone:60};
export function memberData(input={}){
 const data={};
 for(const [key,limit] of Object.entries(lengths)){
  const value=input[key]??'';
  if(typeof value!=='string'||value.length>limit)throw Error('Ungültiges Feld: '+key);
  data[key]=value.trim();
 }
 if(!data.name)throw Error('Name fehlt.');
 if(data.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)||new Date(data.birthDate+'T12:00:00Z').toISOString().slice(0,10)!==data.birthDate))throw Error('Ungültiges Geburtsdatum.');
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw Error('Ungültige E-Mail-Adresse.');
 return data;
}
export async function members(req,res,sql){
 res.setHeader('Cache-Control','private, no-store');
 const user=await sessionUser(req,sql);
 if(!user)return res.status(401).json({error:'Bitte anmelden.'});
 const [row]=await sql`SELECT data->'users' AS users FROM app_state WHERE id='main'`;
 const profile=profileFor(row??{},user);
 if(!profile||profile.active===false||user.must_change_password)return res.status(403).json({error:'Zugriff gesperrt.'});
 if(req.headers['x-ecg-user-id']!==profile.id)return res.status(409).json({error:'Konto gewechselt. Seite neu öffnen.'});
 const own=req.query.members==='self', manage=profile.role==='admin'||profile.permissions?.manageMembers===true;
 if(!own&&!manage)return res.status(403).json({error:'Mitgliederverwaltung nicht freigegeben.'});
 if(req.method==='GET'){
  if(own){
   const [member]=await sql`SELECT id,data,version,photo FROM ecg_members WHERE account_id=${profile.id}`;
   return res.json({member:member??{version:0,data:{name:profile.name,email:user.email}}});
  }
  const list=await sql`SELECT id,account_id,data,version FROM ecg_members ORDER BY data->>'name',id`;
  if(req.query.download==='xlsx'){
   const {memberWorkbook}=await import('./member-export.js');
   res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   res.setHeader('Content-Disposition','attachment; filename="ECG-Mitglieder.xlsx"');
   return res.send(await memberWorkbook(list));
  }
  const accounts=(row.users||[]).filter(p=>p.active!==false).map(p=>({id:p.id,name:p.name}));
  return res.json({members:list,accounts});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt.'});
 if(!String(req.headers['content-type']).startsWith('application/json'))return res.status(415).json({error:'JSON erforderlich.'});
 try{
  if(req.body?.rows){
   if(own||!manage)return res.status(403).json({error:'Import nur für Mitgliederverwaltung.'});
   if(!Array.isArray(req.body.rows)||!req.body.rows.length||req.body.rows.length>2000)throw Error('1 bis 2000 Einträge je Import.');
   const items=req.body.rows.map(memberData);
   const imported=await sql`INSERT INTO ecg_members(data) SELECT item FROM jsonb_array_elements(${JSON.stringify(items)}::jsonb) item ON CONFLICT DO NOTHING RETURNING id`;
   return res.json({added:imported.length,skipped:items.length-imported.length});
  }
  const body=req.body??{},data=memberData(body.data),version=body.version;
  if(!Number.isSafeInteger(version)||version<0)throw Error('Ungültige Version.');
  let photo=body.photo??null;
  if(photo!==null&&(typeof photo!=='string'||photo.length>700000||!/^data:image\/(?:jpeg|png);base64,[a-zA-Z0-9+/]+=*$/.test(photo)))throw Error('Ungültiges Profilbild.');
  const account=own?profile.id:body.accountId||null;
  if(!own && account && !(row.users||[]).some(p=>p.id===account))throw Error('Unbekanntes Konto.');
  let result;
  if(!version){
   result=await sql`INSERT INTO ecg_members(account_id,data,photo) VALUES(${account},${JSON.stringify(data)}::jsonb,${photo}) ON CONFLICT DO NOTHING RETURNING id,version`;
  }else if(own){
   result=await sql`UPDATE ecg_members SET data=${JSON.stringify(data)}::jsonb,photo=COALESCE(${photo},photo),version=version+1 WHERE account_id=${profile.id} AND version=${version} RETURNING id,version`;
  }else{
   result=await sql`UPDATE ecg_members SET account_id=${account},data=${JSON.stringify(data)}::jsonb,photo=COALESCE(${photo},photo),version=version+1 WHERE id::text=${String(body.id)} AND version=${version} RETURNING id,version`;
  }
  return result.length?res.json(result[0]):res.status(409).json({error:'Eintrag bereits vorhanden oder inzwischen geändert. Bitte neu laden.'});
 }catch(e){
  if(e.code==='23505')return res.status(409).json({error:'Mitglied oder Kontozuordnung schon vorhanden.'});
  if(e.code)throw e;
  return res.status(400).json({error:e instanceof RangeError?'Ungültiges Datum.':e.message});
 }
}
