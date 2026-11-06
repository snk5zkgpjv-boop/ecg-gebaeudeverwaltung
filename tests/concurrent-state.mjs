import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyStateChanges} from '../lib/concurrent-state.js';

const html = readFileSync('index.html','utf8');
const server = readFileSync('api/state.js','utf8').replace(/^import .*;$/gm,'').replace('export default async function','async function');
const profile = {id:'lead',role:'coordinator'};
let data={version:6,inventory:[],calendarEvents:[],rooms:[],issues:[],eventChecklists:[],timeEntries:[]};
let forceRace=false;
async function sql(strings,payload,expected) {
  assert.match(strings.join('?'), /AND data=\?::jsonb/);
  if(forceRace){forceRace=false; data={...data,materials:['another write']};}
  if(JSON.stringify(data)!==expected) return [];
  data=JSON.parse(payload);return [{revision:1}];
}
const context=vm.createContext({process:{env:{DATABASE_URL:'test'}},structuredClone,console,applyStateChanges,
  requireUser:async()=>({profile,state:structuredClone(data)}),neon:()=>sql,syncOrganizationTimes:async()=>({})});
vm.runInContext(server,context);
async function send(body){
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await context.handler({method:'PUT',headers:{},body},res);
  return {status:res.code,ok:res.code===200,json:async()=>res.body};
}
function device(){
  const state=structuredClone(data);state.settings={cloudSync:true};
  const alerts=[];
  const c=vm.createContext({state,authSession:{},alert:msg=>alerts.push(msg),document:{},$:()=>null,
    cloudPayload:()=>state,authHeaders:async()=>({}),fetch:async(_,request)=>send(JSON.parse(request.body))});
  vm.runInContext(html.slice(html.indexOf('let cloudBase;'),html.indexOf('async function pullCloud')),c);
  c.rememberCloudBase(c.authSession,structuredClone(data));
  return {state,save:c.syncCloud,alerts};
}
const a=device(), b=device();
a.state.inventory.push({id:'cart',name:'Wagen'});
assert.equal(await a.save(),true);
b.state.calendarEvents.push({id:'event'});
forceRace=true;
assert.equal(await b.save(),true);
assert.equal(data.inventory[0].name,'Wagen');assert.equal(data.calendarEvents[0].id,'event');
assert.deepEqual(data.materials,['another write']);
const c=device(),d=device();
c.state.inventory[0].name='Wagen A';d.state.inventory[0].name='Wagen B';
assert.equal(await c.save(),true);assert.equal(await d.save(),false);
assert.equal(data.inventory[0].name,'Wagen A');assert.match(d.alerts[0],/inventor/);
assert.equal(d.state.inventory[0].name,'Wagen B');
const e=device(), f=device();
e.state.inventory.push({id:'second'});f.state.inventory.push({id:'third'});
assert.equal(await e.save(),true);assert.equal(await f.save(),true);assert.equal(data.inventory.length,3);
const g=device(),h=device();
g.state.inventory.shift();h.state.inventory[0].name='Again';
assert.equal(await g.save(),true);assert.equal(await h.save(),false);assert.equal(data.inventory.some(x=>x.id==='cart'),false);
assert.equal((await send({inventory:[]})).status,428);
console.log('Two simulated clients, real save functions: disjoint changes, same-item conflict, delete/edit, concurrent SQL retry and old client passed.');
