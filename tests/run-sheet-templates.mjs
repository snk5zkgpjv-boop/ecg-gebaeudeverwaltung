import assert from 'node:assert/strict';
import {templates,blockOptions,makeBlock,makeTemplate,suggestTemplate} from '../assets/run-sheet-templates.js';
const totals=templates.map(t=>makeTemplate(t.id).reduce((s,item)=>s+item.minutes,0));
assert.deepEqual(totals,[60,60,60,75,75]);
const split=makeTemplate('wed-song');
assert.ok(split.findIndex(row=>row.title==='Zwischenlied')<split.findIndex(row=>row.title.includes('Fortsetzung')));
const fri=makeTemplate('fri');
assert.equal(fri.length,2);assert.match(fri[0].lead,/1–2 Sänger/);assert.match(fri[1].title,/gemeinsame Gebetszeit/);
assert.equal(makeTemplate('sun-worship')[2].title,'Worship');
for(const title of ['Kindersegnung','Ankündigungen','Verlobung','Zwischenlied','Schlusslied','Gemeindelied']){
 assert(blockOptions.some(b=>b.title===title));
}
const draft=makeTemplate('sun');draft[0].minutes=23;draft[0].lead='Andere Person';
assert.notDeepEqual(draft,makeTemplate('sun'));
assert.throws(()=>makeBlock('__proto__'));
assert.throws(()=>makeTemplate('unbekannt'));
assert.equal(suggestTemplate('Bibelstunde'), 'wed');
assert.equal(suggestTemplate('Gebetsstunde'), 'fri');
assert.equal(suggestTemplate('Gottesdienst mit Worship'), 'sun-worship');
assert.equal(suggestTemplate('Gottesdienst'), 'sun');
assert.equal(suggestTemplate('Beerdigung'), '');
