import { neon } from '@neondatabase/serverless';
import { requireUser } from '../lib/auth.js';

function canManageCalendar(profile) {
  return profile.role === 'admin' || (profile.permissions?.manageCalendar ?? profile.role === 'coordinator');
}

function eventTime(value, allDayEnd = false) {
  if (value?.dateTime) return value.dateTime;
  if (!value?.date) return null;
  const date = new Date(`${value.date}T00:00:00`);
  if (allDayEnd) date.setMilliseconds(date.getMilliseconds() - 1);
  return date.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireUser(req, res, sql);
  if (!auth) return;
  if (!canManageCalendar(auth.profile)) {
    return res.status(403).json({ error: 'Kalender und Veranstaltungen sind für dieses Konto nicht freigeschaltet.' });
  }

  const calendarId = String(process.env.GOOGLE_CALENDAR_ID || '').trim();
  const apiKey = String(process.env.GOOGLE_CALENDAR_API_KEY || '').trim();
  if (!calendarId || !apiKey) {
    return res.status(503).json({
      configured: false,
      error: 'Google Calendar ist noch nicht vollständig eingerichtet.',
    });
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 30 * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + 370 * 86400000).toISOString();
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('showDeleted', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '2500');
  url.searchParams.set('timeZone', 'Europe/Berlin');

  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await response.json();
    if (!response.ok) {
      console.error('google calendar sync error', response.status, body?.error?.status || body?.error?.message || 'unknown');
      const privateCalendar = response.status === 404 || response.status === 403;
      return res.status(502).json({
        configured: true,
        error: privateCalendar
          ? 'Der Google-Kalender ist für diesen API-Zugang nicht freigegeben.'
          : 'Google Calendar konnte nicht abgerufen werden.',
      });
    }

    const events = (body.items || []).map((item) => ({
      id: `google_${item.id}`,
      googleId: item.id,
      title: item.summary || 'Termin ohne Titel',
      start: eventTime(item.start),
      end: eventTime(item.end, Boolean(item.end?.date)),
      location: item.location || '',
      cancelled: item.status === 'cancelled',
      allDay: Boolean(item.start?.date),
      updated: item.updated || '',
    })).filter((item) => item.start && item.end);

    const syncedAt = new Date().toISOString();
    const eventJson = JSON.stringify(events);
    const settingsJson = JSON.stringify({ calendarLastSync: syncedAt, calendarName: body.summary || 'Google Kalender' });
    await sql`UPDATE app_state
      SET data=jsonb_set(
        jsonb_set(data,'{calendarEvents}',${eventJson}::jsonb,true),
        '{settings}',coalesce(data->'settings','{}'::jsonb)||${settingsJson}::jsonb,true
      ), revision=revision+1, updated_at=now()
      WHERE id='main'`;

    return res.status(200).json({
      ok: true,
      configured: true,
      events,
      syncedAt,
      calendarName: body.summary || 'Google Kalender',
    });
  } catch (error) {
    console.error('calendar api error', error?.message || error);
    return res.status(502).json({ configured: true, error: 'Kalendersynchronisierung ist momentan nicht erreichbar.' });
  }
}
