import {readFile} from 'node:fs/promises';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';

const fields=['name','birthDate','street','postalCode','city','email','phone'];
function xml(value){
 return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}
export async function memberWorkbook(records){
 const files=unzipSync(await readFile(new URL('../members/Importvorlage.xlsx',import.meta.url)));
 const path='xl/worksheets/sheet1.xml',template=strFromU8(files[path]);
 const rows=records.map(({data},i)=>{
  const n=i+2;
  const cells=fields.map((key,j)=>'<x:c r="'+String.fromCharCode(65+j)+n+'" t="inlineStr"><x:is><x:t xml:space="preserve">'+xml(data[key])+'</x:t></x:is></x:c>');
  return '<x:row r="'+n+'">'+cells.join('')+'</x:row>';
 });
 files[path]=strToU8(template.replace(/(<\/x:row>)[\s\S]*?(<\/x:sheetData>)/,(_,header,end)=>header+rows.join('')+end));
 return Buffer.from(zipSync(files));
}
