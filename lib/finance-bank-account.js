import {neon} from './db.js';
import {sessionUser,profileFor} from './auth.js';

export function validIban(raw){
 const iban=String(raw||'').replace(/\s/g,'').toUpperCase();
 if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)||iban.length>34)return false;
 const sequence=iban.slice(4)+iban.slice(0,4);
 let remainder=0;
 for(const char of sequence){
  const value=char>='A'&&char<='Z'?String(char.charCodeAt(0)-55):char;
  for(const digit of value)remainder=(remainder*10+Number(digit))%97;
 }
 return remainder===1;
}
export function validateBankAccount(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ungültige Kontodaten.');
 const accountHolder=String(value.accountHolder||'').trim();
 const bankAccount=String(value.bankAccount||'').replace(/\s/g,'').toUpperCase();
 const bankBic=String(value.bankBic||'').trim().toUpperCase();
 const bankName=String(value.bankName||'').trim();
 if(!accountHolder||accountHolder.length>160)throw Error('Kontoinhaber fehlt oder ist zu lang.');
 if(!validIban(bankAccount))throw Error('IBAN ist ungültig.');
 if(!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bankBic))throw Error('BIC ist ungültig.');
 if(bankName.length>120)throw Error('Bankname ist zu lang.');
 return {accountHolder,bankAccount,bankBic,bankName};
}
const extract=doc=>({accountHolder:String(doc?.accountHolder||''),bankAccount:String(doc?.bankAccount||''),bankBic:String(doc?.bankBic||''),bankName:String(doc?.bankName||'')});
export async function financeBankAccount(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Datenbank nicht eingerichtet.'});
 const sql=neon(process.env.DATABASE_URL);
 const user=await sessionUser(req,sql);
 if(!user)return res.status(401).json({error:'Bitte anmelden.'});
 if(user.must_change_password)return res.status(403).json({error:'Bitte zuerst das Kennwort ändern.'});
 const [row]=await sql`SELECT data->'users' AS users, data->'eventDocumentSettings' AS settings, revision FROM app_state WHERE id='main'`;
 const profile=profileFor({users:row?.users||[]},user);
 if(!profile||profile.active===false)return res.status(403).json({error:'Benutzerkonto nicht freigeschaltet.'});
 if(req.method==='GET')return res.status(200).json({bank:extract(row.settings),canEdit:profile.role==='admin',revision:profile.role==='admin'?row.revision:undefined});
 if(req.method!=='PATCH')return res.status(405).json({error:'Methode nicht erlaubt.'});
 if(profile.role!=='admin')return res.status(403).json({error:'Nur Administratoren können die Gemeindekontodaten ändern.'});
 const origin=String(req.headers.origin||'');
 if(!origin||new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Herkunft der Änderung nicht bestätigt.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON erwartet.'});
 const expected=Number(req.body?.revision);
 if(!Number.isSafeInteger(expected)||expected<0)return res.status(400).json({error:'Ungültige Versionsnummer.'});
 let details;try{details=validateBankAccount(req.body?.bank)}catch(e){return res.status(400).json({error:e.message})}
 const updated=await sql`UPDATE app_state SET data=jsonb_set(
   data,'{eventDocumentSettings}',COALESCE(data->'eventDocumentSettings','{}'::jsonb)||${JSON.stringify(details)}::jsonb,true
 ),revision=revision+1,updated_at=now() WHERE id='main' AND revision=${expected} RETURNING revision`;
 if(!updated.length)return res.status(409).json({error:'Die App-Daten wurden zwischenzeitlich geändert. Kontodaten bitte neu laden.'});
 return res.status(200).json({ok:true,bank:details,revision:updated[0].revision});
}
