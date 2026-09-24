// Retain a private deletion marker so stale devices cannot recreate removed issues.
export async function deleteIssue(sql,auth,id,res){
 if(auth.profile.role==='technician'||!(auth.profile.role==='admin'||(auth.profile.permissions?.manageIssues??auth.profile.role==='coordinator')))return res.status(403).json({error:'Keine Berechtigung zum Löschen von Mängeln.'});
 if(typeof id!=='string'||!/^[-_a-zA-Z0-9]{1,160}$/.test(id))return res.status(400).json({error:'Ungültiger Mangel.'});
 for(let attempt=0;attempt<4;attempt++){
  const rows=await sql`SELECT data,revision FROM app_state WHERE id='main'`;
  if(!rows.length)return res.status(404).json({error:'Datenstand nicht gefunden.'});
  const current=rows[0].data,issue=(current.issues||[]).find(i=>i.id===id);
  if(!issue)return current.deletedIssues?.[id]?res.status(200).json({ok:true,deletedId:id}):res.status(404).json({error:'Mangel nicht gefunden. Bitte Ansicht aktualisieren.'});
  const issues=JSON.stringify(current.issues.filter(i=>i.id!==id));
  const planning=JSON.stringify(Object.fromEntries(Object.entries(current.issuePlanning||{}).map(([owner,plans])=>[owner,Object.fromEntries(Object.entries(plans||{}).filter(([issueId])=>issueId!==id))])));
  const deleted=JSON.stringify({...current.deletedIssues,[id]:{issue,deletedAt:new Date().toISOString(),deletedBy:auth.profile.id}});
  const updated=await sql`UPDATE app_state SET data=jsonb_set(jsonb_set(jsonb_set(data,'{issues}',${issues}::jsonb),'{issuePlanning}',${planning}::jsonb),'{deletedIssues}',${deleted}::jsonb),revision=revision+1,updated_at=now() WHERE id='main' AND revision=${rows[0].revision} RETURNING revision`;
  if(updated.length)return res.status(200).json({ok:true,deletedId:id});
 }
 return res.status(409).json({error:'Gleichzeitige Änderung. Bitte Löschen erneut versuchen.'});
}
