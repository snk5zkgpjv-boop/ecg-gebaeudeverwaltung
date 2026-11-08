import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();const {browser,origin}=fixture;
try{
for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[],calls=[];let fail=false,deny=false,foreign=false,dbState,delayPut=false,releasePut,putStarted,delayGet=false,releaseGet,getStarted;
 const user={id:'synthetic',appUserId:'synthetic',name:'Synthetic',role:'admin',permissions:{},mustChangePassword:false};
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  const method=route.request().method();calls.push(method+' '+u.pathname+u.search);
  const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/auth/login')return json(200,{user});
  if(u.pathname==='/api/auth/session')return json(200,{user});
  if(u.pathname==='/api/state'){
   if(!dbState){dbState=await page.evaluate(()=>{const x=structuredClone(initialState);for(const key of Object.keys(x)){if(Array.isArray(x[key]))x[key]=[];}x.settings={cloudSync:true,calendarLastSync:new Date().toISOString()};return x});dbState.users=[{id:'synthetic',name:'Synthetic',role:'admin',permissions:{},active:true}];dbState.rooms=[{id:'room-synthetic',qrId:'synthetic-qr',name:'Synthetic Room',floor:'Test',type:'Room',tasks:[{id:'task-synthetic',title:'Synthetic Task',taskType:'cleaning',interval:'weekly',status:'open'}]}];}
   if(method==='PUT'){if(delayPut){putStarted?.();await new Promise(resolve=>releasePut=resolve);}const {changes}=route.request().postDataJSON();for(const [key,edit] of Object.entries(changes))dbState[key]=edit.after;return json(200,{ok:true});}
   if(fail){fail=false;return json(503,{error:'synthetic failure'});}if(deny)return json(403,{error:'revoked'});
   if(delayGet){getStarted?.();await new Promise(resolve=>releaseGet=resolve);}
   return json(200,u.searchParams.get('entry')==='1'?{user:foreign?{...user,appUserId:'other'}:user,state:structuredClone(dbState)}:structuredClone(dbState));
  }
  if(u.pathname==='/api/calendar')return json(200,{events:[],syncedAt:new Date().toISOString()});
  throw Error('Unexpected API '+u.pathname);
 });
 await page.goto(origin+'/?bereich=pflege');await page.locator('#workSectionSelect').waitFor();
 const timeOrigin=await page.evaluate(()=>performance.timeOrigin);
 await page.locator('#workSectionSelect').selectOption('inventar');await page.waitForURL('**/?bereich=inventar');await page.locator('#workSectionSelect').waitFor();
 assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin);
 await page.goBack();await page.waitForFunction(()=>location.search==='?bereich=pflege'&&document.querySelector('#workSectionSelect')?.value==='pflege');
 await page.goForward();await page.waitForFunction(()=>location.search==='?bereich=inventar'&&document.querySelector('#workSectionSelect')?.value==='inventar',{},{timeout:5000});
 fail=true;await page.locator('#workSectionSelect').selectOption('raeume');await page.getByRole('button',{name:'Erneut versuchen'}).waitFor({timeout:5000});assert.equal(await page.locator('#workSectionSelect').count(),0);assert.equal(await page.getByText('Synthetic Room',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Erneut versuchen'}).click();await page.waitForURL('**/?bereich=raeume',{timeout:5000});await page.waitForTimeout(100);await page.locator('#workSectionSelect').waitFor({timeout:3000});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();await page.locator('#erName').fill('Unsaved synthetic name');
 const beforeBackCalls=calls.length;await page.goBack();await page.waitForTimeout(100);
 assert.equal(await page.locator('#erName').inputValue(),'Unsaved synthetic name');assert.equal(new URL(page.url()).search,'?bereich=raeume');assert.equal(calls.length,beforeBackCalls);
 await page.getByRole('button',{name:'Fenster schließen',exact:true}).click();
 await page.locator('#workSectionSelect').selectOption('pflege');await page.waitForURL('**/?bereich=pflege');await page.locator('#workSectionSelect').waitFor();
 delayPut=true;const pendingPut=new Promise(resolve=>putStarted=resolve);
 await page.evaluate(()=>setTaskStatus('room-synthetic','task-synthetic','done'));
 await page.locator('#workSectionSelect').selectOption('inventar');await pendingPut;
 assert.equal(await page.locator('#app').evaluate(el=>el.inert),true,'editing blocked during save');
 releasePut();delayPut=false;await page.waitForURL('**/?bereich=inventar');await page.locator('#workSectionSelect').waitFor();
 assert.equal(dbState.rooms[0].tasks[0].status,'done');
 await page.locator('#workSectionSelect').selectOption('pflege');await page.waitForURL('**/?bereich=pflege');await page.locator('#workSectionSelect').waitFor();
 assert.equal(await page.evaluate(()=>state.rooms[0].tasks[0].status),'done');
 foreign=true;await page.locator('#workSectionSelect').selectOption('pflege');await page.locator('#loginEmail').waitFor({timeout:5000});assert.equal(await page.locator('#app').textContent(),'');assert.equal(errors.length,0,errors.join('\n'));
 foreign=false;await page.goto(origin+'/?bereich=pflege');await page.locator('#workSectionSelect').waitFor();deny=true;await page.locator('#workSectionSelect').selectOption('benutzer');await page.locator('#loginEmail').waitFor({timeout:5000});assert.equal(await page.locator('#app').textContent(),'');
 deny=false;await page.goto(origin+'/?bereich=pflege');await page.locator('#workSectionSelect').waitFor();
 delayGet=true;const pendingGet=new Promise(resolve=>getStarted=resolve);await page.locator('#workSectionSelect').selectOption('inventar');await pendingGet;
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'ecgAccountChanged',newValue:'synthetic-switch'})));await page.locator('#loginEmail').waitFor();
 assert.equal(await page.evaluate(()=>workNavigationPending),false);assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);
 delayGet=false;releaseGet();await page.locator('#loginEmail').fill('synthetic@example.test');await page.locator('#loginPassword').fill('synthetic-password');await page.getByRole('button',{name:'Anmelden',exact:true}).click();await page.locator('#workSectionSelect').waitFor({timeout:5000});
 assert.equal(await page.evaluate(()=>workNavigationPending),false);
 console.log(`PASS ${width}px navigation same document, back/forward, failed read/retry, modal/back preservation, pending save completion, foreign/revoked-account clearing, no overflow/page errors; ${calls.length} API requests`);
 await page.unrouteAll({behavior:'ignoreErrors'});await page.close();
}
}finally{await fixture.close();}
