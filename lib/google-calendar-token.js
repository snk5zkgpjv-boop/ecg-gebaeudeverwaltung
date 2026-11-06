import {importPKCS8,SignJWT} from 'jose';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function serviceAccountCredentials() {
  const json = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      return { email: parsed.client_email || '', privateKey: parsed.private_key || '' };
    } catch {
      throw new Error('Google-Dienstkonto ist ungültig gespeichert.');
    }
  }
  return {
    email: String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(),
    privateKey: String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim(),
  };
}

export async function serviceAccountAccessToken(scope=CALENDAR_SCOPE) {
  const { email, privateKey } = serviceAccountCredentials();
  if (!email || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey, 'RS256');
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(email)
    .setSubject(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) {
    console.error('google service account token error', tokenResponse.status, tokenBody?.error || 'unknown');
    throw new Error('Google-Dienstkonto konnte nicht angemeldet werden.');
  }
  return tokenBody.access_token;
}
