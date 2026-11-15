import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();const {browser,origin}=fixture;
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.print=()=>{window.__printed=true};});
  let role='admin';
  const currentUser=()=>({id:'synthetic',appUserId:'synthetic',name:'Testkonto',role,permissions:{},mustChangePassword:false});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin)return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();
   const respond=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname==='/api/auth/session')return respond(200,{user:currentUser()});
   if(u.pathname==='/api/state'&&u.searchParams.get('expenses')==='1'){
    if(route.request().method()==='POST'){posts.push(route.request().postDataJSON());return respond(201,{ok:true,id:'00000000-0000-4000-8000-000000000001',receiptCount:1});}
    return respond(200,{claims:[]});
   }
   if(u.pathname==='/api/ai'&&u.searchParams.get('expensesScan')==='1')return respond(200,{needsReview:true,draft:{applicant:'Testkonto',iban:'',bankOwner:'',reimbursementType:'waiver',items:[{date:'2026-11-15',description:'Aus Foto erkannter Testbeleg',project:'Kinderstunde',amountEuros:'12,50',uncertain:false}],warnings:[]}});
   throw Error('Unexpected API route: '+u);
  });
  await page.goto(origin+'/finanzen/erfassung.html?test=1');
  await page.getByText('ADMIN-TESTMODUS').waitFor();
  await page.getByRole('button',{name:'Rückfrage stellen'}).click();
  await page.getByRole('button',{name:'Erneut vorlegen'}).waitFor();
  await page.getByRole('button',{name:'Antrag drucken (Demo)'}).first().click();
  assert.equal(await page.evaluate(()=>window.__printed),true);
  await page.locator('.date').first().fill('2026-11-15');
  await page.locator('.description').first().fill('Fiktive Seife');
  await page.locator('.amount').first().fill('9,90');
  await page.locator('#confirm').check();
  await page.getByRole('button',{name:'Verbindlich einreichen'}).click();
  await page.getByText(/Demo-Antrag lokal erstellt/).waitFor();
  await page.getByText(/Fiktive Seife/).waitFor();
  assert.equal(posts.length,0,'admin demo must never submit real data');

  role='member';await page.goto(origin+'/finanzen/erfassung.html');
  await page.locator('#app').waitFor({state:'visible'});
  assert.equal(await page.locator('#finance').isVisible(),false,'member must not see finance-team records');
  await page.locator('#scan').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8HT3sAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Angaben aus Foto erkennen'}).click();
  await page.getByText(/Bitte der KI-Bildübertragung zustimmen/).waitFor();
  await page.locator('#scan-consent').check();
  await page.getByRole('button',{name:'Angaben aus Foto erkennen'}).click();
  await page.locator('.description').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('.description').value==='Aus Foto erkannter Testbeleg');
  assert.equal(await page.locator('#total').textContent(),'12,50 €');
  assert.equal(await page.locator('#confirm').isChecked(),false);
  await page.locator('#confirm').check();
  await page.locator('#form').evaluate(form=>form.requestSubmit());
  await page.getByText(/Antrag erfolgreich eingereicht/).waitFor();
  assert.equal(posts.length,1,'member form should submit only once');
  assert.equal(posts[0].items[0].cents,1250);
  assert.equal(posts[0].reimbursementType,'waiver');
  assert.equal(typeof posts[0].submissionKey,'string');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[],errors.join('\n'));
  console.log('PASS expenses at '+width+'px: admin-only demo, fake print, member form, consent-gated OCR, review and submission');
  await page.close();
 }
}finally{await fixture.close();}