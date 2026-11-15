import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validIban,validateBankAccount} from '../lib/finance-bank-account.js';

const valid=validateBankAccount({accountHolder:'Musterverein e.V.',bankAccount:'DE89 3704 0044 0532 0130 00',bankBic:'COBADEFFXXX',bankName:''});
assert.equal(valid.bankAccount,'DE89370400440532013000');
assert.equal(validIban('DE89 3704 0044 0532 0130 00'),true);
assert.equal(validIban('DE89 3704 0044 0532 0130 01'),false);
assert.throws(()=>validateBankAccount({...valid,bankBic:'invalid'}));
assert.throws(()=>validateBankAccount({...valid,bankAccount:'DE89370400440532013001'}));

const context=vm.createContext({});
vm.runInContext(readFileSync('assets/portal-areas.js','utf8'),context);
for(const role of ['member','admin','financeDeacon','deacon']){
 assert.equal(context.sectionAllowed('bankAccount',{role,permissions:{}}),true,role);
}
assert.equal(context.sectionAllowed('viewFinance',{role:'member',permissions:{}}),false,'member must not get finance pilot access');
const frontend=readFileSync('portal/portal.js','utf8');
assert.match(frontend,/finanzen\/kontodaten\.html/);
const api=readFileSync('api/state.js','utf8');
assert.match(api,/bankAccount===\s*'1'/);
console.log('PASS: ECG bank field validations, member display permission and finance pilot isolation');
