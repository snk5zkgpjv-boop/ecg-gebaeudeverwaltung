import assert from 'node:assert/strict';
import { normalizeRoomLocation, matchCalendarRoom, attachCalendarRooms } from '../lib/room-calendar.js';

const rooms=[
  {id:'raum-2',name:'Zimmer 2',floor:'1. OG',qrId:'qr-2',calendarAliases:['Zimmer Nr. 2','Zimmer Nummer 2']},
  {id:'frei',name:'Freizeitraum',floor:'DG',qrId:'qr-frei',calendarAliases:[]},
];
assert.equal(normalizeRoomLocation('Zimmer Nr.2'),'zimmer 2');
assert.equal(normalizeRoomLocation('Zimmer Nummer 2'),'zimmer 2');
assert.deepEqual(matchCalendarRoom({location:'Zimmer Nr.2'},rooms),{status:'matched',roomId:'raum-2'});
assert.deepEqual(matchCalendarRoom({location:'Freizeitraum'},rooms),{status:'matched',roomId:'frei'});
assert.deepEqual(matchCalendarRoom({location:'Jugend'},rooms),{status:'unknown',roomId:null});
assert.deepEqual(matchCalendarRoom({location:''},rooms),{status:'missing',roomId:null});
assert.deepEqual(matchCalendarRoom({location:'Freizeitraum',cancelled:true},rooms),{status:'cancelled',roomId:null});
const duplicate=[...rooms,{id:'raum-3',name:'Anderer Raum',calendarAliases:['Zimmer 2']}];
assert.deepEqual(matchCalendarRoom({location:'Zimmer 2'},duplicate),{status:'ambiguous',roomId:null});
const events=attachCalendarRooms([{id:'evt1',location:'Freizeitraum'},{id:'evt2',location:'Zimmer 3'}],rooms);
assert.deepEqual(matchCalendarRoom({location:'Alter Name',googleRoomId:'frei'},rooms),{status:'matched',roomId:'frei'});
assert.deepEqual(matchCalendarRoom({location:'Freizeitraum',googleRoomId:'removed'},rooms),{status:'unknown',roomId:null});
assert.equal(events[0].roomId,'frei');
assert.equal(events[0].roomMatchStatus,'matched');
assert.equal(events[1].roomId,null);
assert.equal(events[1].roomMatchStatus,'unknown');
assert.equal(rooms[0].qrId,'qr-2');
console.log('PASS room calendar matcher');
