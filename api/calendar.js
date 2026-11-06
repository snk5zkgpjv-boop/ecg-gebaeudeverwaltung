import {weekPdf,validateWeek} from '../lib/week-pdf.js';
import publicProgram from '../lib/public-program-handler.js';
import { neon } from '@neondatabase/serverless';
import {serviceAccountAccessToken} from '../lib/google-calendar-token.js';
import { createHash } from 'node:crypto';
import ical from 'node-ical';
import { requireUser } from '../lib/auth.js';



function canManageCalendar(profile) {
  return profile.role !== 'technician' && (profile.role === 'admin' || (profile.permissions?.manageCalendar ?? profile.role === 'coordinator'));
}

function eventTime(value, allDayEnd = false) {
  if (value?.dateTime) return value.dateTime;
  if (!value?.date) return null;
  const date = new Date(`${value.date}T00:00:00`);
  if (allDayEnd) date.setMilliseconds(date.getMilliseconds() - 1);
  return date.toISOString();
}

function textValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'val' in value) return String(value.val || '');
  return value == null ? '' : String(value);
}

async function readIcalCalendar(icalUrl, rangeStart, rangeEnd) {
  const url = new URL(icalUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com') {
    throw new Error('Die geheime iCal-Adresse muss direkt von Google Calendar stammen.');
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'text/calendar' } });
  if (!response.ok) throw new Error('Die geheime Google-Kalenderadresse ist ungültig oder wurde zurückgesetzt.');
  const source = await response.text();
  if (source.length > 5_000_000) throw new Error('Der Google-Kalender ist für einen einzelnen Abruf zu groß.');
  const parsed = await ical.async.parseICS(source);
  const events = [];

  for (const component of Object.values(parsed)) {
    if (component?.type !== 'VEVENT') continue;
    const instances = ical.expandRecurringEvent(component, {
      from: rangeStart,
      to: rangeEnd,
      includeOverrides: true,
      excludeExdates: true,
      expandOngoing: true,
    });
    for (const instance of instances) {
      const original = instance.event || component;
      const start = new Date(instance.start);
      const end = new Date(instance.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      if (instance.isFullDay) end.setMilliseconds(end.getMilliseconds() - 1);
      const stable = createHash('sha256').update(`${original.uid || 'event'}|${start.toISOString()}`).digest('hex').slice(0, 24);
      events.push({
        id: `ical_${stable}`,
        googleId: textValue(original.uid),
        title: textValue(instance.summary || original.summary) || 'Termin ohne Titel',
        start: start.toISOString(),
        end: end.toISOString(),
        location: textValue(original.location),
        description: textValue(original.description),
        cancelled: textValue(original.status).toUpperCase() === 'CANCELLED',
        allDay: Boolean(instance.isFullDay),
        updated: original.lastmodified instanceof Date ? original.lastmodified.toISOString() : '',
      });
      if (events.length >= 5000) break;
    }
    if (events.length >= 5000) break;
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return { events, calendarName: 'ECG Google Kalender' };
}

async function readGoogleCalendarApi(calendarId, apiKey, serviceAccountConfigured, rangeStart, rangeEnd) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  if (apiKey) url.searchParams.set('key', apiKey);
  url.searchParams.set('timeMin', rangeStart.toISOString());
  url.searchParams.set('timeMax', rangeEnd.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('showDeleted', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '2500');
  url.searchParams.set('timeZone', 'Europe/Berlin');

  const accessToken = serviceAccountConfigured ? await serviceAccountAccessToken() : null;
  const headers = { accept: 'application/json' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok) {
    console.error('google calendar sync error', response.status, body?.error?.status || body?.error?.message || 'unknown');
    throw new Error(response.status === 404 || response.status === 403
      ? 'Der Google-Kalender ist für diesen API-Zugang nicht freigegeben.'
      : 'Google Calendar konnte nicht abgerufen werden.');
  }
  const events = (body.items || []).map((item) => ({
    id: `google_${item.id}`,
    googleId: item.id,
    title: item.summary || 'Termin ohne Titel',
    start: eventTime(item.start),
    end: eventTime(item.end, Boolean(item.end?.date)),
    location: item.location || '',
    description: item.description || '',
    cancelled: item.status === 'cancelled',
    allDay: Boolean(item.start?.date),
    updated: item.updated || '',
  })).filter((item) => item.start && item.end);
  return { events, calendarName: body.summary || 'Google Kalender' };
}

export default async function handler(req, res) {
  if(req.query?.publicProgram==='1')return publicProgram(req,res);
  const pdf=req.query?.weekPdf==='1';
  if (req.method !== (pdf?'POST':'GET')) return res.status(405).json({ error: 'Methode nicht erlaubt' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });

  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireUser(req, res, sql);
  if (!auth) return;
  if (!canManageCalendar(auth.profile)) {
    return res.status(403).json({ error: 'Kalender und Veranstaltungen sind für dieses Konto nicht freigeschaltet.' });
  }

  if(pdf){
    try{const bytes=await weekPdf(req.body?.start,req.body?.items);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="ECG-Wochenplan-'+req.body.start+'.pdf"');return res.status(200).send(Buffer.from(bytes));}
    catch{return res.status(400).json({error:'Wochenplan konnte nicht erstellt werden. Auswahl prüfen.'});}
  }
  const week=req.query?.week;
  if(week){try{validateWeek(week);}catch{return res.status(400).json({error:'Ungültiger Wochenbeginn.'});}}
  const calendarId = String(process.env.GOOGLE_CALENDAR_ID || '').trim();
  const apiKey = String(process.env.GOOGLE_CALENDAR_API_KEY || '').trim();
  const icalUrl = String(process.env.GOOGLE_CALENDAR_ICAL_URL || '').trim();
  const serviceAccountConfigured = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
  );
  if (!icalUrl && (!calendarId || (!apiKey && !serviceAccountConfigured))) {
    return res.status(503).json({
      configured: false,
      error: 'Google Calendar ist noch nicht vollständig eingerichtet.',
    });
  }

  try {
    const now = new Date();
    const rangeStart = week?new Date(week+'T00:00:00+02:00'):new Date(now.getTime() - 30 * 86400000);
    const rangeEnd = week?new Date(+rangeStart+8*86400000+3600000):new Date(now.getTime() + 370 * 86400000);
    const result = icalUrl
      ? await readIcalCalendar(icalUrl, rangeStart, rangeEnd)
      : await readGoogleCalendarApi(calendarId, apiKey, serviceAccountConfigured, rangeStart, rangeEnd);
    const { events, calendarName } = result;

    if(week){res.setHeader('Cache-Control','private, no-store');return res.json({events:events.map(({title,start,allDay,cancelled})=>({title,start,allDay,cancelled}))});}
    const syncedAt = new Date().toISOString();
    const eventJson = JSON.stringify(events);
    const settingsJson = JSON.stringify({ calendarLastSync: syncedAt, calendarName });
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
      calendarName,
    });
  } catch (error) {
    console.error('calendar api error', error?.message || error);
    return res.status(502).json({ configured: true, error: error?.message || 'Kalendersynchronisierung ist momentan nicht erreichbar.' });
  }
}
