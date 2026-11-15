import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id='00000000-0000-4000-8000-000000000001';
const req='10000000-0000-4000-8000-000000000001';
try{
 await db.exec(await readFile(new URL('../scripts/expenses-schema.sql',import.meta.url),'utf8'));
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'ecg_expense%'")).rows.map(r=>r.tablename);
 assert.deepEqual(tables.sort(),['ecg_expense_audit','ecg_expense_claims','ecg_expense_receipts','ecg_expense_scan_quota']);
 const query="INSERT INTO ecg_expense_claims(id,applicant_id,submission_key,applicant_name,items,total_cents) VALUES($1,'member-a',$2,'Synthetic',$3::jsonb,1850) ON CONFLICT(applicant_id,submission_key) DO NOTHING RETURNING id";
 const values=[id,req,JSON.stringify([{cents:1850,description:'Papier'}])];
 assert.equal((await db.query(query,values)).rows.length,1);
 assert.equal((await db.query(query,values)).rows.length,0,'retry does not duplicate a claim');
 await db.query("INSERT INTO ecg_expense_receipts(claim_id,original_name,content_type,content) VALUES($1,'receipt.pdf','application/pdf',decode('JVBERi0xLjQKJSVFT0Y=','base64'))",[id]);
 await db.query("INSERT INTO ecg_expense_audit(claim_id,actor_id,event) VALUES($1,'member-a','submitted')",[id]);
 assert.equal((await db.query("SELECT count(*)::integer AS n FROM ecg_expense_receipts WHERE claim_id=$1",[id])).rows[0].n,1);
 const own=(await db.query("UPDATE ecg_expense_claims SET status='approved' WHERE id=$1 AND applicant_id<>'member-a' AND status='submitted' RETURNING id",[id])).rows;
 assert.equal(own.length,0,'self-approval rejected by SQL condition');
 const external=(await db.query("UPDATE ecg_expense_claims SET status='approved' WHERE id=$1 AND applicant_id<>'finance-a' AND status='submitted' RETURNING id",[id])).rows;
 assert.equal(external.length,1);
 assert.equal((await db.query("UPDATE ecg_expense_claims SET status='approved' WHERE id=$1 AND status='submitted' RETURNING id",[id])).rows.length,0,'replayed approval blocked');
 assert.equal((await db.query("SELECT octet_length(content)::integer AS size FROM ecg_expense_receipts WHERE claim_id=$1",[id])).rows[0].size,14);
 const limit=async()=>db.query("INSERT INTO ecg_expense_scan_quota(applicant_id,day,requests) VALUES('member-a',CURRENT_DATE,1) ON CONFLICT(applicant_id,day) DO UPDATE SET requests=ecg_expense_scan_quota.requests+1 WHERE ecg_expense_scan_quota.requests<5 RETURNING requests");
 for(let i=1;i<=5;i++)assert.equal((await limit()).rows[0].requests,i);
 assert.equal((await limit()).rows.length,0,'sixth OCR request blocked');
 console.log('PASS: synthetic expense schema, unique submission, original bytes, audit, self-approval guard and replay conflict');
}finally{await db.close()}