// Shared deterministic rules. No event/contact/account data belongs in this file.
export const DOCUMENT_VERSION = 1;
export const CLEANING_LOCATION = '1. OG, Technikraum, im Putzschrank';
const norm = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function floorKind(room) {
  const f = norm(room.floor);
  if (/^(ug|bg)$|untergeschoss|basisgeschoss/.test(f)) return 'ug';
  if (/^eg$|erdgeschoss/.test(f)) return 'eg';
  return 'other';
}
export function roomKind(room) {
  const n = norm(`${room.name} ${room.type || ''}`);
  if (/küche|kueche/.test(n)) return 'kitchen';
  if (/\bwc\b|toilette|sanitär/.test(n)) return 'toilet';
  if (/freizeitraum/.test(n)) return 'leisure';
  return 'room';
}
export function suggestedFee(rooms) {
  const main = rooms.filter(r => !['kitchen', 'toilet'].includes(roomKind(r)));
  if (!main.length) return null;
  if (main.every(r => roomKind(r) === 'leisure')) return 50;
  if (main.some(r => roomKind(r) === 'leisure')) return null;
  const floors = new Set(main.map(floorKind));
  if (floors.size === 1 && floors.has('ug')) return 100;
  if (floors.size === 2 && floors.has('eg') && floors.has('ug')) return 200;
  return null; // Never silently invent a tariff for other combinations.
}
export function cleaningLocationFor(rooms) {
  const locations = new Set();
  for (const room of rooms) {
    if (roomKind(room) === 'leisure') locations.add('Freizeitraum: 1. OG, Technikraum, im Putzschrank');
    else if (floorKind(room) === 'eg') locations.add('Erdgeschoss: Erste-Hilfe-Raum, im Putzschrank');
    else if (floorKind(room) === 'ug') locations.add('Untergeschoss: Hauswirtschaftsraum');
  }
  return [...locations].join('; ');
}
export const depositFor = eventType => eventType === 'wedding' ? 300 : 0;
export function cleaningSections(rooms, { kitchenUsed = false, toiletsUsed = true } = {}) {
  const sections = rooms.filter(r => !['kitchen', 'toilet'].includes(roomKind(r))).map(r => {
    const items = [
      'Eigene Gegenstände und Dekoration entfernen; den ursprünglichen Zustand wiederherstellen.',
      'Teppichflächen vollständig saugen, auch unter Tischen und Stühlen, soweit vorhanden.',
      'Marmor- und Fliesenflächen mit dem vorgesehenen Wischmopp trocken reinigen; stärkere Verschmutzungen nach Absprache beseitigen.',
      'Tische reinigen und an den vorgesehenen Platz zurückstellen. Stühle kontrollieren, reinigen und zurückstellen; beim Stapeln 15 Stühle pro Stapel.',
    ];
    if (floorKind(r) === 'ug') items.push('Gestapelte Tische im Tischraum verstauen (10 Tische pro Wagen); Stühle im Stuhllager abstellen. Stehtische reinigen und wegräumen.');
    if (/gemeindesaal|großer saal|grosser saal/i.test(r.name)) items.push('Den Saal einschließlich Bühne saugen; Kerzenwachs und Klebereste rückstandsfrei entfernen.');
    for (const t of r.tasks || []) if (['afteruse', 'afterevent'].includes(t.interval) && t.taskType !== 'technical' && t.title) items.push(t.title);
    return { title: [r.floor, r.name].filter(Boolean).join(' – '), items: [...new Set(items)] };
  });
  if (toiletsUsed || rooms.some(r => roomKind(r) === 'toilet')) sections.push({title:'Toiletten', items:[
    'Toiletten und Pissoirs gründlich putzen; Waschbecken, Spiegel und WC-Böden reinigen.',
    'Toilettenpapier und Papierhandtücher auffüllen (Material wird von der ECG gestellt).',
    'Mülleimer, Hygienemülleimer und gegebenenfalls Windeleimer leeren; gesamten Müll mitnehmen.',
  ]});
  if (kitchenUsed || rooms.some(r => roomKind(r) === 'kitchen')) sections.push({title:'Küche und Kücheninventar', items:[
    'Benutztes Kücheninventar und Utensilien (Teller, Tassen, Gläser, Besteck usw.) reinigen und an den vorgesehenen Orten wieder einräumen.',
    'Arbeitsflächen und Spüle säubern; eigene Lebensmittel mitnehmen. Küche wie vorgefunden hinterlassen.',
  ]});
  sections.push({title:'Abschluss', items:[
    'Alle übrigen genutzten Mülleimer leeren; gesamten Müll einschließlich Gelbem Sack mitnehmen.',
    'Reinigungsgeräte und Putzmittel ordentlich an ihren vorgesehenen Platz zurückstellen.',
    'Schäden und Mängel dem Hausmeister melden.',
    'Fenster und Türen schließen, Licht ausschalten; Abschließen und Schlüsselrückgabe mit dem Hausmeister abstimmen.',
    'Nach Feier und Reinigung den Hausmeister verständigen und die gemeinsame Abnahme durchführen.',
  ]});
  return sections;
}
function text(raw, key, max = 300, required = false) {
  const value = raw[key] ?? '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`Bitte ${key} gültig ausfüllen (max. ${max} Zeichen).`);
  return value.trim();
}
export function buildUsageDocument(raw, state, actor) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ungültige Vereinbarung.');
  const event = (state.calendarEvents || []).find(e => e.id === raw.eventId);
  if (!event || event.cancelled) throw new Error('Der Termin ist nicht mehr verfügbar. Bitte Kalender aktualisieren.');
  if (!Number.isFinite(Date.parse(event.start)) || !Number.isFinite(Date.parse(event.end))) throw new Error('Der Termin benötigt einen gültigen Beginn und ein Ende.');
  if (!['private', 'wedding'].includes(raw.eventType)) throw new Error('Bitte private Feier oder Hochzeit auswählen.');
  if (!Array.isArray(raw.roomIds) || !raw.roomIds.length || raw.roomIds.length > 80 || new Set(raw.roomIds).size !== raw.roomIds.length) throw new Error('Bitte die genutzten Räume auswählen.');
  const rooms = raw.roomIds.map(id => (state.rooms || []).find(r => r.id === id));
  if (rooms.some(r => !r)) throw new Error('Ein gewählter Raum existiert nicht mehr. Bitte neu auswählen.');
  if (typeof raw.fee !== 'number' || !Number.isFinite(raw.fee) || raw.fee < 0 || raw.fee > 10000 || Math.abs(raw.fee*100-Math.round(raw.fee*100)) > 0.00001) throw new Error('Bitte eine gültige Nutzungsgebühr eingeben.');
  const feeNote = text(raw, 'feeNote', 600);
  if (raw.fee !== suggestedFee(rooms) && !feeNote) throw new Error('Bitte den individuell vereinbarten Preis kurz begründen.');
  const kitchenUsed = raw.kitchenUsed === true || rooms.some(r => roomKind(r) === 'kitchen');
  const toiletsUsed = raw.toiletsUsed === true || rooms.some(r => roomKind(r) === 'toilet');
  const s = state.eventDocumentSettings || {};
  const doc = {
    templateVersion:DOCUMENT_VERSION, eventId:event.id,
    event:{title:event.title || '',start:event.start,end:event.end,allDay:!!event.allDay},
    roomIds:rooms.map(r=>r.id), rooms:rooms.map(r=>({id:r.id,name:r.name,floor:r.floor || ''})),
    eventType:raw.eventType, fee:raw.fee, deposit:depositFor(raw.eventType), feeNote,
    name:text(raw,'name',200,true), address:text(raw,'address',500), contact:text(raw,'contact',300),
    caretaker:text(raw,'caretaker',200,true), caretakerContact:text(raw,'caretakerContact',300),
    cleaningLocation:text(raw,'cleaningLocation',300,true), notes:text(raw,'notes',3000),
    kitchenUsed,toiletsUsed, sections:cleaningSections(rooms,{kitchenUsed,toiletsUsed}),
    settings:{contactLines:(s.contactLines || []).map(String),accountHolder:String(s.accountHolder || ''),bankName:String(s.bankName || ''),bankAccount:String(s.bankAccount || ''),bankBic:String(s.bankBic || ''),generalNotes:String(s.generalNotes || ''),houseRules:(s.houseRules || []).map(String)},
    updatedBy:actor.id,
  };
  if (raw.tasks !== undefined) {
    if (!Array.isArray(raw.tasks) || raw.tasks.length !== doc.sections.length) throw new Error('Aufgaben und Raumauswahl passen nicht zusammen. Bitte Aufgaben neu erzeugen.');
    doc.sections = doc.sections.map((section,i) => {
      const items = raw.tasks[i];
      if (!Array.isArray(items) || !items.length || items.length > 60 || items.some(t => typeof t !== 'string' || !t.trim() || t.length > 800)) throw new Error('Bitte gültige Reinigungsaufgaben eingeben.');
      return {...section,items:items.map(t=>t.trim())};
    });
  }
  if (JSON.stringify(doc).length > 150000) throw new Error('Die Vereinbarung ist zu umfangreich.');
  return doc;
}
