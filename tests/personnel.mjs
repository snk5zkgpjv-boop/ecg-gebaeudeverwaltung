import assert from 'node:assert/strict';
import {personnel,teamsFor} from '../lib/personnel.js';
import {nextDay,personnelCalendarId} from '../lib/personnel-calendar.js';
assert.equal(nextDay('2027-10-31'),'2027-11-01');
assert.deepEqual(teamsFor({permissions:{staffBuilding:true}}),['building']);
assert.deepEqual(teamsFor({permissions:{staffBuilding:true}},true),[]);
assert.deepEqual(teamsFor({permissions:{approvePastoral:true}},true),['pastoral']);
delete process.env.ECG_PASTORAL_ABSENCE_CALENDAR_ID;assert.equal(personnelCalendarId(),null);
const id='abcdefab-1234-4567-8901-123456789012';
async function request(scope,permissions,body,header='me'){
 const p={id:'me',name:'Test',role:'member',permissions};let queries=[];
 const sql=async(strings,...values)=>{
  const q=strings.join('?');if(q.includes('ecg_app_sessions'))return [{app_user_id:'me'}];
  if(q.includes("data->'users'"))return [{users:[p,{id:'other',role:'member',permissions:{staffPastoral:true}}]}];
  queries.push({q,values});return q.includes('UPDATE')?[]:[];
 };
 const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await personnel({headers:{cookie:'ecg_session=test','x-ecg-user-id':header,'content-type':'application/json'},method:body?'POST':'GET',query:{personnel:scope,month:'2026-11'},body},res,sql);
 return {res,queries};
}
assert.equal((await request('eigene',{})).res.code,403);
assert.equal((await request('eigene',{staffPastoral:true},null,'other')).res.code,409);
assert.equal((await request('freigaben',{staffPastoral:true})).res.code,403);
const team=await request('team',{staffBuilding:true});assert.deepEqual(team.queries[0].values[0],['building']);assert.match(team.queries[0].q,/status='approved'/);assert(!team.queries[0].q.includes('kind'));
const body={action:'request',id,starts:'2026-11-01',ends:'2027-10-31',kind:'Sabbatjahr',team:'pastoral'};
assert.equal((await request('eigene',{staffBuilding:true},body)).res.code,400);
assert.equal((await request('eigene',{staffPastoral:true},{...body,starts:'2026-02-31'})).res.code,400);
assert.equal((await request('eigene',{staffPastoral:true},{...body,deputy:'me'})).res.code,400);
const req=await request('eigene',{staffPastoral:true},body);assert.deepEqual(req.queries[0].values.slice(1,6),['me','pastoral','Sabbatjahr','2026-11-01','2027-10-31']);
const approve=await request('freigaben',{approveBuilding:true},{action:'approve',id,version:1});assert.deepEqual(approve.queries[0].values[3],['building']);assert.equal(approve.res.code,409);
const cover=await request('eigene',{staffBuilding:true},{action:'cover',id,version:1});assert.match(cover.queries[0].q,/deputy_id=\?/);assert.equal(cover.queries[0].values[2],'me');
console.log('PASS: personnel role and team isolation, request validation, versioned approvals, deputy identity, exclusive calendar end');
