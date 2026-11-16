import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { appState, profileFor } from '../lib/auth.js';

const db = new PGlite();
const sql = async (strings,...values) => {
  let query = strings[0];
  for (let i = 0; i < values.length; i++) query += `$${i+1}`+strings[i+1];
  return (await db.query(query,values)).rows;
};
try {
  await db.exec("CREATE TABLE app_state (id text PRIMARY KEY, data jsonb NOT NULL)");
  const state = {users:[{id:'fixture',active:true,role:'admin'}],issues:[{id:'synthetic-large-state',text:'x'.repeat(250000)}]};
  await sql`INSERT INTO app_state(id,data) VALUES('main',${JSON.stringify(state)}::jsonb)`;
  const small = await appState(sql,{usersOnly:true});
  assert.deepEqual(small,{users:state.users});
  assert.equal(Object.hasOwn(small,'issues'),false);
  assert.equal(profileFor(small,{app_user_id:'fixture'}).role,'admin');
  assert.deepEqual(await appState(sql),state);
  console.log('PASS: profile-only queries return users without sending large issues to the application layer. Synthetic database only.');
} finally { await db.close(); }
