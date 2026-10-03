import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const api=fs.readFileSync(new URL('../api/state.js',import.meta.url),'utf8');
const source=api.slice(api.indexOf('const defaults'),api.indexOf('export default'));
const ctx=vm.createContext({structuredClone});
vm.runInContext(source,ctx);
const current={rooms:[{id:'existing',tasks:[]},{id:'new-room',tasks:[{id:'task',title:'Vacuum'}]}],eventChecklists:[{id:'new-list',updatedAt:'2026-10-03T10:00:00Z',sections:[]}],issues:[],timeEntries:[],users:[]};
for(const role of ['admin','coordinator','technician','cleaner']){
 const next=ctx.accepted(structuredClone(current),{rooms:[{id:'existing',tasks:[]}],eventChecklists:[],issues:[],timeEntries:[]},{id:'u',role});
 assert.equal(next.rooms.length,2,role);
 assert.equal(next.rooms.find(r=>r.id==='new-room').tasks[0].title,'Vacuum');
 assert.equal(next.eventChecklists.length,1,role);
}
for(const role of ['admin','coordinator']){
 const removed=ctx.accepted(current,{rooms:[current.rooms[0]],roomDeleteIds:['new-room'],eventChecklists:[]},{id:'u',role});
 assert.equal(removed.rooms.length,1);
 assert.equal(removed.deletedRooms['new-room'],true);
 const stale=ctx.accepted(removed,{rooms:current.rooms,deletedRooms:{},eventChecklists:[]},{id:'u',role});
 assert.equal(stale.rooms.length,1,'old tab cannot resurrect');
 assert.equal(ctx.visible(stale,{id:'u',role}).deletedRooms,undefined);
}
const forged=ctx.accepted(current,{rooms:[],roomDeleteIds:['new-room'],deletedRooms:{'new-room':true}},{id:'u',role:'technician'});
assert.equal(forged.rooms.length,2);assert.equal(Object.keys(forged.deletedRooms).length,0);
const newer=ctx.accepted(current,{rooms:[],eventChecklists:[{id:'new-list',updatedAt:'2026-10-02',sections:[{bad:true}]}]},{id:'u',role:'admin'});
assert.equal(newer.eventChecklists[0].sections.length,0);
assert.ok(api.includes("COALESCE(data->'rooms','[]'::jsonb)=${previousRooms}"));
assert.ok(api.includes("COALESCE(data->'eventChecklists','[]'::jsonb)=${previousChecklists}"));
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const deleteSource=html.split('\n').find(line=>line.startsWith('window.deleteRoom='));
const ui=vm.createContext({window:{},state:{rooms:structuredClone(current.rooms)},can:()=>true,confirm:()=>true,save(){},closeModal(){},render(){}});
vm.runInContext(deleteSource,ui);ui.window.deleteRoom('new-room');
assert.equal(ui.state.rooms.length,1);assert.equal(ui.state.roomDeleteIds[0],'new-room');
console.log('PASS: room/checklist preservation, roles, explicit deletion, tombstones, newer list, concurrent-write guards, UI delete intent');
