import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
const red=rgb(.68,.24,.25),black=rgb(.12,.12,.13),grey=rgb(.72,.72,.72),green=rgb(.83,.91,.72),cream=rgb(.95,.94,.90),white=rgb(1,1,1);
const dateAt=(start,i)=>new Date(Date.parse(start+'T12:00:00Z')+86400000*i);
export function validateWeek(start){
 if(typeof start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(dateAt(start,0).getTime())||dateAt(start,0).toISOString().slice(0,10)!==start||dateAt(start,0).getUTCDay()!==0)throw Error('Bitte einen Sonntag wählen.');
}
export async function weekPdf(start,items){
 validateWeek(start);if(!Array.isArray(items)||items.length>100)throw Error('Maximal 100 Termine.');
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const logo=await doc.embedPng(await readFile(new URL('../assets/embedded-4-8ef55a643706.png',import.meta.url)));
 const W=842,H=595,x0=20,cw=(W-40)/8;
 const clean=s=>[...s].map(ch=>{try{font.encodeText(ch);return ch;}catch{return '?';}}).join('');
 function wrap(text){
  const lines=[''];for(const word of clean(text).split(/\s+/)){
   let i=lines.length-1;if(lines[i]&&bold.widthOfTextAtSize(lines[i]+' '+word,10)>cw-12){lines.push('');i++;}
   if(lines[i])lines[i]+=' ';for(const ch of word){if(bold.widthOfTextAtSize(lines[i]+ch,10)>cw-12){lines.push('');i++;}lines[i]+=ch;}
  }return lines;
 }
 const fmt=d=>d.toLocaleDateString('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
 const cols=Array.from({length:8},()=>[[],[]]);
 for(const e of items){
  if(!Number.isInteger(e.day)||e.day<0||e.day>7||typeof e.title!=='string'||!e.title.trim()||e.title.length>180||!/^([01]\d|2[0-3]):[0-5]\d$|^Ganztägig$/.test(e.time))throw Error('Terminangaben prüfen.');
  cols[e.day][e.time<'12:00'||e.time==='Ganztägig'?0:1].push({...e,lines:wrap(e.title+(e.cancelled?' · fällt aus':''))});
 }
 for(const col of cols)for(const band of col)band.sort((a,b)=>a.time.localeCompare(b.time));
 do{
  const page=doc.addPage([W,H]);const text=(s,x,y,size,f=font,color=black)=>page.drawText(s,{x,y,size,font:f,color});
  text('Veranstaltungen der Woche  '+fmt(dateAt(start,0))+' – '+fmt(dateAt(start,7)),x0,H-42,20,bold);page.drawImage(logo,{x:W-60,y:H-52,width:35,height:39});
  for(let d=0;d<8;d++){
   const x=x0+d*cw;page.drawRectangle({x,y:26,width:cw,height:500,borderColor:grey,borderWidth:.6});
   page.drawRectangle({x,y:497,width:cw,height:29,color:red});text(['Heute','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'][d],x+6,507,11,bold,white);
   page.drawRectangle({x,y:297,width:cw,height:11,color:grey});
   for(let k=0;k<2;k++){let top=k?289:488;const bottom=k?30:312;const band=cols[d][k];
    while(band.length){const e=band[0],capacity=Math.floor((top-bottom-25)/12);if(capacity<1)break;
     const lines=e.lines.splice(0,capacity),height=25+lines.length*12;
     page.drawRectangle({x:x+3,y:top-height,width:cw-6,height,color:e.special?green:cream});
     const color=e.cancelled?red:black;text(e.time==='Ganztägig'?e.time:e.time+' Uhr',x+6,top-13,10,font,color);
     lines.forEach((line,i)=>text(line,x+6,top-26-i*12,10,bold,color));top-=height+5;if(!e.lines.length)band.shift();
    }
   }
  }
 }while(cols.some(c=>c.some(b=>b.length)));
 return doc.save();
}
