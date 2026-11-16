import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/<section id="startup" hidden\b/);
const start=html.indexOf("  <script>\n  (function(){\n    const startup=document.getElementById('startup');");
const end=html.indexOf('</script>',start);
assert.ok(start>=0&&end>start);
const script=html.slice(start+'  <script>'.length,end);
const startup={hidden:true};
const app={childElementCount:0};
let callback,timer;
const document={
 body:{},
 getElementById(id){
   if(id==='startup')return startup;
   if(id==='startup-status')return {set textContent(value){startup.message=value;}};
   if(id==='app')return app;
   if(id==='authGate')return null;
   return null;
 }
};
class MutationObserver {
 constructor(fn){callback=fn;}
 observe(){}
}
vm.runInNewContext(script,{document,MutationObserver,setTimeout(fn,ms){timer={fn,ms}}});
assert.equal(startup.hidden,true,'startup must not be visible while switching areas');
assert.equal(timer.ms,20000);
callback();
assert.equal(startup.hidden,true,'empty render root must not reveal startup notice');
app.childElementCount=1;callback();
assert.equal(startup.hidden,true);
timer.fn();
assert.equal(startup.hidden,true,'late timeout must not bring back startup after load');
app.childElementCount=0;
startup.hidden=true;
timer.fn();
assert.equal(startup.hidden,false,'unresponsive initialization must offer a recovery link');
assert.match(startup.message,/nicht geöffnet/);
console.log('PASS: startup screen remains hidden for ordinary navigation and only appears when initialization remains empty.');
