const months=['jan','feb','mär','apr','mai','jun','jul','aug','sep','okt','nov','dez'];
const weekdays=['sonntag','montag','dienstag','mittwoch','donnerstag','freitag','samstag'];
const berlin=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
function plain(html){
 return html.replace(/<[^>]*>/g,' ').replace(/&(amp|nbsp|quot|apos|lt|gt|#\d+);/g,(m,k)=>k[0]==='#'?String.fromCharCode(Number(k.slice(1))):({amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>'})[k]).replace(/\s+/g,' ').trim();
}
export function parseProgram(html,now=new Date()){
 const today=new Date(berlin.format(now)+'T12:00:00Z');
 const blocks=html.split(/<div\s+class=["']event-item["'][^>]*>/i).slice(1);
 if(!blocks.length && !html.includes('Regelmäßige Gottesdienste'))throw Error('Terminseite nicht erkannt');
 return blocks.flatMap(block=>{
  const field=name=>plain(block.match(new RegExp('<[^>]+class=["\x27]'+name+'["\x27][^>]*>([\\s\\S]*?)</(?:div|h[23])>','i'))?.[1]||'');
  const parts=field('event-location').match(/^(\d{1,2})\.?\s+([\p{L}]+)\.?(?:\s+(\d{4}))?/u);
  const title=field('event-headding'),weekday=weekdays.indexOf(field('event-day').toLowerCase());
  if(!parts || !title)return [];
  const month=months.indexOf(parts[2].toLowerCase().slice(0,3));if(month<0)return [];
  const year=today.getUTCFullYear();
  const dates=(parts[3]?[Number(parts[3])]:[year-1,year,year+1]).map(y=>new Date(Date.UTC(y,month,Number(parts[1]),12))).filter(d=>d.getUTCMonth()===month && (weekday<0 || d.getUTCDay()===weekday)).sort((a,b)=>Math.abs(a-today)-Math.abs(b-today));
  if(!dates.length)return [];
  const key=dates[0].toISOString().slice(0,10);
  const time=field('event-time').match(/\b\d{1,2}:\d{2}\b/)?.[0]||'';
  return [{key,time,title,detail:field('event-explanation')}];
 });
}
