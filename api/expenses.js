import {expenseAuth,validateItems,publicClaim} from '../lib/expenses-access.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions={question:['submitted','question'],approve:['submitted','approved'],reject:['submitted','rejected'],pay:['approved','paid']};
export default async function handler(req,res){
  const a=await expenseAuth(req,res);if(!a)return;
  const {sql,profile,isFinance}=a;
  try{
    if(req.method==='GET'){
      const id=String(req.query?.receipt||'');
      if(id){
        if(!UUID.test(id))return res.status(400).json({error:'Ungültige Belegkennung.'});
        const rows=await sql`SELECT r.content,r.content_type,c.applicant_id FROM ecg_expense_receipts r JOIN ecg_expense_claims c ON c.id=r.claim_id WHERE r.id=${id} LIMIT 1`;
        const row=rows[0];if(!row||(row.applicant_id!==profile.id&&!isFinance))return res.status(404).json({error:'Beleg nicht gefunden.'});
        res.setHeader('Content-Type',row.content_type);
        res.setHeader('Content-Disposition','attachment; filename="ECG-Beleg"');
        res.setHeader('X-Content-Type-Options','nosniff');
        return res.status(200).send(Buffer.from(row.content));
      }
      const team=req.query?.scope==='team';
      if(team&&!isFinance)return res.status(403).json({error:'Finanzrecht erforderlich.'});
      const rows=team?await sql`SELECT c.*, (SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.original_name)) FROM ecg_expense_receipts r WHERE r.claim_id=c.id) AS receipts FROM ecg_expense_claims c ORDER BY c.created_at DESC LIMIT 200`:await sql`SELECT c.*, (SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.original_name)) FROM ecg_expense_receipts r WHERE r.claim_id=c.id) AS receipts FROM ecg_expense_claims c WHERE c.applicant_id=${profile.id} ORDER BY c.created_at DESC LIMIT 100`;
      return res.json({claims:rows.map(row=>publicClaim(row,team))});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt.'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON erforderlich.'});
    const action=String(req.body?.action||'submit');
    if(action==='submit'){
      const items=validateItems(req.body?.items);
      const total=items.reduce((s,x)=>s+x.cents,0);
      if(total>100000000)return res.status(400).json({error:'Gesamtsumme zu hoch.'});
      const type=req.body?.reimbursementType==='waiver'?'waiver':'refund';
      const iban=String(req.body?.iban||'').replace(/\s/g,'').toUpperCase();
      const owner=String(req.body?.bankOwner||'').trim();
      if(type==='refund'&&(!/^DE\d{20}$/.test(iban)||owner.length<2||owner.length>160))return res.status(400).json({error:'Bitte Kontoinhaber und deutsche IBAN angeben.'});
      const files=req.body?.files;
      if(!Array.isArray(files)||files.length<1||files.length>6)return res.status(400).json({error:'Mindestens ein Beleg, höchstens sechs.'});
      const acceptable=new Set(['image/jpeg','image/png','application/pdf']);
      const signatures={'image/jpeg':'/9j/','image/png':'iVBORw0KGgo','application/pdf':'JVBERi0'};
      let size=0;
      for(const f of files){if(!f||typeof f.data!=='string'||typeof f.type!=='string'||!acceptable.has(f.type)||typeof f.name!=='string'||f.name.length>120||!/^[A-Za-z0-9+/]+={0,2}$/.test(f.data))return res.status(400).json({error:'Ungültiges Belegformat.'});if(!f.data.startsWith(signatures[f.type]))return res.status(400).json({error:'Dateiinhalt passt nicht zum Belegformat.'});size+=f.data.length;}
      if(size>3300000)return res.status(413).json({error:'Belege sind zu groß. Bitte Bilder verkleinern.'});
      // Insert claim and receipts via a single SQL statement with a CTE to avoid partial uploads.
      const payload=JSON.stringify(files);
      const rows=await sql`WITH claim AS (
        INSERT INTO ecg_expense_claims(applicant_id,applicant_name,items,bank_iban,bank_owner,reimbursement_type,total_cents)
        VALUES(${profile.id},${profile.name},${JSON.stringify(items)}::jsonb,${type==='refund'?iban:''},${type==='refund'?owner:''},${type},${total}) RETURNING id
      ), receipts AS (
        INSERT INTO ecg_expense_receipts(claim_id,original_name,content_type,content)
        SELECT claim.id,f->>'name',f->>'type',decode(f->>'data','base64')
        FROM claim CROSS JOIN LATERAL jsonb_array_elements(${payload}::jsonb) f
        RETURNING id
      ), log AS (
        INSERT INTO ecg_expense_audit(claim_id,actor_id,event)
        SELECT id,${profile.id},'submitted' FROM claim RETURNING id
      ) SELECT claim.id,(SELECT count(*) FROM receipts) AS receipt_count FROM claim`;
      return res.status(201).json({ok:true,id:rows[0].id,receiptCount:Number(rows[0].receipt_count)});
    }
    if(action==='reply'){
      const id=String(req.body?.id||'');if(!UUID.test(id))return res.status(400).json({error:'Ungültiger Vorgang.'});
      const rows=await sql`UPDATE ecg_expense_claims SET status='submitted',updated_at=now() WHERE id=${id}::uuid AND applicant_id=${profile.id} AND status='question' RETURNING id`;
      if(!rows.length)return res.status(409).json({error:'Keine offene Rückfrage.'});
      await sql`INSERT INTO ecg_expense_audit(claim_id,actor_id,event) VALUES(${id}::uuid,${profile.id},'reply')`;
      return res.json({ok:true});
    }
    if(!isFinance)return res.status(403).json({error:'Finanzrecht erforderlich.'});
    const id=String(req.body?.id||'');
    if(!UUID.test(id)||!Object.hasOwn(allowedActions,action))return res.status(400).json({error:'Unbekannte Aktion.'});
    const [before,after]=allowedActions[action];
    const note=String(req.body?.note||'').trim().slice(0,500);
    const rows=await sql`WITH changed AS (
      UPDATE ecg_expense_claims SET status=${after},updated_at=now(),note=${note},
        reviewer_id=CASE WHEN ${action}='approve' THEN ${profile.id} ELSE reviewer_id END,
        approved_at=CASE WHEN ${action}='approve' THEN now() ELSE approved_at END,
        paid_at=CASE WHEN ${action}='pay' THEN now() ELSE paid_at END
      WHERE id=${id}::uuid AND status=${before} AND applicant_id<>${profile.id}
      RETURNING id
    ), log AS (
      INSERT INTO ecg_expense_audit(claim_id,actor_id,event)
      SELECT id,${profile.id},${action} FROM changed RETURNING id
    ) SELECT id FROM changed`;
    if(!rows.length)return res.status(409).json({error:'Vorgang nicht gefunden, bereits bearbeitet oder eigene Auslage.'});
    return res.json({ok:true});
  }catch(e){
    if(e.message?.includes('relation')||e.code==='42P01')return res.status(503).json({error:'Auslagenmodul noch nicht eingerichtet.'});
    return res.status(400).json({error:e.message||'Vorgang fehlgeschlagen.'});
  }
}