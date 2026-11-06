// Fixed receipts keep the pilot synthetic; it has no import, upload or free-text field.
export const receipts=[
 {id:'M-001',title:'Papierhandtücher',costCenter:'Gebäudepflege',cents:1850},
 {id:'M-002',title:'Kaffee für ein Teamtreffen',costCenter:'Veranstaltungen',cents:2490},
 {id:'M-003',title:'Namensetiketten',costCenter:'Kinderstunde',cents:760}
];
const sequence={einreichen:['offen','eingereicht'],freigeben:['eingereicht','freigegeben'],buchen:['freigegeben','gebucht']};
export function transition(previous,receiptId,action,now){
 const receipt=receipts.find(r=>r.id===receiptId);
 if(!receipt||!Object.hasOwn(sequence,action))throw Error('Unbekannter Testvorgang.');
 const [from,to]=sequence[action],status=previous?.status||'offen';
 if(status===to)return previous; // retry, including a replay after a lost response
 if(status!==from)throw Error('Der Stand hat sich geändert. Bitte die Übersicht prüfen.');
 return {receiptId,status:to,updated:now,journal:action==='buchen'?{id:'TEST-'+receiptId,cents:receipt.cents,date:now}:null};
}

// A read/modify/write transaction serializes actions on the same account and receipt across tabs.
export function openPilot(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('ecg-finance-synthetic-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('receipts',{keyPath:['owner','receiptId']});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('Lokaler Testspeicher ist nicht verfügbar.'));
 });
}
export function listReceipts(db,owner){
 return new Promise((resolve,reject)=>{
  const store=db.transaction('receipts').objectStore('receipts');
  const request=store.getAll(IDBKeyRange.bound([owner,''],[owner,'\uffff']));
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('Testdaten konnten nicht gelesen werden.'));
 });
}
export function changeReceipt(db,owner,id,action){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('receipts','readwrite'),store=tx.objectStore('receipts');
  let error;
  const request=store.get([owner,id]);
  request.onsuccess=()=>{
   try{
    const next=transition(request.result,id,action,new Date().toISOString());
    if(next!==request.result)store.put({...next,owner});
   }catch(e){error=e;tx.abort();}
  };
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(error||Error('Speichern fehlgeschlagen. Bitte erneut versuchen.'));
 });
}
