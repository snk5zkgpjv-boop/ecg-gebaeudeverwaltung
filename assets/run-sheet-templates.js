// Durations are editable suggestions. Person assignments and service requests are separate.
const blocks={
 entrance:['Eingangslied',5],
 entranceTwo:['Zwei Eingangslieder',8],
 welcome:['Begrüßung',4],
 scripture:['Bibeltext lesen',5,'Redner'],
 talk:['Vortrag zum Bibeltext',40,'Redner'],
 talkFirst:['Vortrag · erster Teil',20,'Redner'],
 talkSecond:['Vortrag · Fortsetzung',20,'Redner'],
 song:['Gemeindelied',4],
 interlude:['Zwischenlied',4],
 closingSong:['Schlusslied',4],
 prayer:['Gebet',4],
 prayerTopic:['Einführung ins Gebetsthema',6,'Gebetsleitung'],
 guidedPrayer:['Gebetsthema und gemeinsame Gebetszeit',50,'Gebetsleitung'],
 prayerTime:['Gemeinsame Gebetszeit',20],
 piano:['Musik · Klavier und Gesang',6,'Klavier und 1–2 Sänger'],
 blessing:['Kindersegnung',6],
 news:['Ankündigungen',4],
 engagement:['Verlobung',5],
 worship:['Worship',16,'Musikteam'],
 message:['Botschaft',40,'Redner'],
 close:['Abschluss und Gebet',6]
};
export const blockOptions=Object.entries(blocks).map(([id,[title,minutes,lead='']])=>({id,title,minutes,lead}));
export const templates=[
 {id:'wed',title:'Mittwoch · Bibelstunde',note:'19:00–20:00 Uhr als Richtwert. Bei Bedarf 5–10 Minuten länger.',rows:[['entrance'],['scripture'],['talk',42],['closingSong'],['prayer']]},
 {id:'wed-song',title:'Mittwoch · Bibelstunde mit Zwischenlied',note:'Der Redner setzt den Vortrag nach dem Zwischenlied fort.',rows:[['entrance'],['scripture'],['talkFirst'],['interlude'],['talkSecond',18],['closingSong'],['prayer']]},
 {id:'fri',title:'Freitag · Gebetsstunde',note:'Die Themenleitung gestaltet die gemeinsame Gebetszeit frei. Zwischen- und Schlusslied sind optional.',rows:[['piano'],['guidedPrayer',54]]},
 {id:'sun',title:'Sonntag · Gottesdienst',note:'Beginn üblicherweise 10 Uhr, Ende etwa 11:15–11:20 Uhr. Sonderpunkte bei Bedarf ergänzen.',rows:[['entranceTwo'],['welcome'],['message',50],['song',6],['close',7]]},
 {id:'sun-worship',title:'Sonntag · Gottesdienst mit Worship',note:'Eingangslied, Begrüßung und Worship vor der Botschaft.',rows:[['entrance'],['welcome'],['worship'],['message'],['song'],['close']]}
];
export function makeBlock(id,minutes){
 const item=blockOptions.find(block=>block.id===id);
 if(!item)throw Error('Unbekannter Baustein.');
 return {title:item.title,minutes:minutes??item.minutes,lead:item.lead};
}
export function makeTemplate(id){
 const template=templates.find(t=>t.id===id);
 if(!template)throw Error('Unbekannte Ablaufvorlage.');
 return template.rows.map(([id,minutes])=>makeBlock(id,minutes));
}
export function suggestTemplate(title){
 const name=String(title||'').toLocaleLowerCase('de');
 if(name.includes('bibelstunde'))return 'wed';
 if(name.includes('gebetsstunde'))return 'fri';
 if(name.includes('worship'))return 'sun-worship';
 if(name.includes('gottesdienst'))return 'sun';
 return '';
}
