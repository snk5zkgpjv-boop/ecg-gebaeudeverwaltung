import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {browserFixture} from './helpers/fixture.js';

// Match Vercel header rules exactly once; ordinary index.html must retain
// the original policy while only static subpages gain script-src 'self'.
const config=JSON.parse(await fs.readFile(new URL('../../vercel.json',import.meta.url),'utf8'));
function appliedPolicy(path){
 const matching=config.headers.filter(entry=>new RegExp('^'+entry.source+'$').test(path));
 const csp=matching.flatMap(entry=>entry.headers.filter(h=>h.key.toLowerCase()==='content-security-policy'));
 assert.equal(csp.length,1,'exactly one CSP for '+path);
 return csp[0].value;
}
const pages=[
 ['/portal/','portal'],['/personal/','personal'],['/personal/stamm.html','stamm'],
 ['/members/','members'],['/finanzen/','finance'],
 ['/finanzen/kontodaten.html','bank'],['/wochenplan/','week'],['/willkommen/','welcome'],
];
const base="frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
assert.equal(appliedPolicy('/'),base,'inline-script main app policy unchanged');
assert.equal(appliedPolicy('/index.html'),base);
assert.equal(appliedPolicy('/api/auth/session'),base);
for(const [path] of [...pages,['/finanzen/admin-test-live.html']]){
 assert.equal(appliedPolicy(path),base+"; script-src 'self'",path);
}
const fixture=await browserFixture();
const {browser,origin}=fixture;
const user={id:'synthetic-user',appUserId:'synthetic-user',name:'Synthetic',role:'admin',permissions:{manageUsers:true,viewFinance:true},mustChangePassword:false};
try{
 for(const [path,kind] of pages){
  const page=await browser.newPage({viewport:{width:390,height:850}});
  const violations=[],javascriptErrors=[];
  page.on('console',message=>{if(/content security policy|content-security-policy|refused to execute|refused to load/i.test(message.text()))violations.push(message.text())});
  page.on('pageerror',e=>javascriptErrors.push(e.message));
  await page.addInitScript(()=>{
   window.__cspViolations=[];
   document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push({directive:e.violatedDirective,blocked:e.blockedURI}));
  });
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)return route.abort();
   if(request.resourceType()==='document'){
    const response=await route.fetch();
    return route.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':appliedPolicy(url.pathname)}});
   }
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const payload=(()=>{
    if(url.pathname==='/api/auth/session')return {user};
    if(url.pathname==='/api/state'){
     if(url.searchParams.has('personnel')){
      if(url.searchParams.get('personnel')==='stamm')return {staff:[],accounts:[]};
      return {accounts:[],teams:['building'],rows:[],roster:[],diakonie:[],external:[],template:'',linked:false};
     }
     if(url.searchParams.has('members'))return {member:{id:'synthetic-member',data:{name:'Synthetic'}} ,members:[],accounts:[]};
     if(url.searchParams.has('financePilot'))return {rows:[]};
     if(url.searchParams.has('bankAccount'))return {bank:{accountHolder:'Synthetic',bankAccount:'DE00000000000000000000',bankBic:'TESTDE00',bankName:'Synthetic Bank'},revision:1,canEdit:true};
     if(url.searchParams.has('duties'))return {duties:[]};
     return {version:6,users:[],rooms:[]};
    }
    if(url.pathname==='/api/calendar')return {events:[],entries:[],syncedAt:new Date().toISOString()};
    return {};
   })();
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  const response=await page.goto(origin+path,{waitUntil:'domcontentloaded'});
  assert.equal(response.headers()['content-security-policy'],base+"; script-src 'self'",path);
  switch(kind){
   case 'portal':
    await page.locator('#tiles .tile').first().waitFor();
    await page.locator('#tiles a.tile[href="#finance"]').click();
    await page.locator('#section-view').waitFor({state:'visible'});
    break;
   case 'personal':
    await page.locator('#request').waitFor({state:'visible'});
    await page.locator('#starts').fill('2026-12-01');
    assert.equal(await page.locator('#ends').getAttribute('min'),'2026-12-01');
    break;
   case 'stamm':
    await page.locator('#new').waitFor({state:'visible'});
    await page.locator('#new').click();
    await page.locator('#editor').waitFor({state:'visible'});
    break;
   case 'members':
    await page.locator('#editor').waitFor({state:'visible'});
    await page.locator('#name').fill('Synthetic Updated');
    assert.equal(await page.locator('#name').inputValue(),'Synthetic Updated');
    break;
   case 'finance':
    await page.locator('#pilot').waitFor({state:'visible'});
    await page.locator('#receipts details').first().locator('summary').click();
    assert.equal(await page.locator('#receipts details').first().getAttribute('open'),'');
    break;
   case 'bank':
    await page.locator('#details').waitFor({state:'visible'});
    await page.locator('#copy-iban').click();
    await page.locator('#status').waitFor({state:'visible'});
    break;
   case 'week':
    await page.locator('#days section').first().waitFor();
    await page.locator('#days section button').first().click();
    assert.ok(await page.locator('#days .event').count()>0);
    break;
   case 'welcome':
    await page.locator('#banner-next').waitFor({state:'visible'});
    await page.locator('#banner-next').click();
    assert.equal(await page.locator('#banner-pause').textContent(),'Abspielen');
    break;
  }
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>window.__cspViolations),[],path+' must not violate CSP');
  assert.deepEqual(violations,[],path+' browser console CSP errors');
  assert.deepEqual(javascriptErrors,[],path+' browser JavaScript errors');
  console.log('PASS: '+path+' script CSP header, authenticated core action and no CSP violations');
  await page.close();
 }
}finally{await fixture.close();}
