import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {applyTimeChange,handleTimeChange,timeBase} from '../lib/time-change.js';
const index=fs.readFileSync('index.html','utf8'),client=fs.readFileSync('assets/time-save.js','utf8');
const entry={id:'time_test',userId:'me',start:'2026-09-21T13:30:00.000Z',end:'2026-09-21T16:30:00.000Z',roomId:'',workLabel:'Arbeitszeit allgemein',note:'',volunteer:false};
const profile={id:'me',role:'coordinator'};
let db={timeEntries:[],users:[profile]},revision=1,offline=true,dropReply=false,requests=0,writes=0;
const sql=async(parts,...args)=>{const q=parts.join('?');if(q.startsWith('SELECT'))return [{data:structuredClone(db),revision}];if(args[3]!==revision)return [];db={...db,timeEntries:JSON.parse(args[0]),timeWriteVersions:JSON.parse(args[1]),timeWriteReceipts:JSON.parse(args[2])};revision++;writes++;return [{revision}];};
async function api(_,options){requests++;if(offline)throw Error('Offline');const res={statusCode:200,status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};await handleTimeChange(sql,{profile},JSON.parse(options.body).timeChange,res,async()=>({status:'not_applicable'}));if(dropReply){dropReply=false;throw Error('Antwort verloren');}return {ok:res.statusCode===200,status:res.statusCode,json:async()=>res.body};}
const map=new Map();let diskFull=false;
const storage={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem(k,v){if(diskFull)throw Error('quota');map.set(k,v)},removeItem:k=>map.delete(k)};
function boot(){const fields={};const c=vm.createContext({state:{currentRole:'coordinator',currentUserId:'me',users:[profile],timeEntries:[],timeRunning:null},authSession:{user:{appUserId:'me'}},localStorage:storage,crypto:webcrypto,structuredClone,AbortSignal,Date,Intl,JSON,Math,setTimeout:()=>1,clearTimeout:()=>{},authHeaders:async x=>x,fetch:api,render:()=>{},renderTimeReport:()=>{},document:{querySelectorAll:()=>[],getElementById:()=>null,addEventListener:()=>{}},window:{addEventListener:()=>{}},alert:s=>c.alerts.push(s),alerts:[],confirm:()=>true,modal:s=>{c.html=s},esc:s=>String(s),$:s=>fields[s.slice(1)],uid:()=>webcrypto.randomUUID(),nowISO:()=>entry.end,closeModal:()=>{},showTimeReport:()=>{}});c.fields=fields;c.window=c; c.addEventListener=()=>{};
 vm.runInContext(fs.readFileSync('assets/time-summary.js','utf8')+'\n'+client+'\n'+index.match(/^window.stopTime=.*$/m)[0]+'\n'+index.match(/^window.saveTimeEntry=.*$/m)[0]+'\n'+index.match(/^window.deleteTimeEntry=.*$/m)[0],c);return c;}
