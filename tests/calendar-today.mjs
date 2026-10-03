import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(!m[1].includes('src=')&&!m[1].includes('type="module"'))new vm.Script(m[2]);}
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-02T22:30:00Z']));}}
const ctx=vm.createContext({Date:Clock,Intl,state:{settings:{},calendarEvents:[]},can:()=>true,ECG_CALENDAR_NAME:'Test',esc:String,eventDateLabel:()=>({day:3,mon:'Okt'}),eventRuleFor:()=>null,eventChecklistFor:()=>null});
vm.runInContext(html.slice(html.indexOf('function calendarDayKey'),html.indexOf('window.syncGoogleCalendar=')),ctx);
const ev=(id,start)=>({id,title:id,start,end:start});
ctx.state.calendarEvents=[ev('yesterday','2026-10-02T12:00:00Z'),ev('today','2026-10-02T23:00:00Z'),ev('future','2026-11-01T12:00:00Z')];
let out=ctx.calendarView();assert.ok(out.indexOf('yesterday')<out.indexOf('id="calendarToday"'));assert.ok(out.indexOf('id="calendarToday"')<out.indexOf('>today<'));assert.equal(out.split('id="calendarToday"').length,2);
ctx.state.calendarEvents=[ev('old','2026-09-01')];out=ctx.calendarView();assert.ok(out.includes('id="calendarToday"'));
ctx.state.calendarEvents=[];assert.ok(ctx.calendarView().includes('id="calendarToday"'));
assert.equal(ctx.calendarDayKey('2026-10-02T22:30:00Z'),'2026-10-03');
assert.equal(ctx.calendarDayKey('2026-10-25T23:30:00Z'),'2026-10-26');
let marker=null,scroll=0;
const app={set innerHTML(v){marker={getBoundingClientRect:()=>({top:1500-scroll})}}};
Object.assign(ctx,{header:()=>'',nav:()=>'',window:{scrollBy(x,y){scroll+=y}},$:s=>s==='#calendarToday'?marker:s==='#app'?app:s==='.topbar'?{getBoundingClientRect:()=>({height:80})}:null});
ctx.state.activeTab='calendar';
vm.runInContext(html.slice(html.indexOf('function render('),html.indexOf('window.go=')),ctx);
ctx.render();assert.equal(scroll,1408,'entry aligns today below header');
scroll=1800;ctx.render();assert.equal(scroll,1800,'refresh preserves manual scroll');
ctx.render({calendarToday:true});assert.equal(scroll,1408,'today button returns to today');
assert.ok(!html.slice(html.indexOf('function dashboard('),html.indexOf('window.startTime=')).includes('${marker}'));
console.log('PASS: current Berlin day, DST, historical/future/empty lists, first open, refresh preservation, explicit Today, inline syntax');
