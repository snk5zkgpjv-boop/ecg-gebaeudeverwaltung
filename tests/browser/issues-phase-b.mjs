import assert from 'node:assert/strict';
import {browserFixture} from './helpers/fixture.js';

// Browser-level regression of the real UI. API responses are synthetic; the
// server-side handler and database behavior are covered in issues-phase-b.mjs.
const fixture=await browserFixture();
const {browser,origin}=fixture;
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[],requests=[];
  const user={id:'synthetic',appUserId:'synthetic',role:'admin',name:'Synthetic',permissions:{manageIssues:true},mustChangePassword:false};
  let dbState;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const json=(status,body)=>route.fulfill({status,contentType:'application/json',
      headers:{'X-ECG-Issues-Source':'tables'},body:JSON.stringify(body)});
   if(url.pathname==='/api/auth/session')return json(200,{user});
   if(url.pathname==='/api/state'){
    if(!dbState){
      dbState=await page.evaluate(()=>{
        const sample=structuredClone(initialState);
        for(const key in sample)if(Array.isArray(sample[key]))sample[key]=[];
        sample.settings={cloudSync:true};
        return sample;
      });
      dbState.users=[{id:'synthetic',name:'Synthetic',role:'admin',active:true,permissions:{manageIssues:true}}];
      dbState.rooms=[{id:'room-test',name:'Synthetic Room',floor:'EG',type:'room',tasks:[]}];
    }
    const method=route.request().method(),body=method==='GET'?null:route.request().postDataJSON();
    if(method==='PATCH'&&body.createIssue){
      const issue={...body.createIssue,created:'2026-11-17T10:00:00Z',createdBy:'synthetic',status:'open'};
      dbState.issues=[issue,...dbState.issues];requests.push({method,body});
      return json(200,{ok:true,issue});
    }
    if(method==='PATCH'&&body.updateIssue){
      const {id,changes}=body.updateIssue;
      const issue=dbState.issues.find(item=>item.id===id);
      if(!issue)return json(404,{error:'Missing issue'});
      Object.assign(issue,changes,{completedAt:changes.status==='done'?'2026-11-17T10:15:00Z':null});
      requests.push({method,body,bytes:Buffer.byteLength(JSON.stringify(body))});
      return json(200,{ok:true,issue});
    }
    if(method==='PUT'){
      requests.push({method,body});
      assert.equal(Object.hasOwn(body.changes,'issues'),false,'legacy full issue PUT not allowed');
      for(const [field,edit] of Object.entries(body.changes))dbState[field]=edit.after;
      return json(200,{ok:true});
    }
    if(method!=='GET')throw Error('Unexpected issue API action '+JSON.stringify(body));
    return json(200,url.searchParams.has('entry')?{user,state:structuredClone(dbState)}:structuredClone(dbState));
   }
   if(url.pathname==='/api/calendar')return json(200,{events:[],syncedAt:new Date().toISOString()});
   throw Error('Unexpected API '+url.pathname);
  });
  await page.goto(origin+'/?bereich=pflege');
  await page.waitForFunction(()=>state?.currentUserId==='synthetic'&&issuesTableMode===true);
  await page.evaluate(()=>window.addIssue());
  await page.locator('#isText').fill('Synthetic persistent issue');
  await page.evaluate(()=>window.saveIssue());
  await page.waitForFunction(()=>state.issues.some(item=>item.text==='Synthetic persistent issue'));
  const id=await page.evaluate(()=>state.issues.find(item=>item.text==='Synthetic persistent issue').id);
  await page.evaluate(id=>window.markIssueDone(id),id);
  await page.waitForFunction(id=>state.issues.find(item=>item.id===id)?.status==='done',id);
  const edits=requests.filter(item=>item.body?.updateIssue);
  assert.equal(edits.length,1);
  assert.ok(edits[0].bytes<10000,'status update must stay below 10 KB');
  await page.reload();
  await page.waitForFunction(id=>state?.issues?.find(item=>item.id===id)?.status==='done'&&issuesTableMode,id);
  assert.equal(await page.evaluate(id=>state.issues.find(item=>item.id===id)?.status,id),'done');
  assert.deepEqual(errors,[],errors.join('\n'));
  console.log('PASS '+width+'px: create issue, small row PATCH for done, reload preserves table-backed state');
  await page.close();
 }
}finally{await fixture.close()}
