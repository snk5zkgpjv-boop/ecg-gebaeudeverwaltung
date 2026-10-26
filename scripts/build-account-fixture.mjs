// Generate an isolated browser harness from the actual application, not copied functions.
import fs from 'node:fs';
let html=fs.readFileSync('index.html','utf8');
const setup=`
const fixtureMemory=new Map();
const localStorage={get length(){return fixtureMemory.size},key:i=>[...fixtureMemory.keys()][i],getItem:k=>fixtureMemory.get(k)||null,setItem:(k,v)=>fixtureMemory.set(k,String(v)),removeItem:k=>fixtureMemory.delete(k)};
const fixtureUsers={a:{appUserId:'a',name:'Test Admin',email:'a@example.test',role:'admin',permissions:{}},b:{appUserId:'b',name:'Test Objektleitung',email:'b@example.test',role:'coordinator',permissions:{}}};
let fixtureCookie=null,fixtureDelay=null,fixtureFail=false,fixtureWrites=0;
const fixtureTimes=[{id:'a-time',userId:'a',start:'2026-10-20T08:00:00Z',end:'2026-10-20T10:00:00Z',workLabel:'PRIVATE-A',note:''},{id:'b-time',userId:'b',start:'2026-10-21T08:00:00Z',end:'2026-10-21T09:00:00Z',workLabel:'PRIVATE-B',note:''}];
const fixtureResponse=(body,status=200)=>({ok:status<400,status,json:async()=>structuredClone(body)});
const fetch=async(url,options={})=>{
 if(url==='/api/auth/login'){fixtureCookie=JSON.parse(options.body).email.startsWith('a')?'a':'b';return fixtureResponse({user:fixtureUsers[fixtureCookie]});}
 if(url==='/api/auth/logout'){fixtureCookie=null;return fixtureResponse({ok:true});}
 if(url==='/api/auth/session')return fixtureCookie?fixtureResponse({user:fixtureUsers[fixtureCookie]}):fixtureResponse({error:'Nicht angemeldet'},401);
 if(url==='/api/state'){
  if(!fixtureCookie)return fixtureResponse({error:'Nicht angemeldet'},401);
  if(options.headers?.['X-ECG-User-Id']!==fixtureCookie)return fixtureResponse({error:'Kontowechsel'},409);
  if(options.method){fixtureWrites++;return fixtureResponse({error:'Fixture blocks all state writes'},403);}
  if(fixtureFail)return fixtureResponse({error:'Simulierter Ladefehler'},503);
  const owner=fixtureCookie;
  const response=fixtureResponse({...structuredClone(initialState),settings:{cloudSync:true,calendarLastSync:new Date().toISOString()},users:[{...fixtureUsers[owner],id:owner}],timeEntries:fixtureTimes.filter(x=>x.userId===owner),myTimeSharing:false,myIssuePlanning:{},sharedTimeUsers:[]});
  if(fixtureDelay)await fixtureDelay;
  return response;
 }
 throw Error('Unexpected fixture request: '+url);
};
`;
html=html.replace(/<script type="module">[\s\S]*?<\/script>/,'');
html=html.replace('<head>','<head><base href="/"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'">');
html=html.replace('<script>const $',`<script>${setup}</script><script>const $`);
html=html.replace('});bootAuth();</script>','});</script>');
const run=`
const fixtureCheck=(condition,label)=>{if(!condition)throw Error(label);fixtureResults.push(label)};
let fixtureResults=[];
async function fixtureLogin(id){document.getElementById('loginEmail').value=id+'@example.test';document.getElementById('loginPassword').value='synthetic-only';await loginWithPassword();}
window.runAccountFixture=async()=>{
 const output=document.getElementById('fixture-result');fixtureResults=[];
 try{
  await bootAuth();fixtureCheck(!authSession&&document.getElementById('authGate'),'Start ohne Sitzung zeigt nur Anmeldung');
  await fixtureLogin('a');fixtureCheck(state.currentUserId==='a'&&state.currentRole==='admin','Serverprofil bestimmt Admin-Kennung und Rolle');
  await showTimeReport();fixtureCheck(document.getElementById('modalRoot').textContent.includes('PRIVATE-A')&&!document.getElementById('modalRoot').textContent.includes('PRIVATE-B'),'Admin sieht nur eigene private Buchungen');
  state.timeRunning={id:'timer-a',userId:'a',start:new Date().toISOString()};
  await signOutApp();fixtureCheck(!document.getElementById('app').textContent&&!document.getElementById('modalRoot').textContent,'Abmeldung leert Oberfläche und persönliche Dialoge');
  await fixtureLogin('b');fixtureCheck(state.currentRole==='coordinator'&&!can('manageUsers'),'Objektleitung erhält keine Admin-/Benutzerverwaltung');
  fixtureCheck(state.timeRunning===null&&fixtureMemory.has('ecgTimer:a'),'Timer bleibt beim ursprünglichen Konto');
  await showTimeReport();fixtureCheck(document.getElementById('modalRoot').textContent.includes('PRIVATE-B')&&!document.getElementById('modalRoot').textContent.includes('PRIVATE-A'),'Kontowechsel zeigt ausschließlich Zeiten der Objektleitung');
  let release;fixtureDelay=new Promise(r=>release=r);const late=pullCloud();await Promise.resolve();await Promise.resolve();
  await signOutApp();fixtureDelay=null;await fixtureLogin('a');release();await late;
  fixtureCheck(state.currentUserId==='a'&&state.timeEntries.every(x=>x.userId==='a'),'Verspätete Antwort des vorherigen Kontos wird verworfen');
  fixtureCheck(state.timeRunning?.id==='timer-a','Eigener laufender Timer wird wiederhergestellt');
  fixtureCookie='b';await pullCloud();fixtureCheck(!authSession&&document.getElementById('authGate'),'Gewechseltes Sitzungscookie sperrt den alten Tab');
  fixtureFail=true;await fixtureLogin('b');fixtureCheck(!authSession&&!document.getElementById('app').textContent,'Fehlgeschlagenes Laden lässt keine aktive Oberfläche zurück');fixtureFail=false;
  await fixtureLogin('b');window.dispatchEvent(new StorageEvent('storage',{key:'ecgAccountChanged',newValue:'test'}));
  fixtureCheck(!authSession&&!document.getElementById('app').textContent,'Kontowechselereignis eines anderen Tabs sperrt die Ansicht');
  fixtureCheck(fixtureWrites===0,'Keine Zeit-/Rechte-/Veranstaltungsdaten geschrieben');
  output.textContent='BESTANDEN: '+fixtureResults.length+' Browserprüfungen. '+fixtureResults.join(' · ');
 }catch(error){output.textContent='FEHLER: '+error.message+' (nach '+fixtureResults.length+' Prüfungen)';console.error(error);}
};
`;
html=html.replace('</body>',`<section style="position:relative;z-index:2000;background:white;padding:20px"><h1>Isolierter Kontowechseltest</h1><p>Original-Oberfläche, simulierte Sitzung/API und flüchtiger Speicher. CSP blockiert sämtliche Netzwerk-API-Aufrufe. Kein Zugriff auf Betriebsdaten.</p><button onclick="runAccountFixture()">Kontowechsel prüfen</button><p id="fixture-result" role="status">Bereit</p></section><script>${run}</script></body>`);
fs.writeFileSync('tests/account-isolation-browser.html',html);
console.log('Generated isolated browser fixture from index.html');
