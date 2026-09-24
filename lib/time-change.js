// Dedicated own-time writes. Receipts and per-entry versions make retries safe.
const fields=['id','userId','start','end','roomId','workLabel','note','volunteer','timeRevision'];
export function timeBase(entry){return entry?Object.fromEntries(fields.map(k=>[k,entry[k]??(k==='volunteer'?false:'')])):null;}
export function applyTimeChange(state,profile,op,now=Date.now()){
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 if(profile.role==='technician')fail('Zeiterfassung ist für Technik nicht freigeschaltet.',403);
 if(!op||!/^[-a-zA-Z0-9]{16,80}$/.test(op.id||'')||!/^[-_a-zA-Z0-9]{1,160}$/.test(op.entryId||'')||op.userId!==profile.id)fail('Ungültige Zeitänderung.',403);
 const receipts=state.timeWriteReceipts||{},versions=state.timeWriteVersions||{},receipt=receipts[op.id];
 if(receipt){if(receipt.userId!==profile.id||receipt.entryId!==op.entryId)fail('Anfrage gehört einem anderen Konto.',403);return {duplicate:true};}
 const current=(state.timeEntries||[]).find(e=>e.id===op.entryId);
 if(current&&current.userId!==profile.id)fail('Nur eigene Arbeitszeiten können geändert werden.',403);
 if(!['create','update','delete'].includes(op.action))fail('Unbekannte Zeitänderung.');
 if(op.action==='create'){
  if(current||versions[op.entryId])fail('Diese Buchung wurde bereits angelegt oder gelöscht. Bitte Übersicht aktualisieren.',409);
 }else if(!current||JSON.stringify(timeBase(current))!==JSON.stringify(timeBase(op.before))){fail('Dieser Eintrag wurde inzwischen auf einem anderen Gerät geändert. Dein Entwurf bleibt auf diesem Gerät erhalten. Bitte Änderung prüfen.',409);}
 let entry=null;
 if(op.action!=='delete'){
  const raw=op.entry||{},start=Date.parse(raw.start),end=Date.parse(raw.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now||end-start>86400000)fail('Bitte einen abgeschlossenen Zeitraum von höchstens 24 Stunden angeben.');
  if(typeof raw.workLabel!=='string'||!raw.workLabel.trim()||raw.workLabel.length>200||String(raw.note||'').length>4000)fail('Bitte Tätigkeit und eine gültige Bemerkung angeben.');
  if((state.timeEntries||[]).some(e=>e.id!==op.entryId&&e.userId===profile.id&&Date.parse(e.start)<end&&Date.parse(e.end)>start))fail('Der Zeitraum überschneidet sich mit einer vorhandenen eigenen Buchung. Bitte prüfen.',409);
  entry={...(current||{}),id:op.entryId,userId:profile.id,start:new Date(start).toISOString(),end:new Date(end).toISOString(),roomId:String(raw.roomId||'').slice(0,160),workLabel:raw.workLabel.trim(),note:String(raw.note||'').trim(),volunteer:raw.volunteer===true,timeRevision:op.id};
 }
 return {timeEntries:[...(entry?[entry]:[]),...(state.timeEntries||[]).filter(e=>e.id!==op.entryId)],timeWriteVersions:{...versions,[op.entryId]:{userId:profile.id,revision:op.id,deleted:!entry}},timeWriteReceipts:{...receipts,[op.id]:{userId:profile.id,entryId:op.entryId,action:op.action,at:new Date(now).toISOString()}}};
}
export async function handleTimeChange(sql,auth,op,res,sync){
 try{
  for(let attempt=0;attempt<4;attempt++){
   const rows=await sql`SELECT data,revision FROM app_state WHERE id='main'`;
   if(!rows.length)throw Error('missing state');
   const current=rows[0].data,result=applyTimeChange(current,auth.profile,op);
   if(!result.duplicate){
    const times=JSON.stringify(result.timeEntries),versions=JSON.stringify(result.timeWriteVersions),receipts=JSON.stringify(result.timeWriteReceipts);
    const written=await sql`UPDATE app_state SET data=jsonb_set(jsonb_set(jsonb_set(data,'{timeEntries}',${times}::jsonb),'{timeWriteVersions}',${versions}::jsonb),'{timeWriteReceipts}',${receipts}::jsonb),revision=revision+1,updated_at=now() WHERE id='main' AND revision=${rows[0].revision} RETURNING revision`;
    if(!written.length)continue;
    Object.assign(current,result);
   }
   const syncResult=await sync(current,auth.profile);
   return res.status(200).json({ok:true,operationId:op.id,entries:(current.timeEntries||[]).filter(e=>e.userId===auth.profile.id),sync:syncResult});
  }
  return res.status(409).json({error:'Gleichzeitige Änderung. Bitte Übertragung erneut versuchen.'});
 }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Speichern nicht bestätigt. Die Buchung bleibt auf diesem Gerät zur erneuten Übertragung erhalten.'});}
}
