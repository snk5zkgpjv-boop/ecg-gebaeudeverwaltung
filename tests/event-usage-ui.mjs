import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../assets/event-usage-model.js';
import {escapeHtml as h,usagePrintHtml} from '../assets/event-usage-print.js';
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function client(){
 const elements=new Map();let nodes=[],sent=[],fail=false,pendingResolve=null,delay=false;
 class Element{
  constructor(id='',value='',extra={}){Object.assign(this,{id,value,checked:false,disabled:false,textContent:'',events:{}},extra);}
  addEventListener(type,fn){this.events[type]=fn;}
  set innerHTML(html){this.html=html;if(this.id==='eu-tasks'){nodes=nodes.filter(n=>n.className!=='eu-tasks');for(const m of html.matchAll(/<textarea class="eu-tasks"[^>]*>([\s\S]*?)<\/textarea>/g))nodes.push(new Element('',decode(m[1]),{className:'eu-tasks'}));}}
 }
 function modal(html){
  elements.clear();nodes=[];
  for(const m of html.matchAll(/<(input|select|textarea|button|span|div|p)\b([^>]*)>([\s\S]*?)(?=<|$)/g)){
   const attrs=m[2],id=attrs.match(/\bid="([^"]+)"/)?.[1]||'';
   if(!id&&m[1]!=='input')continue;
   const value=decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]||m[1]==='textarea'&&m[3]||'');
   const el=new Element(id,value,{checked:/\bchecked\b/.test(attrs),className:attrs.match(/\bclass="([^"]+)"/)?.[1]||''});
   nodes.push(el);if(id)elements.set(id,el);
  }
  if(elements.has('eu-kind'))elements.get('eu-kind').value='private';
 }
 const state={currentRole:'admin',currentUserId:'u',users:[{id:'u',name:'Test-Hausmeister'}],rooms:[{id:'f',name:'Freizeitraum',floor:'DG'},{id:'u',name:'Speisesaal',floor:'UG'},{id:'e',name:'Gemeindesaal',floor:'EG'}],calendarEvents:[{id:'event1',title:'Testfeier',start:'2026-11-08T12:00:00+01:00',end:'2026-11-08T20:00:00+01:00'}]};
 const getNodes=sel=>sel==='.eu-room:checked'?nodes.filter(n=>n.className==='eu-room'&&n.checked):sel==='.eu-tasks'?nodes.filter(n=>n.className==='eu-tasks'):sel==='.eu-room,#eu-kitchen,#eu-toilets'?nodes.filter(n=>n.className==='eu-room'||['eu-kitchen','eu-toilets'].includes(n.id)):sel==='#eu-save,#eu-save-print'?nodes.filter(n=>['eu-save','eu-save-print'].includes(n.id)):[];
 const context=vm.createContext({console,state,...model,h,usagePrintHtml,window:{createEventAgreement(){}},document:{getElementById:id=>elements.get(id),querySelectorAll:getNodes},location:{origin:'http://test.local'},currentUser:()=>state.users[0],can:()=>state.currentRole==='admin',modal,closeModal(){},eventChecklistFor:()=>null,floorSortKey:()=>0,authHeaders:async()=>({}),crypto:{randomUUID:()=>`operation_${sent.length.toString().padStart(12,'0')}`},confirm:()=>true,alert(){},URL,Date,
 fetch:async(url,options)=>{
  if(!options?.method)return {ok:true,json:async()=>({document:null})};
  sent.push(JSON.parse(options.body).eventUsage);
  if(delay)await new Promise(r=>pendingResolve=r);
  if(fail)throw new Error('Netzwerk nicht erreichbar');
  const last=sent.at(-1),d=model.buildUsageDocument(last.document,state,{id:'u'});
  return {ok:true,json:async()=>({ok:true,document:{...d,version:last.expectedVersion+1}})};
 }});
 let source=fs.readFileSync(new URL('../assets/event-usage-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext(source,context);
 return {context,state,e:id=>elements.get(id),rooms:()=>nodes.filter(n=>n.className==='eu-room'),sent,fail:v=>fail=v,delay:v=>delay=v,resolve:()=>pendingResolve?.()};
}
const c=client();await c.context.window.createEventAgreement('event1');
assert.equal(c.e('eu-fee').value,'');
c.rooms().find(r=>r.value==='f').checked=true;c.rooms().find(r=>r.value==='f').events.change();
assert.equal(c.e('eu-fee').value,50);assert.match(c.e('eu-cleaning').value,/Technikraum/);
c.e('eu-name').value='Testperson';
c.fail(true);await c.e('eu-save').onclick();assert.match(c.e('eu-status').textContent,/Entwurf bleibt/);assert.equal(c.e('eu-save').disabled,false);
const retryId=c.sent[0].mutationId;c.fail(false);await c.e('eu-save').onclick();assert.equal(c.sent[1].mutationId,retryId);assert.match(c.e('eu-status').textContent,/Auf dem Server gespeichert/);
c.rooms().find(r=>r.value==='f').checked=false;c.rooms().find(r=>r.value==='f').events.change();c.rooms().find(r=>r.value==='u').checked=true;c.rooms().find(r=>r.value==='u').events.change();
assert.equal(c.e('eu-fee').value,100);assert.match(c.e('eu-cleaning').value,/Hauswirtschaftsraum/);
c.rooms().find(r=>r.value==='e').checked=true;c.rooms().find(r=>r.value==='e').events.change();assert.equal(c.e('eu-fee').value,200);assert.match(c.e('eu-cleaning').value,/Erste-Hilfe-Raum/);
c.e('eu-kind').value='wedding';c.e('eu-kind').events.change();assert.match(c.e('eu-deposit').textContent,/300/);
c.e('eu-kind').value='private';c.e('eu-kind').events.change();assert.match(c.e('eu-deposit').textContent,/keine Kaution/);
c.delay(true);const one=c.e('eu-save').onclick();const two=c.e('eu-save').onclick();await new Promise(r=>setTimeout(r,0));const count=c.sent.length;c.resolve();await Promise.all([one,two]);assert.equal(c.sent.length,count);
// Changing users during an in-flight save must not show or print that user's document.
const before=c.e('eu-status').textContent;c.delay(true);const task=c.e('eu-save').onclick();await new Promise(r=>setTimeout(r,0));c.state.currentUserId='other';c.resolve();await task;assert.ok(!c.e('eu-status').textContent.includes('Auf dem Server gespeichert'));
console.log('PASS: actual UI functions, room selection, fees, room-specific cleaning locations, wedding toggle, retry, double-click and user switch');
