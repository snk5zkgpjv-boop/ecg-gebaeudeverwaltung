import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
const policy=vm.createContext({structuredClone});
vm.runInContext(html.slice(html.indexOf('const leadershipPresets'),html.indexOf('const roleLabels'))+readFileSync('assets/portal-areas.js','utf8'),policy);
const server=readFileSync('api/state.js','utf8');
vm.runInContext(server.slice(server.indexOf('const defaults'),server.indexOf('const progressFields')),policy);
for(const role of ['elder','deacon','financeDeacon']){
 const p={id:'self',role,permissions:vm.runInContext('leadershipPresets.'+role,policy)};
 assert.equal(policy.sectionAllowed('viewCalendar',p),true);
 assert.equal(policy.sectionAllowed('planned',p),role!=='deacon');
 assert.equal(policy.sectionAllowed('staff',p),role!=='deacon');
 for(const key of ['manageMaintenance','useAI'])assert.equal(vm.runInContext('has',policy)(p,key),false);
 const data=policy.visible({users:[p,{id:'cleaner'}],timeEntries:[{userId:'cleaner'}],calendarEvents:[{}],maintenanceAssets:[{}]},p);
 assert.equal(data.timeEntries.length,0);
 assert.equal(data.calendarEvents.length,1);
 assert.equal(Boolean(data.maintenanceAssets),role!=='financeDeacon');
}
