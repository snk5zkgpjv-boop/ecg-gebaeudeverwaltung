import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../api/calendar-event.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export default ','');
let profile={id:'ecg-user-a',name:'ECG Test A',role:'admin',permissions:{}};
let inserted=null, writeEnabled='true';
let calls=0;
const context=vm.createContext({
  URL,Date,AbortSignal,console:{error(){}},
  process:{env:{DATABASE_URL:'synthetic',GOOGLE_CALENDAR_ID:'ecg-synthetic',GOOGLE_SERVICE_ACCOUNT_JSON:'configured',GOOGLE_CALENDAR_WRITE_ENABLED:writeEnabled}},
  neon:()=>async()=>[{rooms:[{id:'raum-1',name:'Freizeitraum',calendarAliases:['Freizeit Raum']}]}],
  requireUser:async()=>({profile,user:{name:'Account Test'}}),
  serviceAccountAccessToken:async()=> 'synthetic-access',
  fetch:async(_url,options)=>{
    calls++;
    if(options.method==='POST') {
      inserted=JSON.parse(options.body);
      return {ok:true,json:async()=>({id:'google-123'})};
    }
    return {ok:true,json:async()=>({items:[]})};
  }
});
vm.runInContext(source,context);
const response=()=>({code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}});
const request={method:'POST',body:{title:'Testtermin',start:'2026-11-20T16:00:00+01:00',end:'2026-11-20T17:00:00+01:00',roomId:'raum-1',ecgCreatedByName:'Spoofed',ecgCreatedById:'spoof'}};
let res=response();
await context.handler(request,res);
assert.equal(res.code,201);
assert.equal(inserted.extendedProperties.private.ecgCreatedById,'ecg-user-a');
assert.equal(inserted.extendedProperties.private.ecgCreatedByName,'ECG Test A');
assert.equal(inserted.extendedProperties.private.ecgRoomId,'raum-1');
assert.notEqual(inserted.extendedProperties.private.ecgCreatedByName,'Spoofed');
assert.ok(Number.isFinite(Date.parse(inserted.extendedProperties.private.ecgCreatedAt)));

profile={id:'cleaner-id',name:'Testkraft',role:'cleaner',permissions:{}};
inserted=null;
res=response();await context.handler(request,res);
assert.equal(res.code,403);
assert.equal(inserted,null);
context.process.env.GOOGLE_CALENDAR_WRITE_ENABLED='false';
profile={id:'ecg-user-a',name:'ECG Test A',role:'admin',permissions:{}};
res=response();await context.handler(request,res);
assert.equal(res.code,503);
assert.equal(inserted,null);
assert.equal(calls,2,'only authenticated authorized write-enabled call reaches Google');
console.log('PASS: authenticated ECG creator, spoof protection, role denial and disabled Google write. Synthetic only.');
