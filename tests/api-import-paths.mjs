import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const api=resolve(root,'api');
async function list(directory){
 const entries=await readdir(directory,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  const path=join(directory,entry.name);
  if(entry.isDirectory())files.push(...await list(path));
  else if(entry.isFile()&&entry.name.endsWith('.js'))files.push(path);
 }
 return files;
}
const endpoints=await list(api);
assert.ok(endpoints.length>0 && endpoints.length<=12,
  'Vercel API file budget exceeded or no routes discovered');
assert.equal(endpoints.some(path=>path.endsWith('/auth/migrate.js')),false,
  'Legacy migration route must not exist');
for(const path of endpoints){
 const module=await import(pathToFileURL(path).href);
 assert.equal(typeof module.default,'function',
   'API endpoint is not importable as a handler: '+path);
}
console.log('PASS: '+endpoints.length+' real API handler modules import successfully, old migration route removed. Synthetic checks only.');
