import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();
const {browser,origin}=fixture;
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[],writes=[];
  page.on('pageerror',err=>errors.push(err.message));
  let admin=false;
  const bank={accountHolder:'Musterverein e.V.',bankAccount:'DE89370400440532013000',bankBic:'COBADEFFXXX',bankName:''};
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==origin)return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();
   if(u.pathname==='/api/state'&&u.searchParams.get('bankAccount')==='1'){
    if(route.request().method()==='PATCH'){
      writes.push(route.request().postDataJSON());
      if(!admin)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Forbidden'})});
      Object.assign(bank,writes.at(-1).bank);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,bank,revision:4})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({bank,canEdit:admin,revision:3})});
   }
   throw Error('Unexpected API '+u.pathname);
  });
  await page.goto(origin+'/finanzen/kontodaten.html');
  await page.waitForFunction(()=>document.querySelector('#iban')?.textContent.includes('DE89'));
  assert.equal(await page.locator('#editor').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  admin=true;await page.goto(origin+'/finanzen/kontodaten.html');
  await page.locator('#editor').waitFor({state:'visible'});
  await page.locator('#edit-name').fill('Musterbank');
  await page.getByRole('button',{name:'Änderungen speichern'}).click();
  await page.getByText('Kontodaten gespeichert.').waitFor();
  assert.equal(writes.length,1);
  assert.equal(writes[0].revision,3);
  assert.equal(writes[0].bank.bankName,'Musterbank');
  assert.deepEqual(errors,[]);
  console.log('PASS '+width+'px ECG account: member reads only, admin edit, revision, no overflow');
  await page.close();
 }
}finally{await fixture.close();}
