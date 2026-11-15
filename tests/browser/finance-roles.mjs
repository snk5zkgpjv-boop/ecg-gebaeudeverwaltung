import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';
const fixture=await browserFixture();const {browser,origin}=fixture;
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],actions=[];
  const user={id:'finance-test',appUserId:'finance-test',name:'Synthetic Finance',role:'financeDeacon',permissions:{viewFinance:true},mustChangePassword:false};
  let claims=[
   {id:'00000000-0000-4000-8000-000000000001',applicant_id:'member-a',applicant_name:'Synthetic Applicant',items:[{date:'2026-11-15',description:'Papier',project:'Kinderstunde',cents:1500}],reimbursement_type:'refund',total_cents:1500,status:'submitted',created_at:'2026-11-15T09:00:00Z',receipts:[],history:[]},
   {id:'00000000-0000-4000-8000-000000000002',applicant_id:'finance-test',applicant_name:'Own Synthetic Claim',items:[{date:'2026-11-15',description:'Seife',project:'Gebäude',cents:150}],reimbursement_type:'refund',total_cents:150,status:'submitted',created_at:'2026-11-15T09:00:00Z',receipts:[],history:[]}
  ];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/api/auth/session')return json(200,{user});
   if(url.pathname==='/api/state'&&url.searchParams.get('expenses')==='1'){
    if(route.request().method()==='POST'){
     const body=route.request().postDataJSON();actions.push(body);
     const c=claims.find(x=>x.id===body.id);
     if(!c||c.applicant_id===user.appUserId)return json(403,{error:'Keine Berechtigung'});
     if(body.action==='approve'){c.status='approved';c.reviewer_id=user.appUserId}
     return json(200,{ok:true});
    }
    return json(200,{claims:url.searchParams.get('scope')==='team'?claims:[]});
   }
   throw Error('Unexpected API: '+url);
  });
  await page.goto(origin+'/finanzen/erfassung.html');
  await page.locator('#team .claim-card').first().waitFor();
  assert.equal(await page.locator('#finance').isVisible(),true);
  assert.equal(await page.locator('#team .claim-card').count(),2);
  const other=page.locator('#team .claim-card').first(),own=page.locator('#team .claim-card').nth(1);
  assert.equal(await other.getByRole('button',{name:'Freigeben'}).count(),1);
  assert.equal(await own.getByRole('button',{name:'Freigeben'}).count(),0);
  await other.getByRole('button',{name:'Freigeben'}).click();
  await page.locator('#team .claim-card').first().getByRole('button',{name:'Auszahlung dokumentieren'}).waitFor({state:'hidden'}); // approver cannot mark their own approval paid
  assert.deepEqual(actions.map(x=>x.action),['approve']);
  assert.equal(actions[0].id,claims[0].id);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS '+width+'px financeDeacon team, approve allowed foreign claim, self-approval and same-approver payout hidden');
  await page.close();
 }
}finally{await fixture.close();}
