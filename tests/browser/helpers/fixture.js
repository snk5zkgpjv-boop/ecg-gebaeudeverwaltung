import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function browserFixture(){
 const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
 const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if((file!==root&&!file.startsWith(root+path.sep))||path.relative(root,file).split(path.sep).some(part=>part.startsWith('.'))){res.statusCode=403;res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{browser=await chromium.launch({headless:true});}
 catch(error){server.close();throw error;}
 return {browser,origin,async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}};
}
