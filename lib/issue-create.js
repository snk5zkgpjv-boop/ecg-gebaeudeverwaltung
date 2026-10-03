// A small, authenticated write avoids localStorage and full-state upload limits.
export function validateIssue(raw, profile, state) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ungültiger Mangel.');
  if (typeof raw.id !== 'string' || !/^issue_[a-zA-Z0-9_-]{1,100}$/.test(raw.id)) throw new Error('Ungültige Kennung.');
  if (typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 8000) throw new Error('Bitte eine Beschreibung mit höchstens 8000 Zeichen eingeben.');
  for (const [key, collection] of [['roomId','rooms'],['outdoorId','outdoorAreas'],['assetId','inventory']]) {
    if (raw[key] && !(state[collection] || []).some(x => x.id === raw[key])) throw new Error('Die gewählte Zuordnung existiert nicht mehr. Bitte neu auswählen.');
  }
  if (raw.photo != null && (typeof raw.photo !== 'string' || raw.photo.length > 2800000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.photo))) throw new Error('Das Foto ist zu groß oder ungültig. Bitte ein kleineres Foto auswählen.');
  return {id:raw.id, roomId:raw.roomId||'', outdoorId:raw.outdoorId||'', assetId:raw.assetId||'', text:raw.text.trim(), priority:['normal','hoch','dringend'].includes(raw.priority)?raw.priority:'normal', photo:raw.photo||null, status:'open', created:new Date().toISOString(), createdBy:profile.id};
}

export async function createIssue(sql, auth, raw, res) {
  let issue;
  try { issue=validateIssue(raw,auth.profile,auth.state); }
  catch(error) { return res.status(400).json({error:error.message}); }
  for(let attempt=0;attempt<3;attempt++) {
    const rows=await sql`SELECT data,revision FROM app_state WHERE id='main'`;
    if(!rows.length) return res.status(404).json({error:'App-Daten nicht gefunden.'});
    const {data,revision}=rows[0];
    if(Object.hasOwn(data.deletedIssues||{},issue.id)) return res.status(409).json({error:'Diese Meldung wurde bereits gelöscht.'});
    const old=(data.issues||[]).find(x=>x.id===issue.id);
    if(old) {
      if(old.createdBy!==auth.profile.id || ['text','roomId','outdoorId','assetId','priority','photo'].some(key=>old[key]!==issue[key])) return res.status(409).json({error:'Die Meldung wurde bereits mit anderen Angaben gespeichert. Bitte die Mängelliste prüfen.'});
      return res.status(200).json({ok:true,issue:old});
    }
    // Revalidate associations against the freshly read state on every retry.
    try { validateIssue(raw,auth.profile,data); } catch(error) { return res.status(400).json({error:error.message}); }
    const saved=await sql`UPDATE app_state SET data=jsonb_set(data,'{issues}',${JSON.stringify([issue])}::jsonb || COALESCE(data->'issues','[]'::jsonb)),revision=revision+1,updated_at=now() WHERE id='main' AND revision=${revision} RETURNING revision`;
    if(saved.length) return res.status(200).json({ok:true,issue});
  }
  return res.status(409).json({error:'Gleichzeitige Änderung. Bitte nochmals auf Melden tippen.'});
}
