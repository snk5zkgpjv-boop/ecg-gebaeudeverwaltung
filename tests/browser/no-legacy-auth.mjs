import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';

const fixture=await browserFixture();
const {browser,origin}=fixture;
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const foreign=[],errors=[],calls=[];
  let loggedIn=false;
  page.on('request',request=>{
   const url=new URL(request.url());
   if(url.origin!==origin)foreign.push(url.origin);
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  const user={id:'synthetic-login',appUserId:'synthetic-profile',name:'Synthetic',
    role:'admin',permissions:{},mustChangePassword:false};
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/api/auth/migrate')return route.continue();
   calls.push(url.pathname);
   const reply=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname==='/api/auth/session')return reply(loggedIn?200:401,
     loggedIn?{user}:{error:'Anmeldung erforderlich'});
   if(url.pathname==='/api/auth/forgot-password'){
    assert.equal(request.method(),'POST');
    assert.equal(request.postDataJSON().email,'synthetic@example.test');
    return reply(200,{ok:true,message:'Falls ein aktives Konto existiert, wurde eine E-Mail versendet.'});
   }
   if(url.pathname==='/api/auth/login'){
    assert.equal(request.method(),'POST');
    assert.equal(request.postDataJSON().email,'synthetic@example.test');
    assert.equal(request.postDataJSON().password,'synthetic-password');
    loggedIn=true;
    return reply(200,{ok:true,user});
   }
   if(url.pathname==='/api/auth/logout'){
    assert.equal(request.method(),'POST');
    loggedIn=false;
    return reply(200,{ok:true});
   }
   if(url.pathname==='/api/state')return reply(200,{areas:[],state:{version:6,users:[],rooms:[]}});
   return reply(404,{error:'missing'});
  });
  await page.goto(origin+'/?einstieg=portal');
  await page.locator('#loginEmail').waitFor();
  assert.equal(await page.getByText('Bisherigen PIN-Zugang einmalig umstellen').count(),0);
  assert.equal(await page.getByText('Anmeldecode senden').count(),0);
  await page.locator('#loginEmail').fill('synthetic@example.test');
  await page.getByRole('button',{name:'Kennwort vergessen'}).click();
  await page.getByText('Falls ein aktives Konto existiert').waitFor();
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.getByRole('button',{name:'Anmelden',exact:true}).click();
  await page.waitForURL('**/portal/');
  await page.locator('#logout').waitFor({state:'visible'});
  await page.locator('#logout').click();
  await page.waitForURL('**/willkommen/');
  const response=await page.request.post(origin+'/api/auth/migrate',{data:{password:'synthetic'}});
  assert.equal(response.status(),404,'removed route must not be served');
  assert.deepEqual(foreign,[],'no foreign-host network requests during normal flows');
  assert.deepEqual(errors,[],'no browser JavaScript errors');
  for(const route of ['/api/auth/login','/api/auth/logout','/api/auth/forgot-password'])
   assert.ok(calls.includes(route),'expected real browser request to '+route);
  console.log('PASS: '+width+'px login, logout, forgot-password and removed legacy route; no foreign requests.');
  await page.close();
 }
} finally {await fixture.close();}
