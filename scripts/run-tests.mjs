import {readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const directory=resolve(root,args[0]||'tests');
const timeout=Number(args[1]||120000);
if(!Number.isFinite(timeout)||timeout<1)throw Error('Invalid test timeout');
// Tests must not inherit database URLs, API credentials or deployment secrets.
const allowed=['PATH','HOME','TMPDIR','TMP','TEMP','SystemRoot','WINDIR','LANG','LC_ALL','CI','PLAYWRIGHT_BROWSERS_PATH'];
const env=Object.fromEntries(allowed.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
env.TZ='UTC';
const files=readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith('.mjs')).map(entry=>entry.name).sort();
if(!files.length)throw Error('No test files found');
let passed=0;
for(const file of files){
 console.log(`TEST ${file}`);
 const result=spawnSync(process.execPath,[resolve(directory,file)],{cwd:root,env,stdio:'inherit',timeout,killSignal:'SIGKILL'});
 if(result.error||result.status!==0){
  console.error(`FAIL ${file}${result.error?.code?' ('+result.error.code+')':''}${result.signal?' ('+result.signal+')':''}`);
  process.exit(result.status||1);
 }
 passed++;
}
console.log(`PASS ${passed}/${files.length} test files`);
