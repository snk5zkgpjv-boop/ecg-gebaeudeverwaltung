import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const server=await fs.readFile(new URL('../api/state.js',import.meta.url),'utf8');
const frontend=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const start=server.indexOf("  if (req.method === 'GET' && req.query?.issuePhoto != null) {");
const end=server.indexOf("  if(req.method==='GET' && req.query?.organizationExport==='1')",start);
assert.ok(start>=0&&end>start,'isolated media route must exist');
const source=server.slice(start,end);
const handle=new Function('req','res','sql','requireUser','has','Buffer',`return (async()=>{ ${source} return 'missing'; })()`);
const response=()=>({
  statusCode:200,
  headers:{},
  setHeader(key,value){this.headers[key]=value;},
  status(code){this.statusCode=code;return this;},
  json(body){this.body=body;return this;},
  send(body){this.body=body;return this;}
});
const syntheticPhoto='data:image/jpeg;base64,YWJj';
const sql=async (parts,...values)=>{
  assert.equal(values[0],'issue_fixture');
  return [{photo:syntheticPhoto}];
};
let r=response();
await handle({method:'GET',query:{issuePhoto:'issue_fixture'}},r,sql,async()=>({profile:{role:'admin'}}),()=>true,Buffer);
assert.equal(r.statusCode,200);
assert.equal(r.headers['Content-Type'],'image/jpeg');
assert.equal(r.headers['Cache-Control'],'private, no-store');
assert.equal(Buffer.from(r.body).toString(),'abc');
r=response();
await handle({method:'GET',query:{issuePhoto:'issue_fixture'}},r,sql,async()=>null,()=>true,Buffer);
assert.equal(r.body,undefined,'unauthenticated requests must not reveal photo');
r=response();
await handle({method:'GET',query:{issuePhoto:'issue_fixture'}},r,sql,async()=>({profile:{role:'financeDeacon'}}),()=>false,Buffer);
assert.equal(r.statusCode,403);
r=response();
await handle({method:'GET',query:{issuePhoto:'../bad'}},r,sql,async()=>({profile:{role:'admin'}}),()=>true,Buffer);
assert.equal(r.statusCode,400);
assert.match(server,/output\.issues\s*=\s*\(state\.issues\s*\|\|\s*\[\]\)\.map/);
assert.match(server,/hasPhoto:true/);
assert.match(server,/const originals=new Map/);
assert.equal((frontend.match(/\?issuePhoto=\$\{encodeURIComponent\(i\.id\)\}/g)||[]).length,3);
assert.doesNotMatch(frontend,/\$\{i\.photo\?\`<img class="photo" src="\$\{i\.photo\}">/);
console.log('PASS: issue media endpoint requires authorization, isolates photo bytes, enforces MIME and no-store, and frontend uses lazy image URLs. Synthetic data only.');
