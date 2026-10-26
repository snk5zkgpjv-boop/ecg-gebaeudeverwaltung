import { createHash } from 'node:crypto';
import { buildUsageDocument } from '../assets/event-usage-model.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function eventUsage(req,res,sql,auth,has) {
  res.setHeader('Cache-Control','private, no-store');
  if (!has(auth.profile,'manageCalendar')) return res.status(403).json({error:'Keine Berechtigung für Veranstaltungsvereinbarungen.'});
  if (req.method === 'GET') {
    const eventId = String(req.query.eventId || '');
    const document = (auth.state.eventUsageAgreements || []).find(d=>d.eventId === eventId) || null;
    return res.status(200).json({document});
  }
  if (req.method !== 'PATCH' || !req.body?.eventUsage || Object.keys(req.body).length !== 1) return res.status(400).json({error:'Ungültige Anfrage.'});
  const {document:raw,expectedVersion,mutationId} = req.body.eventUsage;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || typeof mutationId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(mutationId) || !raw || JSON.stringify(raw).length > 150000) return res.status(400).json({error:'Ungültige Speicherdaten.'});
  const requestHash=digest(raw);
  for(let attempt=0;attempt<3;attempt++) {
    const rows=await sql`SELECT data,revision FROM app_state WHERE id='main'`;
    if(!rows.length)return res.status(404).json({error:'App-Daten nicht gefunden.'});
    const {data,revision}=rows[0];
    const profile=(data.users||[]).find(u=>u.id===auth.profile.id);
    if(!profile || profile.active===false || !has(profile,'manageCalendar')) return res.status(403).json({error:'Berechtigung wurde geändert. Bitte neu anmelden.'});
    const documents=data.eventUsageAgreements||[], old=documents.find(d=>d.eventId===raw.eventId);
    if(old?.mutationId===mutationId) {
      if(old.requestHash!==requestHash || old.updatedBy!==profile.id)return res.status(409).json({error:'Speichervorgang enthält andere Daten.'});
      return res.status(200).json({ok:true,document:old});
    }
    if((old?.version||0)!==expectedVersion)return res.status(409).json({error:'Die Vereinbarung wurde inzwischen geändert. Entwurf kopieren und die Vereinbarung erneut öffnen.'});
    let document;
    try {document=buildUsageDocument(raw,data,profile,old);} catch(e) {return res.status(400).json({error:e.message});}
    document={...document,version:expectedVersion+1,updatedAt:new Date().toISOString(),mutationId,requestHash};
    const next=[...documents.filter(d=>d.eventId!==document.eventId),document];
    const saved=await sql`UPDATE app_state SET data=jsonb_set(data,'{eventUsageAgreements}',${JSON.stringify(next)}::jsonb),revision=revision+1,updated_at=now() WHERE id='main' AND revision=${revision} RETURNING revision`;
    if(saved.length)return res.status(200).json({ok:true,document});
  }
  return res.status(409).json({error:'Gleichzeitige Änderung. Bitte erneut speichern.'});
}
