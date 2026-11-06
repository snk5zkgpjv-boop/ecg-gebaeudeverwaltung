import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {printModel,printPage} from '../assets/run-sheet-output.js';
import {runSheetPdf} from '../assets/run-sheet-pdf.js';

const draft={event:{title:'Gemeinde & <Test>',start:'2026-11-08T10:00:00+01:00'},start:'23:55',
 items:[{title:'Begrüßung',minutes:10,lead:'Moderation'},{title:'<Lied>',minutes:5,lead:'Musik'}]};
const model=printModel(draft);
assert.equal(model.rows[1].time,'00:05 (+1 Tag)');
assert.equal(model.end,'00:10 (+1 Tag)');
assert.equal(model.duration,15);
assert.match(printPage(model),/Gemeinde &amp; &lt;Test&gt;/);
assert.match(printPage(model),/&lt;Lied&gt;/);
assert.throws(()=>printModel({...draft,start:'25:00'}));
assert.throws(()=>printModel({...draft,items:[{title:'Zu lang',minutes:1441,lead:''}]}));
const one=await PDFDocument.load(await runSheetPdf(model));
assert.equal(one.getPageCount(),1);
assert.equal(one.getTitle(),'Ablaufplan · Gemeinde & <Test>');
const long=printModel({...draft,items:Array.from({length:80},(_,i)=>({title:'Ein langer Programmpunkt '.repeat(6)+i,minutes:10,lead:'Musikteam'}))});
const many=await PDFDocument.load(await runSheetPdf(long));
assert.ok(many.getPageCount()>1);
assert.ok(many.getPages().every(p=>p.getWidth()>595&&p.getHeight()>841));
console.log('PASS: handout escapes text, handles midnight, rejects invalid agendas, produces real A4 single and multi-page PDFs.');
