import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();const {browser,origin}=fixture;
try{
 for(const width of [390,1280]){
  for(const role of ['admin','financeDeacon','member']){
   const page=await browser.newPage({viewport:{width,height:900}}),calls=[],errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.print=()=>{window.__printed=true}});
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin)return route.abort();
    if(!u.pathname.startsWith('/api/'))return route.continue();
    calls.push(u.pathname+' '+route.request().method());
    if(u.pathname==='/api/auth/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{role,appUserId:'synthetic',name:'Synthetic',mustChangePassword:false}})});
    throw Error('Unexpected backend request '+u.pathname);
   });
   await page.goto(origin+'/finanzen/admin-test-live.html');
   if(role==='member'){
    await page.getByText(/Nur Administration und Finanzdiakonie/).waitFor();
    assert.equal(await page.locator('#app').isVisible(),false);
   }else{
    await page.getByText(/Demo bereit/).waitFor();
    await page.locator('#description').fill('Rein synthetische Ausgabe');
    await page.locator('#date').fill('2026-11-16');
    await page.locator('#amount').fill('12,50');
    await page.locator('#confirmed').check();
    await page.getByRole('button',{name:'Musterantrag erstellen'}).click();
    await page.getByText(/Musterantrag im Browser erstellt/).waitFor();
    await page.getByText(/Rein synthetische Ausgabe/).waitFor();
    await page.getByRole('button',{name:'Antrag drucken / PDF'}).first().click();
    assert.equal(await page.evaluate(()=>window.__printed),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   assert.deepEqual(calls,['/api/auth/session GET'],'no finance/data API request permitted in local demo');
   assert.deepEqual(errors,[]);
   console.log('PASS finance demo '+role+' at '+width+'px');
   await page.close();
  }
 }
}finally{await fixture.close();}
