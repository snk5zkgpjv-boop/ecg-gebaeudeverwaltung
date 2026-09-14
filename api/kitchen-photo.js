import { neon } from '@neondatabase/serverless';
import { requireUser } from '../lib/auth.js';

export default async function handler(req,res) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET');return res.status(405).end(); }
  if (!process.env.DATABASE_URL) return res.status(503).end();
  try {
    const auth=await requireUser(req,res,neon(process.env.DATABASE_URL));
    if (!auth) return;
    const name=String(req.query.name||'');
    const photos=auth.state.kitchenPhotos||{};
    const photo=Object.hasOwn(photos,name)?photos[name]:null;
    if (typeof photo!=='string'||!/^[a-zA-Z0-9+/=]+$/.test(photo)) return res.status(404).end();
    res.setHeader('Content-Type','image/jpeg');
    res.setHeader('Cache-Control','private, max-age=300');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.status(200).send(Buffer.from(photo,'base64'));
  } catch { return res.status(500).json({error:'Foto konnte nicht geladen werden.'}); }
}
