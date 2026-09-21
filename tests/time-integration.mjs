import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const index=fs.readFileSync('index.html','utf8');
const summary=fs.readFileSync('assets/time-summary.js','utf8');
const modalCode=index.slice(index.indexOf('function modal(html'),index.indexOf('window.modal=modal;'));
const reportCode=index.slice(index.indexOf('function renderTimeReport('),index.indexOf('window.editTimeEntry='));
const editCode=index.match(/^window.editTimeEntry=.*$/m)[0];
const saveCode=index.match(/^window.saveTimeEntry=.*$/m)[0];
const durationCode=index.match(/^function fmtDuration.*$/m)[0];
const now=Date.parse('2026-09-21T20:00:00+02:00');
class Clock extends Date {static now(){return now}}
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const entry=(start,end,extra={})=>({id:'entry',userId:'me',start,end,workLabel:'Test',...extra});
const own=entry('2026-09-21T08:00:00Z','2026-09-21T08:00:31Z');
const nodes=[],fields={};
// Minimal DOM model: preserves insertion order, connected state and element identity.
const root={get lastElementChild(){return nodes.at(-1)},insertAdjacentHTML(_,html){
 const inputs={};
 const body={_html:'',set innerHTML(value){this._html=value;for(const input of Object.values(inputs))input.connected=false;for(const id of ['shareMyTimes','timeSharingMessage'])inputs[id]={connected:true,disabled:false,textContent:'',get isConnected(){return this.connected&&node.isConnected}}},get innerHTML(){return this._html}};
 const node={id:'modalBack',get isConnected(){return nodes.includes(this)},remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1)},removeAttribute(name){if(name==='id')this.id=''},querySelector(selector){return selector==='.modal'?body:inputs[selector.slice(1)]}};
 body.innerHTML=html;nodes.push(node);
}};
let resolveFetch,fetchError=false,saved=0,alerts=[];
const context={Date:Clock,structuredClone,esc,state:{currentUserId:'me',currentRole:'admin',users:[{id:'me',name:'Testperson'}],timeEntries:[own]},currentUser:()=>({name:'Testperson'}),timeEntryLabel:e=>e.workLabel,
 $:selector=>selector==='#modalRoot'?root:selector==='#modalBack'?nodes.find(n=>n.id==='modalBack'):fields[selector.slice(1)],
 authHeaders:async()=>({}),fetch:()=>fetchError?Promise.reject(new Error('Offline')):new Promise(resolve=>{resolveFetch=resolve}),alert:message=>alerts.push(message),save:()=>saved++};
context.window=context;
const c=vm.createContext(context);
vm.runInContext(summary+'\n'+durationCode+'\n'+modalCode+'\n'+reportCode+'\n'+editCode+'\n'+saveCode,c);
const monday=c.timeSummaryMonday(own.start);
const title=node=>node.querySelector('.modal').innerHTML.match(/<h2>(.*?)<\/h2>/)[1];
const reply=async pending=>{await new Promise(setImmediate);resolveFetch({ok:true,json:async()=>({myTimeSharing:true,sharedTimeUsers:[],timeEntries:[]})});await pending};

const report=c.renderTimeReport();
c.openPersonalTimeWeek(monday);
assert.equal(nodes.length,2);assert.equal(nodes.filter(n=>n.id==='modalBack').length,1);
c.closeModal();assert.equal(nodes.length,1);assert.equal(nodes[0],report);assert.equal(report.id,'modalBack');
c.closeModal();c.closeModal();assert.equal(nodes.length,0);

let pending=c.showTimeReport();
const overview=nodes[0];c.openPersonalTimeWeek(monday);const detail=nodes[1];
await reply(pending);
assert.equal(nodes[0],overview);assert.equal(nodes[1],detail);assert.equal(title(detail),'KW 39 / 2026');
assert.equal(nodes.filter(n=>n.id==='modalBack').length,1);
assert.equal(overview.querySelector('#shareMyTimes').disabled,false);
c.closeModal();assert.equal(nodes[0],overview);c.closeModal();

pending=c.showTimeReport();c.closeModal();await reply(pending);assert.equal(nodes.length,0);
pending=c.showTimeReport();c.state.currentUserId='other';c.state.myTimeSharing=false;await reply(pending);assert.equal(c.state.myTimeSharing,false);c.closeModal();c.state.currentUserId='me';
fetchError=true;await c.showTimeReport();assert.equal(nodes[0].querySelector('#shareMyTimes').disabled,false);assert.equal(nodes[0].querySelector('#timeSharingMessage').textContent,'Offline');c.closeModal();fetchError=false;
console.log('PASS: back navigation, unique active dialog, in-place async refresh, dismissal/account change and network failure.');

