import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({state:{currentUserId:'me',timeEntries:[]}});
vm.runInContext(fs.readFileSync('assets/time-summary.js','utf8'),c);
const entry=(start,end,userId='me')=>({start,end,userId});
const now=Date.parse('2026-09-21T20:00:00+02:00');
const data=[entry('2026-09-21T08:10:00+02:00','2026-09-21T10:25:00+02:00'),entry('2026-09-20T06:00:00+02:00','2026-09-20T06:25:00+02:00'),entry('2026-09-19T18:10:00+02:00','2026-09-19T19:20:00+02:00'),entry('2026-09-18T14:15:00+02:00','2026-09-18T14:55:00+02:00'),entry('2026-09-21T08:00:00+02:00','2026-09-21T18:00:00+02:00','other')];
const before=JSON.stringify(data),weeks=c.personalTimeWeeks(data,'me',now);
assert.equal(weeks[0].label,'KW 39 / 2026');assert.equal(weeks[0].ms/60000,135);
assert.equal(weeks[1].label,'KW 38 / 2026');assert.equal(weeks[1].ms/60000,135);
assert.equal(c.timeSummaryDuration(weeks[0].ms),'2 Std. 15 Min.');
assert.equal(JSON.stringify(data),before);
const cross=c.personalTimeWeeks([entry('2026-09-20T23:30:00+02:00','2026-09-21T00:30:00+02:00')],'me',now);
assert.equal(cross[0].ms/60000,30);assert.equal(cross[1].ms/60000,30);
assert.equal(c.personalTimeWeeks([],'me',Date.parse('2021-01-01T12:00Z'))[0].label,'KW 53 / 2020');
assert.equal(c.personalTimeWeeks([],'me',now).length,2);
assert.equal(c.personalTimeWeeks([entry('bad','bad'),entry('2026-09-21T12:00Z',null),entry('2026-09-21T12:00Z','2026-09-21T10:00Z'),entry('2026-09-22T12:00Z','2026-09-22T13:00Z')],'me',now)[0].ms,0);
for(const [start,end,hours] of [['2026-03-29T01:30:00+01:00','2026-03-29T03:30:00+02:00',1],['2026-10-25T01:30:00+02:00','2026-10-25T03:30:00+01:00',3]]){
 const xs=c.personalTimeWeeks([entry(start,end)],'me',Date.parse('2026-12-01T12:00Z'));assert.equal(xs.reduce((s,x)=>s+x.ms,0)/3600000,hours);
}
const recent=c.recentPersonalTimeEntries(data,'me');assert.equal(recent.length,3);assert.equal(recent[0].start,data[0].start);assert.ok(recent.every(e=>e.userId==='me'));
c.state.timeEntries=data;const html=c.personalTimeSummaryHtml();assert.ok(html.includes('Meine Stunden je Kalenderwoche'));assert.ok(html.includes('Gesamt erfasst'));
const index=fs.readFileSync('index.html','utf8');assert.ok(index.includes('${personalTimeSummaryHtml()}'));assert.ok(index.includes('recentPersonalTimeEntries(state.timeEntries,state.currentUserId)'));
console.log('Wochen-, Jahreswechsel-, DST-, Datenschutz-, Dreierlimit- und HTML-Einbindungstests bestanden.');
