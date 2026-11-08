// Reuse the loaded work screen, but authorize and refresh every destination.
// No cached private state is shown while a request is pending or has failed.
let workNavigationPending=false;
let workNavigationRequest=null;
let workNavigationUrl=location.pathname+location.search;

function cancelWorkNavigation(){
 workNavigationRequest?.abort();workNavigationRequest=null;workNavigationPending=false;
 const app=document.getElementById('app');
 if(app){app.inert=false;app.removeAttribute('aria-busy');}
}
async function readAppResponse(url,options={},timeoutMs=12000){
 const controller=new AbortController();
 const upstream=options.signal;
 const abort=()=>controller.abort();
 if(upstream?.aborted)controller.abort();
 upstream?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  const body=await response.json();
  return {ok:response.ok,status:response.status,json:async()=>body};
 }finally{clearTimeout(timer);upstream?.removeEventListener('abort',abort);}
}
function workNavigationSections(user){
 return Object.entries(areaSections).filter(([parent])=>['building','administration','events','kitchen'].includes(parent))
  .map(([parent,[name,items]])=>({parent,name,items:items.filter(([id,,right])=>id!=='wochenplan' && right!=='planned' && sectionAllowed(right,user))}))
  .filter(group=>group.items.length);
}
function workSectionSelector(section){
 const groups=workNavigationSections(currentUser()||authSession?.user||{});
 return `<label class="work-section-switch" for="workSectionSelect">Bereich wechseln<select id="workSectionSelect" onchange="switchWorkSection(this.value)">${groups.map(group=>`<optgroup label="${esc(group.name)}">${group.items.map(([id,title])=>`<option value="${esc(id)}"${id===section.id?' selected':''}>${esc(title)}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
}
function workLoadingView(title,message,button=''){
 document.getElementById('app').innerHTML=`<main class="shell"><section class="card work-loading"><h1>${esc(title)}</h1><p role="status">${esc(message)}</p>${button}<a class="btn" href="/portal/">Meine Bereiche</a></section></main>`;
}
function showStartupFailure(){
 workNavigationPending=true;
 workLoadingView('Bereich konnte nicht geöffnet werden','Die Daten konnten nicht geladen werden. Bitte prüfe die Verbindung und versuche es erneut.','<button class="btn primary" onclick="retryAppStart()">Erneut versuchen</button>');
}
window.retryAppStart=async()=>{workNavigationPending=false;await bootAuth();};
window.switchWorkSection=async(id,{fromHistory=false}={})=>{
 const session=authSession;let acceptedSession=session;
 const previousUrl=workNavigationUrl;
 if(!session)return showLoginGate('Bitte erneut anmelden.');
 const target=workNavigationSections(currentUser()||session.user).flatMap(group=>group.items).find(([key])=>key===id);
 if(!target){if(fromHistory)history.replaceState(null,'',workNavigationUrl);return;}
 const dialogs=document.getElementById('modalRoot');
 if(dialogs?.childElementCount){
  if(fromHistory)history.replaceState(null,'',workNavigationUrl);
  return; // Finish or explicitly close the current form before changing sections.
 }
 const destination='/?bereich='+encodeURIComponent(id);
 workNavigationRequest?.abort();
 const request=new AbortController();workNavigationRequest=request;
 clearTimeout(syncTimer);
 const app=document.getElementById('app');
 app.inert=true;app.setAttribute('aria-busy','true');
 workNavigationPending=true;
 // Preserve the existing optimistic-conflict checks before replacing the view.
 if(state.settings.cloudSync && cloudBase && !await syncCloud((url,options)=>readAppResponse(url,{...options,signal:request.signal}))){
  if(workNavigationRequest===request){
   workNavigationPending=false;app.inert=false;app.removeAttribute('aria-busy');
   if(fromHistory)history.replaceState(null,'',workNavigationUrl);
  }
  return;
 }
 if(request.signal.aborted || authSession!==session){
  if(workNavigationRequest===request){workNavigationPending=false;app.inert=false;app.removeAttribute('aria-busy');}
  return;
 }
 app.inert=false;app.removeAttribute('aria-busy');
 const epoch=timeChangeEpoch,issueEpoch=issueChangeEpoch;
 workNavigationPending=true;
 document.getElementById('modalRoot')?.replaceChildren();
 workLoadingView(target[1],'Aktuelle Daten werden geladen …');
 try{
  const response=await readAppResponse(id==='benutzer'?'/api/state?entry=1&section=administration':'/api/state?entry=1',{
   cache:'no-store',signal:request.signal,headers:{'X-ECG-User-Id':session.user.appUserId}
  });
  if(request.signal.aborted || authSession!==session)return;
  if([401,403,409].includes(response.status)){workNavigationPending=false;return showLoginGate('Dein Zugang wurde geändert. Bitte erneut anmelden.');}
  if(!response.ok)throw Error('load');
  const entry=await response.json();
  if(entry.user?.appUserId!==session.user.appUserId || !entry.state?.version){workNavigationPending=false;return showLoginGate('Das Konto konnte nicht eindeutig geprüft werden. Bitte erneut anmelden.');}
  if(entry.user.mustChangePassword){workNavigationPending=false;return showLoginGate('Bitte anmelden und das vorläufige Kennwort ändern.');}
  if(!sectionAllowed(target[2],entry.user)){workNavigationPending=false;return showLoginGate('Dieser Bereich ist für dein Konto nicht mehr freigegeben.');}
  authSession={user:entry.user};acceptedSession=authSession;bindAuthUser();
  state.activeTab=['termine','kalender'].includes(id)?'calendar':id==='benutzer'?'administration':'building';
  state.settings.cloudSync=true;
  if(!fromHistory)history.pushState({ecgWork:true},'',destination);
  workNavigationUrl=location.pathname+location.search;
  workNavigationPending=false;
  acceptCloudState(entry.state,authSession,epoch,issueEpoch);
  document.querySelector('main h2')?.setAttribute('tabindex','-1');
  document.querySelector('main h2')?.focus();
  if(!['termine','kalender'].includes(id))scrollTo(0,0);
  if(['termine','kalender','kuechendienst'].includes(id))void maybeSyncGoogleCalendar();
 }catch{
  if(request.signal.aborted || authSession!==acceptedSession)return;
  workNavigationPending=true;
  history.replaceState(null,'',previousUrl);workNavigationUrl=previousUrl;
  workLoadingView(target[1],'Der Bereich konnte nicht geladen werden. Bitte prüfe die Verbindung und versuche es erneut.',`<button class="btn primary" onclick="switchWorkSection('${esc(id)}')">Erneut versuchen</button>`);
 }finally{if(workNavigationRequest===request)workNavigationRequest=null;}
};
window.addEventListener('popstate',()=>{
 const id=new URLSearchParams(location.search).get('bereich');
 if(id)void switchWorkSection(id,{fromHistory:true});
 else location.reload();
});
