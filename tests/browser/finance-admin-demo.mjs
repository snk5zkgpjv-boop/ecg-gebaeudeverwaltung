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
    const table=page.locator('#paper .expense-table');
    assert.equal(await table.locator('thead th').count(),5);
    assert.equal(await table.locator('tbody tr').count(),10);
    for(const label of ['Auslagenerstattung','Empfänger/in:','Entstandene Kosten:','Summe der Ausgaben:','Bitte überweisen Sie den Betrag an:','Ich möchte den Betrag spenden','Unterschrift des/der Sachkostenempfängers/in']){
      assert((await page.locator('#paper').innerText()).includes(label),'Missing original form field: '+label);
    }
    assert((await page.locator('#paper').innerText()).includes('Rein synthetische Ausgabe'));
    await page.emulateMedia({media:'print'});
    const layout=await page.evaluate(()=>{
      const sheet=document.querySelector('.expense-sheet'),sig=document.querySelector('.expense-signature-line'),footer=document.querySelector('.expense-footer');
      return {sheet:sheet.getBoundingClientRect().height,signatureBottom:sig.getBoundingClientRect().bottom,footerTop:footer.getBoundingClientRect().top,paperDisplay:getComputedStyle(document.querySelector('#paper')).display};
    });
    assert.equal(layout.paperDisplay,'block');
    assert(layout.sheet>1100&&layout.sheet<1130,'A4 height in CSS pixels');
    assert(layout.signatureBottom<layout.footerTop,'signature must remain above the footer');
    await page.emulateMedia({media:'screen'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   assert.deepEqual(calls,['/api/auth/session GET'],'no finance/data API request permitted in local demo');
   assert.deepEqual(errors,[]);
   console.log('PASS finance demo '+role+' at '+width+'px');
   await page.close();
  }
 }
}finally{await fixture.close();}
