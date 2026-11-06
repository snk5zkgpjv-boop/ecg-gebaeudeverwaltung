const localDate=new Intl.DateTimeFormat('de-DE',{dateStyle:'full',timeZone:'Europe/Berlin'});
const two=n=>String(n).padStart(2,'0');
const visibleTime=n=>two(Math.floor(n/60)%24)+':'+two(n%60)+(n>=1440?' (+1 Tag)':'');
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function printModel({event,start,items}){
 if(typeof start!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!Array.isArray(items)||items.length>80)throw Error('Bitte Beginn und Programmpunkte prüfen.');
 const date=new Date(event?.start);
 if(!event?.title||!Number.isFinite(+date))throw Error('Veranstaltung und Datum prüfen.');
 const original=Number(start.slice(0,2))*60+Number(start.slice(3));
 let time=original;
 const rows=items.map(({title,minutes,lead})=>{
  if(typeof title!=='string'||!title.trim()||!Number.isInteger(minutes)||minutes<1||minutes>1440||typeof lead!=='string')throw Error('Bitte Titel, Dauer und Zuständigkeit prüfen.');
  const row={time:visibleTime(time),minutes:String(minutes),title:title.trim(),lead:lead.trim()};
  time+=minutes;return row;
 });
 if(time-original>1440)throw Error('Ein Ablauf darf höchstens 24 Stunden umfassen.');
 return {title:event.title,date:localDate.format(date),start,end:visibleTime(time),duration:time-original,rows};
}
export function printPage(m){
 const rows=m.rows.map(r=>'<tr><td>'+escape(r.time)+'</td><td>'+escape(r.minutes)+' Min.</td><th scope="row">'+escape(r.title)+'</th><td>'+escape(r.lead||'–')+'</td></tr>').join('');
 return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ablaufplan · '+escape(m.title)+'</title><style>'+
 '*{box-sizing:border-box}body{margin:0;background:#f4f1ef;color:#30282b;font:16px/1.45 system-ui,sans-serif}main,nav{width:min(100%,52rem);margin:auto;padding:1.2rem}main{background:white;padding:clamp(1.2rem,5vw,3rem)}nav{display:flex;align-items:center;gap:.6rem}button{padding:.65rem 1rem;font:inherit;background:white;border:1px solid #c7b7bc;border-radius:.55rem}header{border-top:4px solid #87153f;padding-top:1rem}.brand{color:#87153f;font-weight:700;letter-spacing:.06em;font-size:.85rem}.kind{margin:.9rem 0 .2rem;color:#60555a}h1{margin:.1rem 0;font-size:clamp(1.5rem,4vw,2.1rem);overflow-wrap:anywhere}.meta{margin:.35rem 0 1.5rem}table{width:100%;border-collapse:collapse;table-layout:fixed}col:nth-child(1){width:16%}col:nth-child(2){width:13%}col:nth-child(3){width:42%}th,td{text-align:left;vertical-align:top;padding:.65rem .4rem;border-bottom:1px solid #ddd;overflow-wrap:anywhere}thead{display:table-header-group;background:#f5eff1;color:#5d3646}tr{break-inside:avoid}tbody tr:nth-child(even){background:#faf8f7}footer{margin-top:1rem;border-top:2px solid #87153f;padding-top:.6rem;font-weight:650}'+
 '@media screen and (max-width:480px){td,th{padding:.5rem .18rem;font-size:.87rem}main,nav{padding:.8rem}}@page{size:A4;margin:15mm}@media print{body{background:white;font-size:10pt}nav{display:none}main{padding:0;width:auto}h1{font-size:20pt}header{break-after:avoid}footer{break-inside:avoid}}'+
 '</style></head><body><nav><button id="print">Drucken</button><button id="close">Schließen</button></nav><main><header><div class="brand">ECG HUSSENHOFEN</div><p class="kind">Ablaufplan</p><h1>'+escape(m.title)+'</h1><p class="meta">'+escape(m.date)+' · Beginn '+escape(m.start)+' Uhr</p></header><table><colgroup><col><col><col><col></colgroup><thead><tr><th>Beginn</th><th>Dauer</th><th>Programmpunkt</th><th>Zuständig</th></tr></thead><tbody>'+rows+'</tbody></table><footer>Ende '+escape(m.end)+' Uhr · '+m.duration+' Minuten</footer></main></body></html>';
}

function showPreview(model){
 const preview=window.open('','_blank');
 if(!preview)throw Error('Druckansicht konnte nicht geöffnet werden. Bitte Pop-ups für diese Seite erlauben.');
 preview.opener=null;
 preview.document.open();preview.document.write(printPage(model));preview.document.close();
 preview.document.getElementById('print').onclick=()=>preview.print();
 preview.document.getElementById('close').onclick=()=>preview.close();
}

export function addRunSheetOutputs(container,readDraft){
 const preview=document.createElement('button'),download=document.createElement('button'),notice=document.createElement('p');
 for(const b of [preview,download]){b.type='button';b.className='btn';}
 preview.textContent='Druckansicht';download.textContent='PDF herunterladen';notice.setAttribute('role','status');
 container.append(preview,download,notice);
 preview.onclick=()=>{
  try{const draft=readDraft();if(draft){showPreview(printModel(draft));notice.textContent='';}}catch(e){notice.textContent=e.message;}
 };
 download.onclick=async()=>{
  download.disabled=true;
  try{
   const draft=readDraft();if(!draft)return;
   const model=printModel(draft);notice.textContent='PDF wird erstellt …';
   const {runSheetPdf}=await import('./run-sheet-pdf.js');
   const bytes=await runSheetPdf(model);
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');
   a.href=url;a.download='ECG-Ablaufplan-'+draft.event.start.slice(0,10)+'.pdf';document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);notice.textContent='PDF zum Download bereitgestellt.';
  }catch(e){notice.textContent='PDF konnte nicht erstellt werden: '+e.message;}finally{download.disabled=false;}
 };
}
