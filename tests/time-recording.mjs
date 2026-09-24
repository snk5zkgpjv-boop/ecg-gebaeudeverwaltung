import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('assets/time-voice.js','utf8');
async function scenario({fail=false,rejectPreferred=false,denied=false}={}){
 const controls={'[data-stop]':{hidden:true},'[data-voice-status]':{textContent:''},'#voiceTranscript':{value:''},'[data-voice-preview]':{innerHTML:''}};
 const root={isConnected:true,querySelector:s=>controls[s],querySelectorAll:()=>[]};
 let requests=0,stops=0,selected=[];
 class Recorder{
  static isTypeSupported(m){return m==='audio/mp4'}
  constructor(stream,options){selected.push(options);if(rejectPreferred&&options)throw Error('unsupported');this.mimeType='audio/mp4';this.state='inactive';}
  start(){this.state='recording';this.ondataavailable({data:new Blob(['synthetic'],{type:this.mimeType})});}
  stop(){this.state='inactive';this.onstop();}
 }
 const context={state:{currentUserId:'me'},syncCloud:async()=>{},crypto:{randomUUID:()=> 'test'},window:{MediaRecorder:Recorder},MediaRecorder:Recorder,navigator:{mediaDevices:{getUserMedia:async()=>{if(denied)throw Object.assign(Error('denied'),{name:'NotAllowedError'});return {getTracks:()=>[{stop:()=>stops++}]}}}},Blob,setTimeout:()=>1,clearTimeout:()=>{},FileReader:class{readAsDataURL(){this.result='data:audio/mp4;base64,dGVzdA==';this.onload()}},fetch:async(_,options)=>{requests++;assert.equal(JSON.parse(options.body).mime,'audio/mp4');return {ok:true,json:async()=>({text:'Test erkannt'})}},root};
 const c=vm.createContext(context);vm.runInContext(code+';ecgVoice={root,userId:"me",busy:false,aiReady:true};this.getVoice=()=>ecgVoice;',c);
 await c.voiceRecord();
 if(denied){assert.match(controls['[data-voice-status]'].textContent,/nicht freigegeben/);assert.equal(requests,0);assert.equal(c.getVoice().busy,false);return;}
 assert.equal(controls['[data-stop]'].hidden,false);
 if(fail)c.getVoice().recorder.onerror();else c.voiceStop();
 await new Promise(setImmediate);
 assert.equal(stops>0,true);assert.equal(c.getVoice().busy,false);assert.equal(controls['[data-stop]'].hidden,true);
 assert.equal(requests,fail?0:1);
 if(!fail)assert.equal(controls['#voiceTranscript'].value,'Test erkannt');
 if(rejectPreferred)assert.equal(selected.length,2);
}
await scenario();await scenario({fail:true});await scenario({denied:true});await scenario({rejectPreferred:true});
console.log('PASS: recording/transcription flow, recorder fallback, denied microphone, recorder error does not upload partial audio. Synthetic microphone/provider only.');
