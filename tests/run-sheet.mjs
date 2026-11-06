import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {runSheet} from '../lib/run-sheet.js';
const alice={id:'alice',permissions:{manageCalendar:true}};
const data={users:[alice],calendarEvents:[{id:'occurrence1'},{id:'occurrence2'},{id:'cancelled',cancelled:true}]};
let revision=0;
async function sql(parts,...params){
 if(parts[0].startsWith('SELECT'))return [{data,revision}];
 if(params[1]!==revision)return [];
 data.eventRunSheets=JSON.parse(params[0]);revision++;return [{revision}];
}
const base={start:'09:00',items:[{title:'Willkommen',minutes:5,lead:'Moderation'}],version:0,mutationId:'synthetic-save-1'};
async function send(method,body=base,eventId='occurrence1',profile=alice,header='alice'){
 const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 return runSheet({method,query:{eventId},headers:{'content-type':'application/json','x-ecg-user-id':header},body},res,sql,{state:data,profile},p=>p.permissions?.manageCalendar===true);
}
assert.equal((await send('GET')).body.sheet,null);
assert.equal((await send('GET',base,'occurrence1',{id:'alice'})).statusCode,403);
assert.equal((await send('PATCH',base,'occurrence1',alice,'wrong')).statusCode,409);
assert.equal((await send('PATCH',{...base,start:['09:00']})).statusCode,400);
assert.equal((await send('PATCH',{...base,items:[{title:'Test',minutes:-1,lead:''}]})).statusCode,400);
assert.equal((await send('PATCH',base,'unknown')).statusCode,409);
assert.equal((await send('PATCH',base,'cancelled')).statusCode,409);
assert.equal((await send('PATCH')).body.sheet.version,1);
assert.equal((await send('PATCH')).body.sheet.version,1);
assert.equal((await send('PATCH',{...base,mutationId:'synthetic-save-2'})).statusCode,409);
assert.equal((await send('GET',base,'occurrence2')).body.sheet,null);
assert.deepEqual((await send('GET')).body.sheet.items,base.items);
const html=readFileSync('index.html','utf8');
const calendar=html.slice(html.indexOf('function calendarView('),html.indexOf('window.syncGoogleCalendar='));
const ev={id:'occurrence1',start:'2026-11-08T10:00Z',end:'2026-11-08T11:00Z',title:'Test'};
const ctx={state:{settings:{},calendarEvents:[ev]},esc:s=>String(s).replaceAll('"','&quot;'),calendarDayKey:()=>'',eventDateLabel:()=>({}),eventRuleFor:()=>null,eventChecklistFor:()=>null,can:()=>true,ECG_CALENDAR_NAME:'Testkalender'};
const render=vm.runInNewContext(calendar+';calendarView',ctx);
assert.match(render(true),/onclick="openRunSheet\(&quot;occurrence1&quot;\)"/);
ctx.can=()=>false;assert.doesNotMatch(render(true),/openRunSheet/);
ctx.can=()=>true;ev.cancelled=true;assert.doesNotMatch(render(true),/openRunSheet/);
console.log('PASS: calendar-only run sheet, occurrence binding, validation, version conflict, idempotent retry.');
