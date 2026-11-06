import {neon} from '@neondatabase/serverless';
import {sessionUser,profileFor,publicUser} from '../../lib/auth.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Methode nicht erlaubt'});
  if(!process.env.DATABASE_URL)return res.status(500).json({error:'DATABASE_URL fehlt'});
  const sql=neon(process.env.DATABASE_URL),user=await sessionUser(req,sql);
  if(!user)return res.status(401).json({error:'Nicht angemeldet'});
  const rows=await sql`SELECT item AS profile FROM app_state
    CROSS JOIN LATERAL jsonb_array_elements(data->'users') item
    WHERE id='main' AND item->>'id'=${user.app_user_id} LIMIT 2`;
  const profile=profileFor({users:rows.map(row=>row.profile)},user);
  if(!profile||profile.active===false)return res.status(403).json({error:'Nicht freigeschaltet'});
  return res.status(200).json({user:publicUser(user,profile)});
}
