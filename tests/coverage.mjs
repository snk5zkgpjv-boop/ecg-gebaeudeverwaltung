import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync('personal/personal.js','utf8');
const ctx=vm.createContext({state:{
 roster:[{id:'1',account_id:'l',cover_group:'cleaning'},{id:'2',account_id:null,name:'Offline',cover_group:'cleaning'},{id:'3',account_id:'r',cover_group:'caretaker'}],
 accounts:['l','r','d','p'].map(id=>({id,teams:id==='p'?['pastoral']:['building']})),diakonie:['d']
}});
vm.runInContext(ui.slice(ui.indexOf('function candidates'),ui.indexOf('function deputies')),ctx);
assert.deepEqual(Array.from(ctx.candidates('building','l'),p=>p.id),['staff:2','r']);
assert.deepEqual(Array.from(ctx.candidates('building','r'),p=>p.id),['d']);
assert.deepEqual(Array.from(ctx.candidates('pastoral','r'),p=>p.id),['p']);
assert.equal(ctx.selection('staff:2').planned,'2');
assert.equal(ctx.selection('r').deputy,'r');
