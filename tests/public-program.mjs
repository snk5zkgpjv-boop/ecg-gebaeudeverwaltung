import assert from 'node:assert/strict';
import {parseProgram} from '../lib/public-program.js';
import {cards,publicEvents} from '../willkommen/termine.js';
const sample='<div class="event-item"><h2 class="event-day">Sonntag</h2><div class="event-time"><time>18:00 Uhr</time></div><div class="event-location">13. Dez</div><h3 class="event-headding">Adventskonzert</h3><div class="event-explanation">Ab 17 Uhr</div></div>';
const now=new Date('2026-11-06T13:00:00Z');
const [concert]=parseProgram(sample,now);
assert.equal(concert.key,'2026-12-13');assert.equal(concert.time,'18:00');
assert.equal(publicEvents(new Date('2026-12-13T08:00:00Z'),[concert]).slice(0,2).map(x=>x.time).join(','),'10:00,18:00');
assert.equal(publicEvents(new Date('2026-12-14T08:00:00Z'),[concert]).some(x=>x.title==='Adventskonzert'),false);
const january=parseProgram(sample.replace('Sonntag','Freitag').replace('13. Dez','1. Jan'),new Date('2026-12-25T12:00Z'));
assert.equal(january[0].key,'2027-01-01');
assert.throws(()=>parseProgram('<html>Fehler</html>'));

const records=['2026-11-06','2026-11-07','2026-11-08'].map(key=>({key,time:'19:00',title:'Thementage mit Eduard Adam'}));
records.push({key:'2027-01-06',time:'18:00',title:'Grenztermin'},{key:'2027-01-07',time:'18:00',title:'Zu spät'},{key:'2026-12-01',time:'19:00',title:'Jugendkreis'});
const titles=cards(now,records).map(x=>x.title);
assert.equal(titles.filter(x=>x==='Thementage mit Eduard Adam').length,3);
for(const title of ['Gottesdienst','Bibelstunde','Gebetsstunde','Grenztermin'])assert(titles.includes(title));
for(const title of ['Zu spät','Jugendkreis'])assert(!titles.includes(title));
