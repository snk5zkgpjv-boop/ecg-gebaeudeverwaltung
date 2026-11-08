import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();const {browser,origin}=fixture;
try{
for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900},timezoneId:'America/Los_Angeles'});let dbState,failed=true,delay=false,release,started;const errors=[],writes=[];
 const user={id:'synthetic',appUserId:'synthetic',name:'Synthetic Reader',role:'deacon',permissions:{viewCalendar:true},mustChangePassword:false};
 const events=[{id:'range',title:'Synthetic all-day range',allDay:true,start:'2026-10-24T00:00:00Z',end:'2026-10-26T23:59:59.999Z',startDate:'2026-10-24',endDateExclusive:'2026-10-27'},{id:'cancel',title:'Synthetic cancelled meeting',start:'2026-10-24T21:30:00Z',end:'2026-10-25T02:30:00Z',cancelled:true}];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});if(route.request().method()!=='GET')writes.push(route.request().method());
 if(u.pathname==='/api/state'){if(!dbState){dbState=await page.evaluate(()=>{const x=structuredClone(initialState);for(const key of Object.keys(x))if(Array.isArray(x[key]))x[key]=[];x.settings={cloudSync:true,calendarLastSync:'2026-10-01T10:00:00Z'};return x});dbState.users=[{id:'synthetic',role:'deacon',name:'Synthetic Reader',permissions:{viewCalendar:true}}];dbState.calendarEvents=[{id:'cache',title:'Synthetic cached meeting',start:'2026-10-01T10:00:00Z',end:'2026-10-01T11:00:00Z'}];}return json(200,{user,state:dbState});}
 if(u.pathname==='/api/calendar'){assert.equal(u.searchParams.get('readOnly'),'1');if(failed){failed=false;return json(502,{error:'synthetic offline'});}if(delay){started?.();await new Promise(resolve=>release=resolve);}return json(200,{events,syncedAt:'2026-11-08T12:00:00Z'});}
 if(u.pathname==='/api/auth/session')return json(200,{user});throw Error('Unexpected API '+u.pathname);});
 await page.goto(origin+'/?bereich=kalender');await page.getByRole('button',{name:'Kalender aktualisieren'}).waitFor();
 await page.getByText('Synthetic cached meeting',{exact:true}).waitFor();const payload=await page.evaluate(()=>JSON.stringify(cloudPayload()));
 await page.getByRole('button',{name:'Kalender aktualisieren'}).click();await page.getByText(/Aktualisierung fehlgeschlagen/).waitFor();assert(await page.getByText('Synthetic cached meeting',{exact:true}).isVisible());assert(await page.getByText(/Gespeicherter Kalenderstand/).isVisible());
 await page.getByRole('button',{name:'Kalender aktualisieren'}).click();await page.getByText('Synthetic all-day range',{exact:true}).waitFor();assert(await page.getByText('24.10.2026 – 26.10.2026 · ganztägig',{exact:true}).isVisible());assert(await page.getByText('24.10.2026, 23:30 – 25.10.2026, 03:30 Uhr',{exact:true}).isVisible());assert(await page.getByText('Fällt aus',{exact:true}).isVisible());assert(await page.getByText(/Direkt geladener Stand/).isVisible());assert.equal(await page.evaluate(()=>JSON.stringify(cloudPayload())),payload);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 delay=true;const pending=new Promise(resolve=>started=resolve);await page.getByRole('button',{name:'Kalender aktualisieren'}).click();await pending;await page.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'ecgAccountChanged',newValue:'synthetic'})));await page.locator('#loginEmail').waitFor();assert.equal(await page.evaluate(()=>readCalendarViewState),null);release();await page.waitForTimeout(50);assert.equal(await page.locator('#app').textContent(),'');assert.equal(await page.getByText('Synthetic all-day range',{exact:true}).count(),0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px reader: complete date ranges, cancellation, stale label, failed refresh retains cache, fresh memory-only snapshot, late account response ignored; no writes/overflow/errors`);await page.unrouteAll({behavior:'ignoreErrors'});await page.close();
}
}finally{await fixture.close();}
