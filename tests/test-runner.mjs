import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'ecg-runner-'));
const runner=resolve('scripts/run-tests.mjs');
try{
 writeFileSync(join(directory,'a.mjs'),"import assert from 'node:assert/strict'; assert.equal(process.env.ECG_SYNTHETIC_SECRET,undefined); assert.equal(process.env.DATABASE_URL,undefined); console.log('first');");
 writeFileSync(join(directory,'b.mjs'),"console.log('second');");
 let result=spawnSync(process.execPath,[runner,directory],{encoding:'utf8',env:{...process.env,ECG_SYNTHETIC_SECRET:'synthetic-only',DATABASE_URL:'synthetic-only'}});
 assert.equal(result.status,0,result.stderr);assert(result.stdout.indexOf('first')<result.stdout.indexOf('second'));assert.match(result.stdout,/PASS 2\/2/);
 writeFileSync(join(directory,'a.mjs'),"throw Error('expected synthetic failure');");
 writeFileSync(join(directory,'b.mjs'),"import {writeFileSync} from 'node:fs';writeFileSync("+JSON.stringify(join(directory,'must-not-run'))+",'bad');");
 result=spawnSync(process.execPath,[runner,directory],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(existsSync(join(directory,'must-not-run')),false);assert.match(result.stderr,/FAIL a.mjs/);
 writeFileSync(join(directory,'a.mjs'),"setInterval(()=>{},1000);");
 result=spawnSync(process.execPath,[runner,directory,'100'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/ETIMEDOUT/);assert.equal(existsSync(join(directory,'must-not-run')),false);
 console.log('PASS: test discovery/order, secret-free child environment, failure propagation, stop-on-failure and timeout. Temporary synthetic fixtures only.');
}finally{rmSync(directory,{recursive:true,force:true});}
