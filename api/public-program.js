import {parseProgram} from '../lib/public-program.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();
 try{
  const source=await fetch('https://www.ecg-online.de/termine/',{signal:AbortSignal.timeout(6500)});
  if(!source.ok)throw Error('Quelle nicht erreichbar');
  const entries=parseProgram(await source.text());
  res.setHeader('Cache-Control','public, s-maxage=600, stale-while-revalidate=300');
  return res.status(200).json({entries});
 }catch{
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'Veranstaltungsseite derzeit nicht erreichbar'});
 }
}
