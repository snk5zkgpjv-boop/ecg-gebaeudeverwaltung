import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { maintenanceDocuments, validateDocument, MAX_PDF_BYTES } from '../lib/maintenance-documents.js';

const pdf=Buffer.from('%PDF-1.7\nsynthetic test\n%%EOF\n'), base64=pdf.toString('base64');
const upload={title:'Bedienungsanleitung',filename:'gerät.pdf',base64};
assert.equal(validateDocument(upload).size,pdf.length);
for(const bad of [{...upload,title:''},{...upload,filename:'a.html'},{...upload,base64:'!invalid'},{...upload,base64:Buffer.from('<html>evil</html>').toString('base64')},{...upload,base64:Buffer.alloc(MAX_PDF_BYTES+1).toString('base64')}])assert.throws(()=>validateDocument(bad));
assert.equal(validateDocument({...upload,filename:'../a.pdf'}).filename,'.._a.pdf');
const records=[];
let calls=0;
const sql=async(strings,...values)=>{
 calls++;const query=strings.join('?');
 if(query.includes('CREATE TABLE'))return [];
 if(query.includes('INSERT INTO')){
  const [asset_id,title,filename,size,sha256,pdf_base64,created_by]=values;
  let item=records.find(d=>d.asset_id===asset_id&&d.sha256===sha256);
  if(item)Object.assign(item,{title,filename,removed_at:null});
  else{item={id:'doc-1',asset_id,title,filename,size,sha256,pdf_base64,created_by,created_at:'2026-10-07'};records.push(item);}
  const {pdf_base64:bytes,created_by:creator,asset_id:asset,...meta}=item;return [meta];
 }
 if(query.includes('UPDATE')){const [user,id,asset]=values,item=records.find(d=>d.id===id&&d.asset_id===asset);if(!item)return [];item.removed_at='now';item.removed_by=user;return[{id}];}
 if(query.includes('SELECT filename'))return records.filter(d=>d.id===values[0]&&d.asset_id===values[1]&&!d.removed_at).map(d=>({filename:d.filename,pdf_base64:d.pdf_base64}));
 if(query.includes('SELECT id,title'))return records.filter(d=>d.asset_id===values[0]&&!d.removed_at).map(({id,title,filename,size,sha256,created_at})=>({id,title,filename,size,sha256,created_at}));
 throw new Error('Unexpected query: '+query);
};
const state={maintenanceAssets:[{id:'asset-a'},{id:'asset-b'}]},has=(p,key)=>p.role==='admin'||p.permissions?.[key]===true;
async function call(method,body,query={},profile={id:'admin',role:'admin'},headers={'content-type':'application/json'}){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;}};
 await maintenanceDocuments({method,body,query:{assetId:'asset-a',...query},headers},res,sql,{state,profile},has);return res;
}
assert.equal((await call('POST',upload)).code,200);
assert.equal((await call('POST',upload)).code,200);assert.equal(records.length,1,'idempotent retry');
let result=await call('GET');assert.equal(result.data.documents.length,1);assert.ok(!JSON.stringify(result.data).includes(base64),'list excludes bytes');
result=await call('GET',null,{documentId:'doc-1'});assert.deepEqual(result.data,pdf);assert.equal(result.headers['Content-Type'],'application/pdf');assert.match(result.headers['Content-Security-Policy'],/sandbox/);assert.equal(result.headers['Cache-Control'],'private, no-store');
assert.equal((await call('GET',null,{documentId:'doc-1',assetId:'asset-b'})).code,404);
assert.equal((await call('POST',upload,{assetId:'missing'})).code,404);
const before=calls;
assert.equal((await call('GET',null,{}, {id:'cleaner',role:'cleaner'})).code,403);
assert.equal((await call('POST',upload,{}, {id:'viewer',role:'cleaner',permissions:{viewMaintenance:true}})).code,403);
assert.equal(calls,before,'denied before database access');
assert.equal((await call('POST',upload,{},undefined,{'content-type':'text/plain'})).code,415);
assert.equal((await call('GET',null,{}, {id:'viewer',role:'cleaner',permissions:{viewMaintenance:true}})).code,200);
assert.equal((await call('PATCH',{removeId:'doc-1'},{assetId:'asset-b'})).code,404);
assert.equal((await call('PATCH',{removeId:'doc-1'})).code,200);assert.equal(records[0].pdf_base64,base64,'soft removal retains bytes');
assert.equal((await call('GET')).data.documents.length,0);
assert.equal((await call('GET',null,{documentId:'doc-1'})).code,404);
await call('POST',upload);assert.equal(records.length,1);assert.equal((await call('GET')).data.documents.length,1,'reupload restores');
assert.equal((await call('PUT')).code,405);
const source=fs.readFileSync('api/state.js','utf8');assert.match(source,/requireUser[\s\S]*maintenanceDocuments\(req, res, sql, auth, has\)/);
const html=fs.readFileSync('index.html','utf8');assert.match(html,/maintenance-documents\.js\?v=1/);
const ui=fs.readFileSync('assets/maintenance-documents.js','utf8');new vm.Script(ui);
assert.ok(!/localStorage|save\(\)/.test(ui.replace(/^\/\/.*$/gm,'')),'no PDF in device cache/state PUT');
assert.match(ui,/owner === state.currentUserId/);assert.match(ui,/section.isConnected/);assert.match(ui,/upload.disabled=true/);
console.log('Maintenance PDF validation, access, idempotency, isolation, soft-removal/restore, private binary download and UI guards passed.');
