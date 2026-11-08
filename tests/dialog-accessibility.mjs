import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Minimal DOM fixture exercising the actual shared controller's keyboard behavior.
const listeners={},nodes=[];let active,observer;
const root={children:nodes,get lastElementChild(){return nodes.at(-1)}};
const app={tagName:'DIV',inert:false,isConnected:true},startup={tagName:'SECTION',inert:false,isConnected:true};
function element(id,container=null){
 return {id,hidden:false,dataset:{},attrs:{},isConnected:true,
  setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},
  closest(){return container?.inert?container:null},getClientRects(){return [{}]},
  focus(){active=this;listeners.focusin?.({target:this})}
 };
}
const opener=element('opener');active=opener;
const document={body:{children:[app,startup,root]},get activeElement(){return active},getElementById:()=>root,querySelector:()=>opener,addEventListener:(name,callback)=>listeners[name]=callback};
const ctx=vm.createContext({document,Map,WeakMap,MutationObserver:class{constructor(callback){observer=callback}observe(){}}});ctx.window=ctx;
vm.runInContext(fs.readFileSync('assets/dialog-accessibility.js','utf8'),ctx);
function dialog(){
 const node={dataset:{},inert:false,isConnected:true,attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},contains(e){return [title,first,last,box].includes(e)},querySelector:s=>s==='.modal'?box:s==='[data-dialog-heading]'?title:null,querySelectorAll:()=>[first,last]};
 const title=element('',node),first=element('first'+nodes.length,node),last=element('last'+nodes.length,node);
 const box={...element('',node),querySelector:()=>title,querySelectorAll:()=>[title,first,last]};
 nodes.push(node);ctx.ecgDialogAccess.opened(node);return {node,title,first,last,box};
}
ctx.closeModal=()=>{const node=nodes.at(-1);if(!ctx.ecgDialogAccess.mayClose(node))return;nodes.pop();node.isConnected=false;ctx.ecgDialogAccess.closed(node)};
const key=(name,shiftKey=false)=>{let prevented=false;listeners.keydown({key:name,shiftKey,preventDefault(){prevented=true},stopPropagation(){}});return prevented};
let outer=dialog();assert.equal(outer.box.attrs.role,'dialog');assert.equal(outer.box.attrs['aria-modal'],'true');assert.equal(outer.box.attrs['aria-labelledby'],outer.title.id);assert(outer.title.id);assert.equal(active,outer.title);assert.equal(app.inert,true);assert.equal(startup.inert,true);
key('Tab');assert.equal(active,outer.first);outer.last.focus();assert.equal(key('Tab'),true);assert.equal(active,outer.first);assert.equal(key('Tab',true),true);assert.equal(active,outer.last);
outer.first.focus();const inner=dialog();assert.equal(outer.node.inert,true);assert.equal(outer.node.attrs['aria-hidden'],'true');assert.equal(inner.node.inert,false);
key('Escape');assert.equal(nodes.length,1);assert.equal(outer.node.inert,false);assert.equal(active,outer.first,'nested close restores opener');
// An async update of the lower layer must not steal focus from the active dialog.
const top=dialog();const before=active;ctx.ecgDialogAccess.opened(outer.node,true);assert.equal(active,before);key('Escape');
outer.node.dataset.passwordRequired='true';key('Escape');assert.equal(nodes.length,1,'mandatory password dialog cannot be dismissed');assert.equal(ctx.ecgDialogAccess.mayClose(outer.node),false);
outer.node.dataset.passwordRequired='false';key('Escape');assert.equal(nodes.length,0);assert.equal(active,opener);assert.equal(app.inert,false);assert.equal(startup.inert,false);
// Restore original inert state after direct account-clearing removal as well.
app.inert=true;dialog();nodes.length=0;observer();assert.equal(app.inert,true);assert.equal(startup.inert,false);
const html=fs.readFileSync('index.html','utf8');
for(const id of ['loginEmail','loginPassword','oldPw','newPw','legacyEmail','legacyOtp','legacyPassword','resetPw'])assert.match(html,new RegExp('<label for="'+id+'">'));
assert.match(html,/assets\/dialog-accessibility\.js/);
console.log('PASS: dialog name/semantics, focus entry, Tab/Shift-Tab trap, nested focus restoration, background inertness, forced-password Escape guard, asynchronous lower-layer update, account clear and auth labels. Synthetic DOM only.');
