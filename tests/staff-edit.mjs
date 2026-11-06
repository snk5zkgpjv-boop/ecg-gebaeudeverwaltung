import assert from 'node:assert/strict';
import {personnel} from '../lib/personnel.js';

const data={id:'12345678-1234-4321-8123-123456789012',revision:'42',name:' Beispiel ',duty:' Dienst ',employment:'Teilzeit',hourly:false};
async function patch({role='admin',body=data,outcome='success'}={}){
 let written=false;
 const sql=async(parts,...params)=>{
  const q=parts.join('?');
  if(q.includes('ecg_app_sessions'))return [{app_user_id:'user'}];
  if(q.includes('app_state'))return [{users:[{id:'user',role}]}];
  assert.match(q,/UPDATE ecg_staff.*WHERE id=\? AND xmin::text=\?/);
  assert.deepEqual(params,['Beispiel','Dienst','Teilzeit',false,false,null,null,null,data.id,data.revision]);
  written=true;
  if(outcome==='duplicate')throw Object.assign(Error(),{code:'23505'});
  return outcome==='stale'?[]:[{id:data.id}];
 };
 const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(){return this;}};
 await personnel({method:'PATCH',query:{personnel:'stamm'},headers:{cookie:'ecg_session=test','x-ecg-user-id':'user'},body},res,sql);
 return [res.code,written];
}
assert.deepEqual(await patch(),[200,true]);
assert.deepEqual(await patch({outcome:'duplicate'}),[409,true]);
assert.deepEqual(await patch({outcome:'stale'}),[409,true]);
assert.deepEqual(await patch({role:'deacon'}),[403,false]);
assert.deepEqual(await patch({body:{...data,id:'wrong'}}),[400,false]);
