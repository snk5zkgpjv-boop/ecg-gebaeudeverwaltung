// PDF bytes never enter app_state/localStorage. Mutations are confirmed by the API.
const maintenanceWithoutDocuments = window.openMaintenance;
window.openMaintenance = id => {
  maintenanceWithoutDocuments(id);
  if (!can('viewMaintenance') || !state.maintenanceAssets.some(m => m.id === id)) return;
  const bodies = document.querySelectorAll('#modalRoot .modal'), body = bodies[bodies.length - 1];
  if (!body) return;
  const section = document.createElement('section');
  section.innerHTML = `<div class="section-title"><h2>📄 Anleitungen</h2></div><div class="card" style="box-shadow:none"><div class="document-list" aria-live="polite">Anleitungen werden geladen …</div>${can('manageMaintenance')?'<div class="field" style="margin-top:12px"><label>Titel der Anleitung<input class="document-title" maxlength="160" placeholder="z. B. Bedienungsanleitung / Wartungsplan"></label></div><div class="field"><label>PDF-Datei (max. 3 MB)<input class="document-file" type="file" accept="application/pdf,.pdf"></label></div><button class="btn primary document-upload">PDF hochladen</button>':''}<p class="document-status meta" role="status"></p><p class="meta">Gerätebezogene Anleitungen. Nur passende und aktuelle Unterlagen verwenden; Herstelleranleitung und Einweisung beachten.</p></div>`;
  body.insertBefore(section, body.querySelector('.section-title'));
  const owner = state.currentUserId, list = section.querySelector('.document-list'), status = section.querySelector('.document-status');
  const valid = () => section.isConnected && owner === state.currentUserId;
  const endpoint = '/api/state?maintenanceDocuments=1&assetId=' + encodeURIComponent(id);
  const request = async (url, options={}) => {
    const response = await fetch(url, {...options,headers:await authHeaders(options.headers||{}),cache:'no-store',signal:AbortSignal.timeout(45000)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Anleitung konnte nicht gespeichert oder geladen werden.');
    return result;
  };
  const load = async () => {
    try {
      const result = await request(endpoint);
      if (!valid()) return;
      list.replaceChildren();
      if (!result.documents.length) list.textContent = 'Noch keine Anleitungen hinterlegt.';
      for (const doc of result.documents) {
        const row = document.createElement('div'); row.className='row wrap'; row.style.marginBottom='10px';
        const info=document.createElement('div'), title=document.createElement('b'), meta=document.createElement('div');
        title.textContent=doc.title; meta.className='meta'; meta.textContent=`${doc.filename} · ${Math.ceil(doc.size/1024)} KB`; info.append(title,meta);
        const open=document.createElement('a'); open.className='btn'; open.textContent='PDF öffnen'; open.target='_blank'; open.rel='noopener noreferrer'; open.href=endpoint+'&documentId='+encodeURIComponent(doc.id);
        row.append(info,open);
        if (can('manageMaintenance')) {
          const remove=document.createElement('button'); remove.className='btn tiny'; remove.textContent='Entfernen';
          remove.onclick=async()=>{
            if (!valid() || !can('manageMaintenance') || !confirm(`„${doc.title}“ aus der Geräteliste entfernen? Die Datei bleibt zur Wiederherstellung in der Datenbank erhalten.`)) return;
            remove.disabled=true;
            try { await request(endpoint,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({removeId:doc.id})}); if(valid()){status.textContent='Anleitung aus der Liste entfernt.';await load();} }
            catch(error){if(valid()){status.textContent=error.message;remove.disabled=false;}}
          };
          row.append(remove);
        }
        list.append(row);
      }
    } catch(error) { if(valid()) {list.textContent=error.message;const retry=document.createElement('button');retry.className='btn';retry.textContent='Erneut laden';retry.onclick=load;list.append(retry);} }
  };
  const upload=section.querySelector('.document-upload');
  if(upload) upload.onclick=async()=>{
    if(!valid() || !can('manageMaintenance') || upload.disabled) return;
    const file=section.querySelector('.document-file').files[0], title=section.querySelector('.document-title').value.trim() || file?.name.replace(/\.pdf$/i,'');
    if(!file || !/\.pdf$/i.test(file.name) || file.size>3*1024*1024){status.textContent='Bitte eine PDF-Datei bis 3 MB wählen.';return;}
    upload.disabled=true;status.textContent='PDF wird hochgeladen …';
    try {
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Datei konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
      if(!valid()) return;
      await request(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,filename:file.name,base64})});
      if(valid()){status.textContent='Auf dem Server gespeichert.';section.querySelector('.document-file').value='';section.querySelector('.document-title').value='';await load();}
    } catch(error){if(valid())status.textContent=error.message || 'Upload fehlgeschlagen. Bitte erneut versuchen.';}
    finally{if(valid())upload.disabled=false;}
  };
  void load();
};
