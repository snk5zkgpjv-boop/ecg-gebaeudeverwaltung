import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {ensureAuthSchema} from '../lib/auth.js';
import {maintenanceDocuments} from '../lib/maintenance-documents.js';

// Isolated engine snapshots only: never accepts a connection string or live data.
const source=new PGlite();let restored;
const sqlFor=db=>async(parts,...values)=>(await db.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
const sql=sqlFor(source);
const id='00000000-0000-0000-0000-000000000001';
const document=Buffer.from('%PDF-1.4\nSynthetic restore fixture\n%%EOF');
const digest=createHash('sha256').update(document).digest('hex');
try{
 await source.exec("CREATE TABLE app_state(id text PRIMARY KEY,data jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz DEFAULT now())");
 await ensureAuthSchema(sql);
 for(const name of ['members','staff','personnel','coverage','duties','finance-pilot'])await source.exec(await fs.readFile(new URL(`../scripts/${name}-schema.sql`,import.meta.url),'utf8'));
 const response={setHeader(){},status(code){assert.equal(code,200);return this},json(){}};
 await maintenanceDocuments({method:'GET',query:{assetId:'fixture-asset'},headers:{}},response,sql,{state:{maintenanceAssets:[{id:'fixture-asset'}]},profile:{id:'fixture'}},()=>true);
 const state={version:6,users:[{id:'fixture',role:'admin',name:'Synthetic'}],maintenanceAssets:[{id:'fixture-asset'}],eventRunSheets:{fixture:{version:3,items:[{title:'Synthetic plan'}]}},eventUsageAgreements:{fixture:{version:2}},kitchenPhotos:{fixture:'c3ludGhldGlj'},timeEntries:[{id:'fixture-time',userId:'fixture',note:'synthetic'}]};
 await sql`INSERT INTO app_state(id,data,revision) VALUES('main',${JSON.stringify(state)}::jsonb,7)`;
 await sql`INSERT INTO ecg_app_users(id,app_user_id,email,name,password_hash) VALUES(${id},'fixture','fixture@example.test','Synthetic','unusable-synthetic-hash')`;
 await sql`INSERT INTO ecg_app_sessions(id,user_id,token_hash,expires_at) VALUES(${id},${id},'unusable-session',now()+interval '1 day')`;
 await sql`INSERT INTO ecg_password_resets(id,user_id,token_hash,expires_at) VALUES(${id},${id},'unusable-reset',now()+interval '1 day')`;
 await sql`INSERT INTO ecg_members(id,account_id,data,photo,version) VALUES(${id},'fixture','{"name":"Synthetic","birthDate":"2000-01-01","email":"fixture@example.test"}'::jsonb,'c3ludGhldGlj',4)`;
 await sql`INSERT INTO ecg_staff(id,name,employment,account_id,cover_group,handover) VALUES(${id},'Synthetic','Offen','fixture','cleaning','Synthetic handover')`;
 await sql`INSERT INTO ecg_absences(id,owner_id,team,kind,starts,ends,planned_staff,version) VALUES(${id},'fixture','building','Urlaub','2030-01-01','2030-01-02',${id},5)`;
 await sql`INSERT INTO ecg_event_duties(id,event_id,event_title,starts_at,ends_at,label,assignee,requested_by,version) VALUES(${id},'fixture-event','Synthetic','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z','Synthetic','fixture','fixture',2)`;
 await sql`INSERT INTO ecg_demo_expenses(receipt_id,status) VALUES('M-001','eingereicht')`;
 await sql`INSERT INTO ecg_maintenance_documents(id,asset_id,title,filename,size,sha256,pdf_base64,created_by) VALUES(${id},'fixture-asset','Synthetic','synthetic.pdf',${document.length},${digest},${document.toString('base64')},'fixture')`;
 const tables=(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 assert.equal(tables.length,10,'snapshot includes all current application tables');
 const before=new Map();for(const table of tables)before.set(table,(await source.query(`SELECT * FROM "${table}"`)).rows);
 const snapshot=await source.dumpDataDir();
 await source.close();
 restored=new PGlite({loadDataDir:snapshot});await restored.waitReady;
 for(const table of tables)assert.deepEqual((await restored.query(`SELECT * FROM "${table}"`)).rows,before.get(table),`${table}: values and revisions survive restore`);
 const bytes=Buffer.from((await restored.query('SELECT pdf_base64 FROM ecg_maintenance_documents')).rows[0].pdf_base64,'base64');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),digest,'document content survives byte for byte');
 await assert.rejects(restored.query("UPDATE ecg_absences SET planned_staff='00000000-0000-0000-0000-000000000099'"),/foreign key/i);
 assert.equal((await restored.query('UPDATE ecg_members SET version=version+1 WHERE id=$1 AND version=4 RETURNING version',[id])).rows[0].version,5);
 assert.equal((await restored.query('UPDATE ecg_members SET version=version+1 WHERE id=$1 AND version=4 RETURNING version',[id])).rows.length,0,'stale revision still conflicts after restore');
 // A restored operator target must not reactivate pre-backup session/reset tokens.
 await restored.exec('BEGIN; DELETE FROM ecg_app_sessions; DELETE FROM ecg_password_resets; COMMIT;');
 assert.equal((await restored.query('SELECT * FROM ecg_app_sessions')).rows.length,0);
 assert.equal((await restored.query('SELECT * FROM ecg_password_resets')).rows.length,0);
 assert.equal((await restored.query('SELECT * FROM ecg_app_users')).rows.length,1);
 console.log('PASS: synthetic ten-table PGlite snapshot/restore, document checksum, relationships, revisions and token disposal. Not a provider or pg_dump restore test.');
}finally{if(!source.closed)await source.close();if(restored)await restored.close();}
