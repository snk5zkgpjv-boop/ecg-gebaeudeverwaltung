import {validateIssue} from './issue-create.js';

// Shadow tables are not authoritative until the operator has performed the
// explicit, write-frozen cutover. Unset/unknown values fail back to JSONB.
export const issuesInTables=(env=process.env)=>env.ISSUES_SOURCE==='tables';
const issueIdValid=id=>typeof id==='string' && /^[-_a-zA-Z0-9]{1,160}$/.test(id);
const mayManage=(profile,has)=>profile.role!=='technician' && has(profile,'manageIssues');

export async function readTableIssues(sql){
 const rows=await sql`SELECT r.payload, (p.issue_id IS NOT NULL) AS has_photo
   FROM ecg_issue_records r LEFT JOIN ecg_issue_photos p ON p.issue_id=r.id
   ORDER BY r.sort_order,r.id`;
 return rows.map(({payload,has_photo})=>has_photo?{...payload,hasPhoto:true}:payload);
}
export async function readTablePhoto(sql,id){
 const rows=await sql`SELECT p.image_data_url AS photo FROM ecg_issue_photos p
   JOIN ecg_issue_records r ON r.id=p.issue_id WHERE r.id=${id} LIMIT 1`;
 return rows[0]?.photo||null;
}
export async function readTableIssue(sql,id){
 const rows=await sql`SELECT r.payload, p.image_data_url AS photo FROM ecg_issue_records r
   LEFT JOIN ecg_issue_photos p ON p.issue_id=r.id WHERE r.id=${id} LIMIT 1`;
 if(!rows.length)return null;
 return {...rows[0].payload,photo:rows[0].photo||null};
}

export async function createTableIssue(sql,auth,raw,res){
 let issue;
 try{issue=validateIssue(raw,auth.profile,auth.state);}
 catch(error){return res.status(400).json({error:error.message});}
 if(Object.hasOwn(auth.state.deletedIssues||{},issue.id))
   return res.status(409).json({error:'Diese Meldung wurde bereits gelöscht.'});
 const {photo,...payload}=issue;
 // The record and its photo are created in ONE SQL statement/transaction.
 // The source JSONB remains untouched throughout tables mode.
 const created=await sql`WITH inserted AS (
   INSERT INTO ecg_issue_records(id,sort_order,room_id,status,payload,source_revision)
   VALUES(${issue.id},(SELECT COALESCE(MAX(sort_order),-1)+1 FROM ecg_issue_records),
     ${issue.roomId},${issue.status},${JSON.stringify(payload)}::jsonb,
     (SELECT revision FROM app_state WHERE id='main'))
   ON CONFLICT(id) DO NOTHING RETURNING id
 ), photo_written AS (
   INSERT INTO ecg_issue_photos(issue_id,image_data_url,source_revision)
   SELECT id,${photo},(SELECT revision FROM app_state WHERE id='main')
   FROM inserted WHERE ${photo} IS NOT NULL
   RETURNING issue_id
 )
 SELECT inserted.id,(SELECT count(*) FROM photo_written) AS photos FROM inserted`;
 if(created.length)return res.status(200).json({ok:true,issue});
 const existing=await readTableIssue(sql,issue.id);
 if(existing && existing.createdBy===auth.profile.id &&
    ['text','roomId','outdoorId','assetId','priority','photo'].every(key=>existing[key]===issue[key]))
   return res.status(200).json({ok:true,issue:existing});
 return res.status(409).json({error:'Die Meldung wurde bereits mit anderen Angaben gespeichert. Bitte die Mängelliste prüfen.'});
}

