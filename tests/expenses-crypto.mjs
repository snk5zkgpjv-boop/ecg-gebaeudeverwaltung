import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptBytes,decryptBytes,encryptText,decryptText,financeCryptoReady} from '../lib/expenses-crypto.js';
test('fails closed without a finance encryption key',()=>{
 delete process.env.ECG_EXPENSES_DATA_KEY;
 assert.equal(financeCryptoReady(),false);
 assert.throws(()=>encryptText('DE89370400440532013000'),/Verschlüsselung/);
});
test('AES-GCM bank details and receipt roundtrip with tampering rejected',()=>{
 process.env.ECG_EXPENSES_DATA_KEY=randomBytes(32).toString('base64');
 assert.equal(financeCryptoReady(),true);
 const text='DE89370400440532013000';
 const sealed=encryptText(text);
 assert.notEqual(sealed,text);
 assert.equal(decryptText(sealed),text);
 const pdf=Buffer.from('%PDF-1.4\nsynthetic\n%%EOF');
 const encrypted=encryptBytes(pdf);
 assert.notDeepEqual(encrypted,pdf);
 assert.deepEqual(decryptBytes(encrypted),pdf);
 encrypted[encrypted.length-1]^=1;
 assert.throws(()=>decryptBytes(encrypted));
 delete process.env.ECG_EXPENSES_DATA_KEY;
});