for(const ms of [0,31000,62000,3631000,3599600])assert.equal(c.fmtDuration(ms),c.timeSummaryDuration(ms));
assert.equal(c.timeSummaryDuration(31000),'0 Std. 00 Min. 31 Sek.');
assert.equal(c.timeSummaryDuration(62000),'0 Std. 01 Min. 02 Sek.');
assert.equal(c.timeSummaryDuration(3599600),'1 Std. 00 Min.');
c.state.timeEntries=[own,entry('2026-09-21T09:00:00Z','2026-09-21T09:00:31Z',{id:'second'})];
const html=c.personalTimeExportHtml(monday,now);
assert.equal((html.match(/0 Std\. 00 Min\. 31 Sek\./g)||[]).length,2);
assert.ok(html.includes('0 Std. 01 Min. 02 Sek.'));
assert.ok(html.includes('auf Sekunden gerundet'));
const bad=[entry('bad','bad'),entry('2026-09-22T08:00Z','2026-09-22T09:00Z'),entry('2026-09-21T10:00Z','2026-09-21T09:00Z'),entry(own.start,null),entry(own.start,own.end,{userId:'other'})];
assert.deepEqual(Array.from(c.recentPersonalTimeEntries([...bad,own],'me',now),e=>e.id),['entry']);
assert.equal(c.personalTimeWeeks([...bad,own],'me',now).reduce((s,w)=>s+w.ms,0),31000);
assert.equal(c.personalTimeWeekEntries([...bad,own],'me',monday,now).length,1);
console.log('PASS: shared seconds format, export total and common completed-entry validation.');

c.state.timeEntries=[structuredClone(own)];const before=JSON.stringify(c.state.timeEntries);
for(const [start,end] of [['bad','bad'],['2026-09-22T08:00Z','2026-09-22T09:00Z'],['2026-09-21T10:00Z','2026-09-21T09:00Z']]){
 fields.teStart={value:start};fields.teEnd={value:end};c.saveTimeEntry('entry');assert.equal(saved,0);assert.equal(JSON.stringify(c.state.timeEntries),before);
}
assert.equal(alerts.length,3);
c.editTimeEntry('entry');assert.ok(nodes[0].querySelector('.modal').innerHTML.includes('step="1"'));assert.ok(nodes[0].querySelector('.modal').innerHTML.includes(':31"'));c.closeModal();
fields.teStart={value:own.start};fields.teEnd={value:own.end};fields.teNote={value:'Testnotiz'};fields.teVolunteer={checked:true};
const realReport=c.showTimeReport;c.showTimeReport=()=>{};c.saveTimeEntry('entry');c.showTimeReport=realReport;
assert.equal(saved,1);assert.equal(c.state.timeEntries[0].note,'Testnotiz');assert.equal(c.state.timeEntries[0].volunteer,true);
console.log('PASS: future/invalid edits rejected without mutation; valid second-precision edit saved.');

for(const [start,end,expected] of [
 ['2026-09-20T23:30:00+02:00','2026-09-21T00:30:00+02:00',[30,30]],
 ['2026-09-20T23:00:00+02:00','2026-09-21T00:00:00+02:00',[60]],
 ['2026-03-29T01:30:00+01:00','2026-03-30T00:30:00+02:00',[1290,30]],
 ['2026-10-25T01:30:00+02:00','2026-10-26T00:30:00+01:00',[1410,30]],
 ['2020-12-31T23:30:00+01:00','2021-01-04T00:30:00+01:00',[4350,30]]]){
 const data=[entry(start,end)],at=Date.parse('2026-12-01T12:00Z'),weeks=c.personalTimeWeeks(data,'me',at);
 assert.deepEqual(Array.from(weeks.filter(w=>w.ms).sort((a,b)=>a.monday-b.monday),w=>w.ms/60000),expected);
 for(const week of weeks)assert.equal(c.personalTimeWeekEntries(data,'me',week.monday,at).reduce((s,r)=>s+r.ms,0),week.ms);
}
console.log('PASS: week/year boundaries, exact midnight and DST detail/total equality.');

// Optional disposable browser fixture; production auth and data are never loaded.
if(process.argv[2]){
 const css=index.match(/<style>([\s\S]*?)<\/style>/)[1];
 const setup=`const $=s=>document.querySelector(s);const esc=${esc.toString()};const state=${JSON.stringify({currentUserId:'me',currentRole:'admin',users:[{id:'me',name:'Testperson'}],timeEntries:[own,entry('2026-09-21T09:00:00Z','2026-09-21T09:00:31Z',{id:'second'})]})};const currentUser=()=>state.users[0];const timeEntryLabel=e=>e.workLabel;const authHeaders=async()=>({});let finishFetch;const fetch=()=>new Promise(r=>finishFetch=r);const save=()=>{};`;
 fs.writeFileSync(process.argv[2],`<!doctype html><html lang="de"><meta charset="utf-8"><title>ECG Regressionstest</title><style>${css}</style><body><h1>ECG – synthetischer Funktionstest</h1><button onclick="showTimeReport()">Zeiterfassung öffnen</button><button style="position:fixed;top:0;right:0;z-index:100" onclick="finishFetch({ok:true,json:async()=>({timeEntries:[],myTimeSharing:false})})">Serverantwort auslösen</button><div id="modalRoot"></div><script>${setup}\n${summary}\n${durationCode}\n${modalCode}\n${reportCode}\n${editCode}\n${saveCode}</script></body></html>`);
}
