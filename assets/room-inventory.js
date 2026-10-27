// Versioned room references: preserve v1 captions for saved snapshots.
// Photo publication for v2 was explicitly approved on 2026-10-27.
export const leisureInventoryTasks = [
  'Tische reinigen und unter dem runden Fenster zurückstellen: insgesamt 6 Tische, davon 4 aufgebaut und 2 zusammengeklappt oben abgelegt.',
  'Normale Stühle kontrollieren und reinigen; in 4 Stapeln vor dem Fenster mit Lamellenvorhang zurückstellen. Stückzahl je Stapel vor der Nutzung mit dem Hausmeister festhalten und bei Rückgabe abgleichen.',
  'Kinderhochstühle getrennt von den normalen Stühlen kontrollieren und reinigen; in 2 Stapeln links neben den normalen Stühlen zurückstellen. Stückzahl je Stapel vor der Nutzung mit dem Hausmeister festhalten und bei Rückgabe abgleichen.',
  'E-Piano mit Ständer und Sitzbank rechts neben den normalen Stuhlstapeln an der Fensterseite zurückstellen.',
  'Kühlschrank ausstecken und die Tür geöffnet lassen.',
];
const references = {
  'freizeitraum-v1-f1': {file:null,title:'F1 – Stühle und E-Piano',caption:'4 Stapel normale Stühle; links 2 Stapel Kinderhochstühle; rechts E-Piano mit Sitzbank. Das Foto legt keine sichere Stückzahl je Stapel fest.',height:60},
  'freizeitraum-v1-f2': {file:null,title:'F2 – Tische unter dem runden Fenster',caption:'6 Tische: 4 aufgebaut, 2 zusammengeklappt oben abgelegt.',height:50},
  'freizeitraum-v1-f3': {file:null,title:'F3 – Kühlschrank bei Rückgabe',caption:'Netzstecker gezogen; Tür bleibt geöffnet.',height:65},
};
for (const [number,file] of [[1,'stuehle-piano-v2.jpeg'],[2,'tische-v2.jpeg'],[3,'kuehlschrank-v2.jpeg']]) {
  references[`freizeitraum-v2-f${number}`] = {...references[`freizeitraum-v1-f${number}`],file};
}
export const leisureReferenceIds = Object.freeze(Object.keys(references).filter(id=>id.startsWith('freizeitraum-v2-')));
export function isLeisureRoom(room) {
  const name = `${room.name || ''} ${room.type || ''}`.toLowerCase();
  return /freizeitraum/.test(name) && !/küche|kueche|\bwc\b|toilette|sanitär/.test(name);
}
export const inventoryTasksFor = room => isLeisureRoom(room) ? [...leisureInventoryTasks] : [];
export const inventoryReferencesFor = rooms => rooms.some(isLeisureRoom) ? [...leisureReferenceIds] : [];
export const hasInventoryPhotos = (ids = []) => Array.isArray(ids) && ids.some(id => Object.hasOwn(references,id) && !!references[id].file);
export function inventoryReferenceHtml(ids = []) {
  // Only bundled, versioned references are accepted. Never render arbitrary URLs/HTML.
  return [...new Set(Array.isArray(ids) ? ids : [])].filter(id => Object.hasOwn(references,id)).map(id => {
    const r=references[id];
    return `<div class="block inventory-reference" style="break-inside:avoid;page-break-inside:avoid;margin:0 0 3mm"><b>${r.title}</b>${r.file?`<img src="/assets/room-reference/${r.file}" alt="${r.title}" style="display:block;width:100%;height:${r.height}mm;object-fit:contain;margin:1mm 0">`:'<p>Referenzfoto noch nicht beigefügt. Die schriftlichen Vorgaben gelten.</p>'}<div style="font-size:9pt">${r.caption}</div></div>`;
  }).join('');
}
