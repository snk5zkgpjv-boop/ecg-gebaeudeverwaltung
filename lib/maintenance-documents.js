import { createHash } from 'node:crypto';

export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export function validateDocument(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const filename = typeof body?.filename === 'string' ? body.filename.trim() : '';
  const base64 = body?.base64;
  if (!title || title.length > 160 || !filename || filename.length > 180 || !/\.pdf$/i.test(filename)) throw new Error('Titel und PDF-Dateiname erforderlich.');
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('Ungültige PDF-Datei oder größer als 3 MB.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_PDF_BYTES || bytes.length < 10 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new Error('Keine gültige PDF-Datei.');
  return { title, filename: filename.replace(/[\x00-\x1f\x7f/\\]/g, '_'), base64, size: bytes.length, hash: createHash('sha256').update(bytes).digest('hex') };
}

// Separate from app_state and its device cache/full-state PUTs. All bytes remain private.
export async function maintenanceDocuments(req, res, sql, auth, has) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const method = req.method;
  if (!['GET', 'POST', 'PATCH'].includes(method)) return res.status(405).json({error:'Methode nicht erlaubt.'});
  if (!has(auth.profile, 'viewMaintenance') || (method !== 'GET' && !has(auth.profile, 'manageMaintenance'))) return res.status(403).json({error:'Keine Berechtigung für Anleitungen.'});
  if (method !== 'GET' && !String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({error:'JSON erforderlich.'});
  const assetId = req.query?.assetId;
  if (typeof assetId !== 'string' || !(auth.state.maintenanceAssets || []).some(m => m.id === assetId)) return res.status(404).json({error:'Gerät nicht gefunden.'});
  await sql`CREATE TABLE IF NOT EXISTS ecg_maintenance_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id text NOT NULL,
    title text NOT NULL, filename text NOT NULL, size integer NOT NULL,
    sha256 text NOT NULL, pdf_base64 text NOT NULL, created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz,
    removed_by text, UNIQUE(asset_id, sha256))`;
  if (method === 'GET') {
    if (req.query?.documentId) {
      const rows = await sql`SELECT filename,pdf_base64 FROM ecg_maintenance_documents WHERE id::text=${String(req.query.documentId)} AND asset_id=${assetId} AND removed_at IS NULL LIMIT 1`;
      if (!rows.length) return res.status(404).json({error:'Anleitung nicht gefunden.'});
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="anleitung.pdf"; filename*=UTF-8''${encodeURIComponent(rows[0].filename).replace(/'/g, '%27')}`);
      // Uploaded PDFs run on an isolated opaque origin; embedded scripts/network are blocked.
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; frame-ancestors 'self'");
      return res.status(200).send(Buffer.from(rows[0].pdf_base64, 'base64'));
    }
    const documents = await sql`SELECT id,title,filename,size,sha256,created_at FROM ecg_maintenance_documents WHERE asset_id=${assetId} AND removed_at IS NULL ORDER BY created_at,id`;
    return res.status(200).json({documents});
  }
  if (method === 'PATCH') {
    if (typeof req.body?.removeId !== 'string') return res.status(400).json({error:'Anleitung erforderlich.'});
    const rows = await sql`UPDATE ecg_maintenance_documents SET removed_at=COALESCE(removed_at,now()),removed_by=COALESCE(removed_by,${auth.profile.id}) WHERE id::text=${req.body.removeId} AND asset_id=${assetId} RETURNING id`;
    return rows.length ? res.status(200).json({removed:true}) : res.status(404).json({error:'Anleitung nicht gefunden.'});
  }
  let document;
  try { document = validateDocument(req.body); } catch (error) { return res.status(400).json({error:error.message}); }
  // Same PDF for same asset is idempotent even if the upload response was lost.
  const rows = await sql`INSERT INTO ecg_maintenance_documents(asset_id,title,filename,size,sha256,pdf_base64,created_by)
    VALUES(${assetId},${document.title},${document.filename},${document.size},${document.hash},${document.base64},${auth.profile.id})
    ON CONFLICT(asset_id,sha256) DO UPDATE SET removed_at=NULL,removed_by=NULL,title=EXCLUDED.title,filename=EXCLUDED.filename
    RETURNING id,title,filename,size,sha256,created_at`;
  return res.status(200).json({document:rows[0]});
}
