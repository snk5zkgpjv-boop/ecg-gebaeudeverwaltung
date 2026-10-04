import {createHash,timingSafeEqual} from 'node:crypto';

export function organizationExport(state,authorization,env=process.env){
 const expected=env.ORGANIZATION_SYNC_TOKEN||'',actual=String(authorization||'').replace(/^Bearer\s+/i,'');
 if(!expected||!actual||!timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(actual).digest()))return {status:401,body:{error:'Synchronisierung nicht autorisiert.'}};
 const ownerEmail=(env.ORGANIZATION_SYNC_USER_EMAIL||'').trim().toLowerCase();
 if(!ownerEmail)return {status:503,body:{error:'ECG-Eigentümer nicht konfiguriert.'}};
 const users=(state.users||[]).filter(u=>u.active!==false&&(u.email||'').trim().toLowerCase()===ownerEmail);
 if(users.length!==1)return {status:503,body:{error:'ECG-Eigentümer nicht eindeutig gefunden.'}};
 const entries=(state.timeEntries||[]).filter(e=>e.userId===users[0].id&&e.end).map(e=>({id:e.id,start:e.start,end:e.end,workLabel:e.workLabel,note:e.note,volunteer:!!e.volunteer}));
 return {status:200,body:{ok:true,ownerEmail,entries}};
}