export async function updateTableIssue(sql,auth,raw,res,has){
 if(!mayManage(auth.profile,has))
   return res.status(403).json({error:'Keine Berechtigung zum Bearbeiten von Mängeln.'});
 const id=raw?.id,changes=raw?.changes;
 if(!issueIdValid(id)||!changes||typeof changes!=='object'||Array.isArray(changes))
   return res.status(400).json({error:'Ungültige Mangeländerung.'});
 const allowed=new Set(['text','roomId','outdoorId','assetId','priority','status']);
 if(!Object.keys(changes).length||Object.keys(changes).some(key=>!allowed.has(key)))
   return res.status(400).json({error:'Nicht erlaubte Mangeländerung.'});
 if(changes.status!==undefined && !['open','work','done'].includes(changes.status))
   return res.status(400).json({error:'Ungültiger Status.'});
 if(changes.priority!==undefined && !['normal','hoch','dringend'].includes(changes.priority))
   return res.status(400).json({error:'Ungültige Priorität.'});
 if(changes.text!==undefined && (typeof changes.text!=='string'||!changes.text.trim()||changes.text.length>8000))
   return res.status(400).json({error:'Ungültige Beschreibung.'});
 const patch={...changes};
 if(patch.text!==undefined)patch.text=patch.text.trim();
 for(const [key,collection] of [['roomId','rooms'],['outdoorId','outdoorAreas'],['assetId','inventory']]){
   if(key in patch && (typeof patch[key]!=='string' || (patch[key] && !(auth.state[collection]||[]).some(x=>x.id===patch[key]))))
     return res.status(400).json({error:'Die gewählte Zuordnung existiert nicht mehr.'});
 }
 const hasStatus=Object.hasOwn(patch,'status'),status=hasStatus?patch.status:'';
 const rows=await sql`UPDATE ecg_issue_records SET
    payload=(payload || ${JSON.stringify(patch)}::jsonb ||
      CASE WHEN ${hasStatus} THEN
        jsonb_build_object('completedAt',
          CASE WHEN ${status}='done' THEN
            COALESCE(NULLIF(payload->'completedAt','null'::jsonb),to_jsonb(now()::text))
          ELSE 'null'::jsonb END)
      ELSE '{}'::jsonb END) - 'photo' - 'hasPhoto',
    room_id=COALESCE(${patch.roomId===undefined?null:patch.roomId},room_id),
    status=COALESCE(${hasStatus?status:null},status)
    WHERE id=${id} RETURNING payload`;
 if(!rows.length)return res.status(404).json({error:'Mangel nicht gefunden. Bitte Ansicht aktualisieren.'});
 const photo=await sql`SELECT issue_id FROM ecg_issue_photos WHERE issue_id=${id}`;
 return res.status(200).json({ok:true,issue:photo.length?{...rows[0].payload,hasPhoto:true}:rows[0].payload});
}

export async function updateTablePhoto(sql,auth,raw,res,has){
 if(!mayManage(auth.profile,has))return res.status(403).json({error:'Keine Berechtigung zum Bearbeiten von Mängeln.'});
 const id=raw?.id,photo=raw?.photo;
 if(!issueIdValid(id)||typeof photo!=='string'||photo.length>2800000||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))
   return res.status(400).json({error:'Ungültiges Mängelfoto.'});
 const rows=await sql`INSERT INTO ecg_issue_photos(issue_id,image_data_url,source_revision)
   SELECT r.id,${photo},r.source_revision FROM ecg_issue_records r WHERE r.id=${id}
   ON CONFLICT(issue_id) DO UPDATE SET image_data_url=EXCLUDED.image_data_url,
   source_revision=EXCLUDED.source_revision RETURNING issue_id`;
 return rows.length?res.status(200).json({ok:true,hasPhoto:true}):
   res.status(404).json({error:'Mangel nicht gefunden.'});
}

export async function deleteTableIssue(sql,auth,id,res,has){
 if(!mayManage(auth.profile,has))return res.status(403).json({error:'Keine Berechtigung zum Löschen von Mängeln.'});
 if(!issueIdValid(id))return res.status(400).json({error:'Ungültiger Mangel.'});
 // The FK cascades to the photo. Prune personal plans in the same statement.
 // Critically, do not touch app_state.data->'issues'.
 const rows=await sql`WITH removed AS (
   DELETE FROM ecg_issue_records WHERE id=${id} RETURNING id
 ), cleaned AS (
   UPDATE app_state SET data=jsonb_set(data,'{issuePlanning}',
     (SELECT COALESCE(jsonb_object_agg(owner,COALESCE(plans,'{}'::jsonb)-${id}),'{}'::jsonb)
      FROM jsonb_each(COALESCE(data->'issuePlanning','{}'::jsonb)) AS plan(owner,plans)),
     true),revision=revision+1,updated_at=now()
   WHERE id='main' AND EXISTS(SELECT 1 FROM removed) RETURNING revision
 )
 SELECT id,(SELECT count(*) FROM cleaned) AS cleaned FROM removed`;
 if(!rows.length)return res.status(404).json({error:'Mangel nicht gefunden. Bitte Ansicht aktualisieren.'});
 return res.status(200).json({ok:true,deletedId:id});
}
