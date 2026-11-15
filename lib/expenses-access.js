import {neon} from '@neondatabase/serverless';
import {sessionUser,appState,profileFor} from './auth.js';
export async function expenseAuth(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(!process.env.DATABASE_URL){res.status(503).json({error:'Datenbank nicht konfiguriert.'});return null;}
  const sql=neon(process.env.DATABASE_URL);
  const user=await sessionUser(req,sql);
  if(!user){res.status(401).json({error:'Bitte anmelden.'});return null;}
  if(user.must_change_password){res.status(403).json({error:'Bitte Kennwort ändern.'});return null;}
  const profile=profileFor(await appState(sql),user);
  if(!profile||profile.active===false){res.status(403).json({error:'Konto nicht freigeschaltet.'});return null;}
  return {sql,user,profile,isFinance:profile.role==='admin'||profile.role==='financeDeacon'};
}
export function moneyCents(value){
  if(typeof value!=='number'||!Number.isInteger(value)||value<=0||value>100000000)throw Error('Ungültiger Betrag.');
  return value;
}
export function validateItems(items){
  if(!Array.isArray(items)||items.length<1||items.length>30)throw Error('Bitte 1 bis 30 Positionen erfassen.');
  return items.map(x=>{
    if(!x||typeof x.description!=='string'||!x.description.trim()||x.description.length>200||typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!Number.isFinite(Date.parse(x.date+'T12:00:00Z'))||typeof x.project!=='string'||x.project.length>120)throw Error('Beschreibung, Datum oder Projekt ungültig.');
    return {description:x.description.trim(),date:x.date,project:x.project.trim(),cents:moneyCents(x.cents)};
  });
}
export function publicClaim(row,finance=false){
  const {bank_iban,bank_owner,...rest}=row;
  return {...rest,...(finance?{bank_iban,bank_owner}:{})};
}