// Shared focus behavior for the existing stacked dialog API.
(function(){
 const root=document.getElementById('modalRoot');
 if(!root)return;
 const records=new WeakMap();let serial=0,background=null;
 const top=()=>root.lastElementChild;
 const focusables=node=>[...node.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element=>!element.hidden&&!element.closest('[inert]')&&element.getClientRects().length>0);
 function focusStart(node){
  const heading=node.querySelector('[data-dialog-heading]');
  (heading||focusables(node)[0]||node.querySelector('.modal'))?.focus();
 }
 function syncLayers(){
  const active=top();
  if(active&&!background){
   background=new Map();
   for(const element of document.body.children){
    if(element===root||['SCRIPT','STYLE','LINK'].includes(element.tagName))continue;
    background.set(element,element.inert);element.inert=true;
   }
  }
  for(const node of root.children){
   node.inert=node!==active;
   if(node===active)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden','true');
   node.querySelector('.modal')?.setAttribute('aria-modal',String(node===active));
  }
  if(!active&&background){for(const [element,previous] of background)if(element.isConnected)element.inert=previous;background=null;}
 }
 function opened(node,update=false){
  const box=node.querySelector('.modal');
  if(!box)return;
  if(!records.has(node))records.set(node,{opener:document.activeElement,lastId:null});
  const record=records.get(node);
  box.setAttribute('role','dialog');box.setAttribute('tabindex','-1');
  const title=box.querySelector('h1,h2,h3');
  if(title){
   if(!title.id)title.id='ecg-dialog-title-'+(++serial);
   title.tabIndex=-1;title.dataset.dialogHeading='true';
   box.setAttribute('aria-labelledby',title.id);box.removeAttribute('aria-label');
  }else{box.setAttribute('aria-label','Dialog');box.removeAttribute('aria-labelledby');}
  syncLayers();
  if(node!==top())return;
  const previous=update&&record.lastId?[...box.querySelectorAll('[id]')].find(element=>element.id===record.lastId):null;
  if(previous)previous.focus();else focusStart(node);
 }
 function closed(node){
  const opener=records.get(node)?.opener;
  syncLayers();
  const active=top();
  if(opener?.isConnected&&(!active||active.contains(opener))&&!opener.closest('[inert]'))opener.focus();
  else if(active)focusStart(active);
  else document.querySelector('#loginEmail,#app button,#app a')?.focus();
 }
 window.ecgDialogAccess={opened,closed,mayClose:node=>node?.dataset.passwordRequired!=='true'};
 document.addEventListener('keydown',event=>{
  const active=top();if(!active)return;
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();
   if(window.ecgDialogAccess.mayClose(active))window.closeModal();
  }
  if(event.key==='Tab'){
   const items=focusables(active),first=items[0],last=items.at(-1),focused=document.activeElement;
   if(!first){event.preventDefault();focusStart(active);return;}
   if(event.shiftKey&&(focused===first||!items.includes(focused))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(focused===last||!items.includes(focused))){event.preventDefault();first.focus();}
  }
 },true);
 document.addEventListener('focusin',event=>{
  const active=top();if(!active)return;
  if(!active.contains(event.target)){focusStart(active);return;}
  const record=records.get(active);if(record)record.lastId=event.target.id||null;
 });
 // Account clearing also removes dialogs outside closeModal(). Restore inert state.
 new MutationObserver(syncLayers).observe(root,{childList:true});
})();
