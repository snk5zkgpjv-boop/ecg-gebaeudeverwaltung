import {receipts} from '../finanzen/pilot.js';

export async function financePilot(req,res,sql,auth){
 res.setHeader('Cache-Control','private, no-store');
 const p=auth.profile;
 if(auth.user.must_change_password||['technician','member'].includes(p.role)||(p.role!=='admin'&&p.permissions?.viewFinance!==true))return res.status(403).json({error:'Finanzrecht erforderlich.'});
 if(req.headers['x-ecg-user-id']!==p.id)return res.status(409).json({error:'Konto gewechselt. Seite neu öffnen.'});
 if(req.method==='GET'){
  const rows=await sql`SELECT receipt_id,status,booked_at,journal_id FROM ecg_demo_expenses ORDER BY receipt_id`;
  return res.json({rows:rows.map(r=>{
   const receipt=receipts.find(item=>item.id===r.receipt_id);
   return {receiptId:r.receipt_id,status:r.status,journal:r.journal_id?{id:r.journal_id,date:r.booked_at,cents:receipt.cents}:null};
  })});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Methode nicht erlaubt.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'JSON erforderlich.'});
 const {id,action}=req.body||{};
 const targets={einreichen:'eingereicht',freigeben:'freigegeben',buchen:'gebucht'};
 if(!req.body||Object.keys(req.body).length!==2||!receipts.some(r=>r.id===id)||typeof action!=='string'||!Object.hasOwn(targets,action))return res.status(400).json({error:'Nur die drei Musterbelege und vorgegebenen Aktionen sind zulässig.'});
 if(action!=='einreichen'&&!['admin','financeDeacon'].includes(p.role))return res.status(403).json({error:'Testfreigabe und Testbuchung sind der Finanzdiakonie und Administration vorbehalten.'});
 let updated;
 if(action==='einreichen'){
  updated=await sql`INSERT INTO ecg_demo_expenses(receipt_id,status) VALUES(${id},'eingereicht') ON CONFLICT(receipt_id) DO NOTHING RETURNING status`;
 }else if(action==='freigeben'){
  updated=await sql`UPDATE ecg_demo_expenses SET status='freigegeben',approved_at=now() WHERE receipt_id=${id} AND status='eingereicht' RETURNING status`;
 }else{
  updated=await sql`UPDATE ecg_demo_expenses SET status='gebucht',booked_at=now(),journal_id='TEST-'||receipt_id WHERE receipt_id=${id} AND status='freigegeben' RETURNING status`;
 }
 if(updated.length)return res.json({ok:true});
 const [existing]=await sql`SELECT status FROM ecg_demo_expenses WHERE receipt_id=${id}`;
 return existing?.status===targets[action]?res.json({ok:true}):res.status(409).json({error:'Der Teststand passt nicht zu dieser Aktion. Bitte den aktuellen Stand prüfen.'});
}
