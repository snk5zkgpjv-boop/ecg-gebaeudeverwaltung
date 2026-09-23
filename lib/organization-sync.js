export async function syncOrganizationTimes(state,profile=null,fetcher=fetch,env=process.env){
 const url=env.ORGANIZATION_API_URL,token=env.ORGANIZATION_SYNC_TOKEN,email=(env.ORGANIZATION_SYNC_USER_EMAIL||'').trim().toLowerCase();
 if(!url||!token||!email)return {status:'not_configured'};
 if(profile&&(profile.email||'').trim().toLowerCase()!==email)return {status:'not_applicable'};
 const ids=new Set((state.users||[]).filter(u=>(u.email||'').trim().toLowerCase()===email).map(u=>u.id));
 const entries=(state.timeEntries||[]).filter(e=>ids.has(e.userId)&&e.end);
 if(!ids.size)return {status:'not_applicable'};
 try{
  // Receiver currently caps a request at 1000 rows; chunk to avoid silent truncation.
  for(let i=0;i<entries.length;i+=500){
   const chunk=entries.slice(i,i+500);
   const response=await fetcher(`${url.replace(/\/$/,'')}/api/organization/ecg-sync`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({ownerEmail:email,entries:chunk}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)return {status:'pending'};
   const body=await response.json();if(body.ok!==true||body.synced!==chunk.length)return {status:'pending'};
  }
  return {status:'synced',count:entries.length};
 }catch{return {status:'pending'};}
}
