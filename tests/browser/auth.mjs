import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();const {browser,origin}=fixture;
try{
for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});const calls=[];const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 let forced=true,loggedIn=true;
 const user=()=>({id:'synthetic',appUserId:'synthetic',name:'Synthetic',role:'admin',permissions:{},mustChangePassword:forced});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
  if(!u.pathname.startsWith('/api/'))return route.continue();calls.push(u.pathname+u.search);
  const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/auth/session')return json(loggedIn?200:401,loggedIn?{user:user()}:{error:'login'});
  if(u.pathname==='/api/state')return json(403,{code:'PASSWORD_CHANGE_REQUIRED',error:'password'});
  if(u.pathname==='/api/auth/change-password'){assert.deepEqual(route.request().postDataJSON(),{currentPassword:'temporary-password',newPassword:'replacement-password'});forced=false;return json(200,{ok:true,message:'Kennwort geändert. Bitte neu anmelden.'});}
  if(u.pathname==='/api/auth/logout'){loggedIn=false;return json(200,{ok:true});}
  throw Error('Unexpected API '+u.pathname);
 });
 await page.goto(origin+'/?bereich=kalender');
 await page.getByRole('heading',{name:'Vorläufiges Kennwort ändern'}).waitFor();
 assert.equal(await page.locator('.modal-close').count(),0);
 assert(await page.getByLabel('Bisheriges Kennwort').isVisible());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByLabel('Bisheriges Kennwort').fill('temporary-password');
 await page.getByLabel('Neues Kennwort',{exact:true}).fill('replacement-password');
 await page.getByRole('button',{name:'Ändern',exact:true}).click();
 await page.locator('#loginEmail').waitFor();
 assert.equal(calls.filter(x=>x.startsWith('/api/state')).length,1);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(`PASS ${width}px direct-link forced-password workflow, change, logout, login form; no overflow/page errors`);
 await page.unrouteAll({behavior:'ignoreErrors'});await page.close();
}
}finally{await fixture.close();}
