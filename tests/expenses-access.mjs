import test from 'node:test';
import assert from 'node:assert/strict';
import {validateItems,publicClaim,moneyCents,validIban} from '../lib/expenses-access.js';

test('validates normal expense items and integer cents',()=>{
 const result=validateItems([{date:'2026-11-15',description:' Papier ',project:'Gebäudepflege',cents:1234}]);
 assert.deepEqual(result,[{date:'2026-11-15',description:'Papier',project:'Gebäudepflege',cents:1234}]);
});
test('rejects invalid amounts and oversized rows',()=>{
 for(const cents of [0,-1,1.5,NaN,100000001]) assert.throws(()=>moneyCents(cents));
 assert.throws(()=>validateItems([]));
 assert.throws(()=>validateItems([{date:'15.11.2026',description:'Test',project:'',cents:500}]));
 assert.throws(()=>validateItems([{date:'2026-11-15',description:'',project:'',cents:500}]));
});
test('does not expose bank details to personal list',()=>{
 const row={id:'example',bank_iban:'DE1234',bank_owner:'Test',total_cents:100};
 assert.deepEqual(publicClaim(row),{id:'example',total_cents:100});
 assert.equal(publicClaim(row,true).bank_iban,'DE1234');
});
test('IBAN checksum rejects altered digits, accepts valid German example',()=>{
 assert.equal(validIban('DE89 3704 0044 0532 0130 00'),true);
 assert.equal(validIban('DE89 3704 0044 0532 0130 01'),false);
 assert.equal(validIban('DE8937040044053201300'),false);
});
test('rejects impossible calendar day',()=>{
 assert.throws(()=>validateItems([{date:'2026-02-30',description:'Test',project:'',cents:100}]));
});
