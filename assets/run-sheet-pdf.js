import {PDFDocument,StandardFonts,rgb} from './vendor/pdf-lib-1.17.1.esm.min.js';

const W=595.28,H=841.89,margin=40,right=W-margin;
const burgundy=rgb(.53,.08,.25),ink=rgb(.17,.14,.15),muted=rgb(.39,.34,.36),line=rgb(.86,.82,.83),blush=rgb(.96,.93,.94);

function renderer(doc,regular,bold){
 let canvas;
 const context=(font,size)=>{
  canvas??=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  ctx.font=(font===bold?'bold ':'')+size+'px Arial, sans-serif';
  return ctx;
 };
 function width(text,font,size){
  try{return font.widthOfTextAtSize(text,size);}catch{return context(font,size).measureText(text).width;}
 }
 function wrap(text,font,size,maxWidth){
  const lines=[];let current='';
  for(const word of String(text).trim().split(/\s+/u)){
   const candidate=current?current+' '+word:word;
   if(width(candidate,font,size)<=maxWidth){current=candidate;continue;}
   if(current){lines.push(current);current='';}
   for(const ch of word){
    if(current&&width(current+ch,font,size)>maxWidth){lines.push(current);current='';}
    current+=ch;
   }
  }
  if(current||!lines.length)lines.push(current);
  return lines;
 }
 async function draw(page,text,x,y,font=regular,size=11,color=ink){
  if(!text)return;
  try{font.encodeText(text);}catch{
   // PDF's standard Helvetica misses some alphabets. Preserve that line with the browser's font fallback.
   const w=Math.ceil(width(text,font,size))+2,h=Math.ceil(size*1.7),scale=3;
   canvas.width=w*scale;canvas.height=h*scale;
   const ctx=context(font,size);ctx.scale(scale,scale);ctx.fillStyle='rgb('+[color.red,color.green,color.blue].map(v=>Math.round(v*255)).join(',')+')';
   ctx.fillText(text,0,size*1.2);
   page.drawImage(await doc.embedPng(canvas.toDataURL('image/png')),{x,y:y+size*1.2-h,width:w,height:h});
   return;
  }
  page.drawText(text,{x,y,font,size,color});
 }
 return {draw,wrap};
}

export async function runSheetPdf(model){
 const doc=await PDFDocument.create();
 doc.setTitle('Ablaufplan · '+model.title);doc.setAuthor('ECG Hussenhofen');
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const {draw,wrap}=renderer(doc,regular,bold);
 const xs=[margin+5,margin+68,margin+126,margin+337];
 let page,y;
 async function nextPage(){
  const first=!page;page=doc.addPage([W,H]);y=H-margin;
  page.drawRectangle({x:margin,y:y-3,width:right-margin,height:3,color:burgundy});
  await draw(page,'ECG HUSSENHOFEN',margin,y-22,bold,10,burgundy);y-=52;
  await draw(page,first?'Ablaufplan':'Ablaufplan · Fortsetzung',margin,y,regular,12,muted);y-=26;
  if(first){
   for(const text of wrap(model.title,bold,20,right-margin)){
    await draw(page,text,margin,y,bold,20);y-=24;
   }
   await draw(page,model.date+'  ·  Beginn '+model.start+' Uhr',margin,y-2,regular,11,muted);y-=28;
  }
  page.drawRectangle({x:margin,y:y-19,width:right-margin,height:24,color:blush});
  for(const [i,label] of ['Beginn','Dauer','Programmpunkt','Zuständig'].entries())await draw(page,label,xs[i],y-10,bold,10,burgundy);
  y-=32;
 }
 await nextPage();
 for(const row of model.rows){
  const cells=[wrap(row.time,regular,10,56),[row.minutes+' Min.'],wrap(row.title,bold,10,201),wrap(row.lead||'–',regular,10,right-xs[3]-5)];
  const count=Math.max(...cells.map(c=>c.length)),height=14*count+14;
  if(y-height<60)await nextPage();
  for(const [i,cell] of cells.entries()){
   for(const [j,text] of cell.entries())await draw(page,text,xs[i],y-j*14,i===2?bold:regular,10);
  }
  y-=height;page.drawLine({start:{x:margin,y:y+12},end:{x:right,y:y+12},color:line,thickness:.6});
 }
 if(y<90)await nextPage();
 await draw(page,'Ende '+model.end+' Uhr  ·  '+model.duration+' Minuten',margin,y-14,bold,12,burgundy);
 const pages=doc.getPages();
 for(const [i,p] of pages.entries()){
  p.drawLine({start:{x:margin,y:42},end:{x:right,y:42},color:line,thickness:.6});
  await draw(p,'ECG Hussenhofen · Ablaufplan',margin,28,regular,9,muted);
  const number=(i+1)+' / '+pages.length;
  await draw(p,number,right-regular.widthOfTextAtSize(number,9),28,regular,9,muted);
 }
 return doc.save();
}
