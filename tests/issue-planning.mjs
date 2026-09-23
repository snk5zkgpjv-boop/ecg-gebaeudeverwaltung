import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../api/state.js',import.meta.url),'utf8');
for(const marker of ["output.myIssuePlanning = clone(state.issuePlanning?.[userId] || {})","delete output.issuePlanning","next.issuePlanning = auth.state.issuePlanning || {}","/api/organization/ecg-planning-sync"]){
 if(!source.includes(marker))throw new Error('missing privacy/sync marker: '+marker);
}
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const marker of ["delete x.myIssuePlanning","Meine Planung","saveIssuePlan","Meine offenen Aufgaben"]){
 if(!html.includes(marker))throw new Error('missing UI/privacy marker: '+marker);
}
console.log('private issue planning integration markers ok');
