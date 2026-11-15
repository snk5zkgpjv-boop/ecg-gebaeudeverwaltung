import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

// AES-256-GCM envelope format. The secret must live in Vercel/hosting env, never in Git.
// Rotate only with a planned re-encryption of all existing claims and attachments.
function secret(){
 const raw=process.env.ECG_EXPENSES_DATA_KEY||'';
 if(!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw Object.assign(new Error('Verschlüsselung des Finanzmoduls nicht eingerichtet.'),{code:'EXPENSE_KEY_MISSING'});
 const key=Buffer.from(raw,'base64');
 if(key.length!==32)throw Object.assign(new Error('Ungültige Finanzverschlüsselung.'),{code:'EXPENSE_KEY_MISSING'});
 return key;
}
export function financeCryptoReady(){try{secret();return true}catch{return false}}
export function encryptBytes(bytes){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),nonce);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([Buffer.from('ECG1'),nonce,cipher.getAuthTag(),ciphertext]);
}
export function decryptBytes(data){
 const b=Buffer.from(data);
 if(b.length<32||b.subarray(0,4).toString()!=='ECG1')throw Error('Belegverschlüsselung beschädigt oder unbekannt.');
 const decipher=createDecipheriv('aes-256-gcm',secret(),b.subarray(4,16));
 decipher.setAuthTag(b.subarray(16,32));
 return Buffer.concat([decipher.update(b.subarray(32)),decipher.final()]);
}
export const encryptText=text=>encryptBytes(Buffer.from(text,'utf8')).toString('base64');
export const decryptText=value=>decryptBytes(Buffer.from(value,'base64')).toString('utf8');
