import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const schema = await readFile(new URL('../scripts/split-state-schema.sql', import.meta.url), 'utf8');
const migrate = await readFile(new URL('../scripts/split-state-snapshot.sql', import.meta.url), 'utf8');
const db = new PGlite();
const source = {
  users: [{id:'synthetic-admin',role:'admin'}],
  issues: [
    {id:'issue_one',text:'Synthetic',roomId:'room_one',status:'open',photo:'data:image/jpeg;base64,YWJj'},
    {id:'issue_two',text:'Second',roomId:'room_one',status:'closed',photo:null}
  ],
  rooms: [
    {id:'room_one',name:'Synthetic room',tasks:[{id:'task_one',status:'done'}]},
    {id:'room_two',name:'Other'}
  ],
  timeEntries: [{id:'time_one',userId:'synthetic-admin',start:'2026-11-01T10:00:00Z',end:'2026-11-01T11:00:00Z'}],
  kitchenPhotos: {overview:'YWFh',other:'YmJi'},
  eventUsageAgreements: [{id:'private-fixture'}]
};
try {
  await db.exec("CREATE TABLE app_state (id text PRIMARY KEY, data jsonb NOT NULL, revision bigint NOT NULL, updated_at timestamptz DEFAULT now())");
  await db.query('INSERT INTO app_state(id,data,revision) VALUES($1,$2::jsonb,$3)', ['main',JSON.stringify(source),42]);
  await db.exec(schema);
  await db.exec(migrate);
  const get = async sql => (await db.query(sql)).rows;
  const migration = (await get('SELECT * FROM ecg_split_migration_checks'))[0];
  assert.equal(Number(migration.snapshot_revision),42);
  assert.equal(migration.issue_count,2);
  assert.equal(migration.issue_photo_count,1);
  assert.equal(migration.room_count,2);
  assert.equal(migration.time_count,1);
  assert.equal(migration.kitchen_photo_count,2);
  const originals = (await get("SELECT data,revision FROM app_state WHERE id='main'"))[0];
  assert.deepEqual(originals.data,source,'original source must remain byte-equivalent at JSON semantics');
  assert.equal(Number(originals.revision),42);
  const issueRows = await get('SELECT id,payload FROM ecg_issue_records ORDER BY sort_order');
  assert.equal(issueRows[0].payload.photo,undefined);
  assert.equal(issueRows[1].payload.photo,null,'null photo semantics preserved');
  assert.equal((await get('SELECT image_data_url FROM ecg_issue_photos'))[0].image_data_url,source.issues[0].photo);
  await assert.rejects(db.exec(migrate),/Shadow tables are not empty/,'re-running the migration must not overwrite shadow data');
  // A raised SQL exception leaves an explicit transaction aborted until rollback.
  await db.exec('ROLLBACK');
  assert.equal((await get('SELECT count(*)::integer AS n FROM ecg_issue_records'))[0].n,2);
  console.log('PASS: non-destructive split-state shadow snapshot, original unchanged, media separation, count and equality checks, and rerun refusal. Synthetic database only.');
} finally {
  await db.close();
}