let c=boot();c.state.timeRunning={...entry,end:undefined};c.stopTime();await c.flushTimeChanges();
assert.equal(c.state.timeRunning,null);assert.equal(c.pendingTimeChanges().length,1);assert.equal(db.timeEntries.length,0);
assert.match(c.timeSaveStatusHtml(),/noch nicht auf dem Server bestätigt/);
// Reload/pull an empty server: the pending booking stays visible.
c=boot();c.state.timeEntries=c.mergePendingTimes([]);assert.equal(c.state.timeEntries.length,1);assert.equal(c.state.timeEntries[0].start,entry.start);
offline=false;dropReply=true;await c.flushTimeChanges();assert.equal(db.timeEntries.length,1);assert.equal(c.pendingTimeChanges().length,1);assert.equal(writes,1);
await c.flushTimeChanges();assert.equal(writes,1);assert.equal(c.pendingTimeChanges().length,0);assert.match(c.timeSaveStatusHtml(),/Auf dem Server gespeichert/);
// Editing persists through offline reload, then deletion is also retried safely.
offline=true;const before=c.state.timeEntries[0];assert.ok(c.queueTimeChange('update',before,{...before,note:'Korrigiert'}));await c.flushTimeChanges();
c=boot();c.state.timeEntries=c.mergePendingTimes(db.timeEntries);assert.equal(c.state.timeEntries[0].note,'Korrigiert');offline=false;await c.flushTimeChanges();assert.equal(db.timeEntries[0].note,'Korrigiert');
c.deleteTimeEntry(entry.id);await c.flushTimeChanges();assert.equal(db.timeEntries.length,0);assert.equal(c.pendingTimeChanges().length,0);
// Stale full-state clients cannot resurrect a durable deletion.
const sc=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync('api/state.js','utf8').replace(/^import .*;\n/gm,'').split('export default')[0]+';this.accepted=accepted;this.visible=visible;',sc);
assert.equal(sc.accepted({...db,rooms:[],outdoorAreas:[]},{timeEntries:[entry]},{id:'me',role:'admin'}).timeEntries.length,0);
assert.equal(sc.visible(db,profile).timeWriteReceipts,undefined);
assert.equal(sc.visible(db,profile).timeWriteVersions,undefined);
// Full disk: timer remains running; not falsely marked finished.
c.state.timeRunning={...entry,id:'quota',end:undefined};diskFull=true;c.stopTime();assert.ok(c.state.timeRunning);assert.match(c.alerts.at(-1),/Gerätespeicher/);diskFull=false;
// Manual entry without KI: actual form save + coordinator edit functions.
c.openManualTimeEntry();assert.match(c.html,/Arbeitszeit nachtragen/);
Object.assign(c.fields,{manualTimeStart:{value:'2026-09-22T08:00'},manualTimeEnd:{value:'2026-09-22T09:00'},manualTimeLabel:{value:'Allgemein'},manualTimeNote:{value:'Manuell'},manualTimeVolunteer:{checked:false}});
c.saveManualTimeEntry();await c.flushTimeChanges();assert.equal(db.timeEntries.length,1);assert.equal(db.timeEntries[0].note,'Manuell');
const manual=c.state.timeEntries[0];Object.assign(c.fields,{teStart:{value:manual.start},teEnd:{value:manual.end},teLabel:{value:'Geändert'},teNote:{value:'Nachtrag korrigiert'},teVolunteer:{checked:false}});
c.saveTimeEntry(manual.id);await c.flushTimeChanges();assert.equal(db.timeEntries[0].workLabel,'Geändert');
// Server permissions, conflicts, overlaps, invalid periods, idempotent receipt ownership.
const op=(action,before,entry)=>({id:webcrypto.randomUUID(),userId:'me',entryId:(entry||before).id,action,before:timeBase(before),entry});
assert.throws(()=>applyTimeChange(db,{...profile,role:'technician'},op('create',null,entry)),e=>e.status===403);
assert.throws(()=>applyTimeChange(db,{id:'other',role:'admin'},op('delete',db.timeEntries[0],null)),e=>e.status===403);
assert.throws(()=>applyTimeChange(db,profile,op('update',{...db.timeEntries[0],note:'stale'},db.timeEntries[0])),e=>e.status===409);
assert.throws(()=>applyTimeChange(db,profile,op('create',null,{...db.timeEntries[0],id:'overlap'})),e=>e.status===409);
assert.throws(()=>applyTimeChange(db,profile,op('create',null,{...entry,id:'future',end:'2099-01-01T10:00:00Z'})),e=>e.status===400);
const change=op('update',db.timeEntries[0],{...db.timeEntries[0],note:'server'});const result=applyTimeChange(db,profile,change);db={...db,...result};
// A queued edit conflicts rather than silently replacing another device's changes.
const stale=manual;c.state.timeEntries=[stale];c.queueTimeChange('update',stale,{...stale,note:'local draft'});await c.flushTimeChanges();assert.equal(c.pendingTimeChanges().length,1);assert.match(c.timeSaveStatusHtml(),/anderen Gerät/);assert.equal(db.timeEntries[0].note,'server');
// User switching never submits someone else's queue.
const count=requests;c.state.currentUserId='other';await c.flushTimeChanges();assert.equal(requests,count);assert.equal(c.pendingTimeChanges().length,0);
console.log('PASS: actual timer/manual/edit/delete flows, offline reload, lost response/idempotency, quota, ownership, conflicts, tombstones, receipt privacy and account isolation. No real user data.');
// Durable full-state updates preserve authoritative times, even if local copies are stale.
const authoritative={...db,rooms:[],outdoorAreas:[]};
assert.deepEqual(JSON.parse(JSON.stringify(sc.accepted(authoritative,{timeEntries:[],timeEntriesReadOnly:true},profile).timeEntries)),db.timeEntries);
assert.deepEqual(JSON.parse(JSON.stringify(sc.accepted(authoritative,{timeEntries:[{...db.timeEntries[0],note:'stale'}]},profile).timeEntries)),db.timeEntries);
// A response for a request made before another local edit must not clear the later operation.
const isolated=new Map(map);map.clear();c=boot();offline=true;
const first={...entry,id:'two_edits'};c.queueTimeChange('create',null,first);await c.flushTimeChanges();
const pendingFirst=c.state.timeEntries[0];c.queueTimeChange('update',pendingFirst,{...pendingFirst,note:'zweite Änderung'});await c.flushTimeChanges();
assert.equal(c.pendingTimeChanges().length,2);offline=false;await c.flushTimeChanges();assert.equal(c.pendingTimeChanges().length,0);assert.equal(db.timeEntries.find(e=>e.id==='two_edits').note,'zweite Änderung');
console.log('PASS: read-only full-state payload, managed-entry legacy protection and ordered create/update replay.');
