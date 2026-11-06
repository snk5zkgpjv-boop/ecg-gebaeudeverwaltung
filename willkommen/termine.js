// Ausschließlich öffentliche Ankündigungen, ohne Verbindung zum internen Kalender.
const regular = {0:['Gottesdienst','10:00'],3:['Bibelstunde','19:00'],5:['Gebetsstunde','19:00']};
const specials = {'2026-11-06':['Thementage mit Eduard Adam','19:00'],'2026-11-07':['Thementage mit Eduard Adam','19:00']};
const berlinDay = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
const longDate = new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
const shortDate = new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'});

export function publicEvents(now) {
  const today = berlinDay.format(now);
  const day = new Date(today+'T12:00:00Z');
  const events = [];
  while(events.length<5){
    const key = day.toISOString().slice(0,10);
    const event = specials[key] || regular[day.getUTCDay()];
    if(event) events.push({key,day:new Date(day),today:key===today,title:event[0],time:event[1],special:Boolean(specials[key])});
    day.setUTCDate(day.getUTCDate()+1);
  }
  return events;
}
function render(){
  const [first,...rest] = publicEvents(new Date());
  document.querySelector('#when').textContent = (first.today?'Heute · ':'')+longDate.format(first.day)+' · '+first.time+' Uhr';
  document.querySelector('#title').textContent = first.title;
  document.querySelector('#note').textContent = first.special?'Die Übertragung dieses Sondertermins ist nicht bestätigt. Der Link öffnet den ECG-Videokanal.':'Der Link öffnet die Videoseite der ECG.';
  const rows = rest.map(event=>{
    const row=document.createElement('div'); row.className='row';
    const time=document.createElement('time'); time.dateTime=event.key+'T'+event.time;
    time.textContent=shortDate.format(event.day)+' · '+event.time;
    row.append(time,document.createTextNode(event.title));
    return row;
  });
  document.querySelector('#rows').replaceChildren(...rows);
}
if(typeof document!=='undefined'){
  render();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  setInterval(render,60000);
}
