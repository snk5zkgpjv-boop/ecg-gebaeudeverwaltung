import { neon } from '@neondatabase/serverless';
import { requireUser } from '../lib/auth.js';

const defaults = {
  coordinator: {
    manageRooms: true,
    manageTasks: true,
    manageInventory: true,
    manageCalendar: true,
    manageIssues: true,
    useAI: true,
    viewMaintenance: false,
    manageMaintenance: false,
    manageUsers: false,
    viewAllTimes: false,
  },
  technician: { viewMaintenance: true, manageMaintenance: true },
};

const has = (profile, key) => profile.role === 'technician'
  ? ['viewMaintenance', 'manageMaintenance', 'manageInventory'].includes(key)
  : profile.role === 'admin' || (profile.permissions?.[key] ?? defaults[profile.role]?.[key] ?? false);
const clone = (value) => structuredClone(value || {});

function visible(state, profile) {
  const output = clone(state);
  delete output.kitchenPhotos;
  const userId = profile.id;
  const sharedIds = new Set((state.users || []).filter(user => user.active !== false && state.timeSharing?.[user.id] === true).map(user => user.id));
  output.timeEntries = (state.timeEntries || []).filter(entry => entry.userId === userId || sharedIds.has(entry.userId));
  // Running timers belong only to their owner.
  if (output.timeRunning?.userId !== userId) output.timeRunning = null;
  output.myTimeSharing = state.timeSharing?.[userId] === true;
  output.myIssuePlanning = clone(state.issuePlanning?.[userId] || {});
  output.sharedTimeUsers = (state.users || []).filter(user => sharedIds.has(user.id)).map(user => ({ id: user.id, name: user.name }));
  delete output.timeSharing;
  delete output.issuePlanning;
  if (profile.role === 'technician') {
    output.timeEntries = [];
    output.timeRunning = null;
    output.myTimeSharing = false;
    output.myIssuePlanning = {};
    output.sharedTimeUsers = [];
  }
  if (profile.role === 'admin') return output;
  if (!has(profile, 'manageUsers')) output.users = (state.users || []).filter(user => user.id === userId);
  if (!has(profile, 'viewMaintenance')) delete output.maintenanceAssets;
  if (!has(profile, 'manageCalendar')) {
    for (const key of ['calendarEvents', 'eventRules', 'eventChecklists', 'eventDocumentSettings']) delete output[key];
  }
  return output;
}

const progressFields = ['status', 'lastDone', 'lastDoneBy', 'progressUpdatedAt'];

function progressTime(task) {
  const value = task?.progressUpdatedAt || task?.lastDone;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function mergeNewestTaskProgress(baseTask, currentTask, incomingTask) {
  if (!currentTask || !incomingTask) return baseTask;
  const source = progressTime(incomingTask) >= progressTime(currentTask) ? incomingTask : currentTask;
  const merged = { ...baseTask };
  for (const key of progressFields) {
    if (source[key] !== undefined) merged[key] = source[key];
  }
  return merged;
}

function mergeTaskProgress(currentRooms, incomingRooms, { acceptRooms = false, acceptTasks = false, technicalOnly = false } = {}) {
  const current = new Map((currentRooms || []).map((room) => [room.id, room]));
  const incoming = new Map((incomingRooms || []).map((room) => [room.id, room]));
  const roomSource = acceptRooms ? (incomingRooms || []) : (currentRooms || []);
  return roomSource.map((sourceRoom) => {
    const currentRoom = current.get(sourceRoom.id);
    const incomingRoom = incoming.get(sourceRoom.id);
    if (!currentRoom || !incomingRoom) return sourceRoom;
    const taskSource = acceptTasks ? (incomingRoom.tasks || []) : (currentRoom.tasks || []);
    const currentTasks = new Map((currentRoom.tasks || []).map((task) => [task.id, task]));
    const incomingTasks = new Map((incomingRoom.tasks || []).map((task) => [task.id, task]));
    return {
      ...sourceRoom,
      tasks: taskSource.map((task) => technicalOnly && (currentTasks.get(task.id)?.taskType !== 'technical' || currentTasks.get(task.id)?.event) ? task : mergeNewestTaskProgress(
        task,
        currentTasks.get(task.id),
        incomingTasks.get(task.id),
      )),
    };
  });
}

function mergeReportedIssues(currentIssues, incomingIssues, userId) {
  const known = new Set((currentIssues || []).map((issue) => issue.id));
  const created = (incomingIssues || [])
    .filter((issue) => issue?.id && !known.has(issue.id))
    .map((issue) => ({ ...issue, createdBy: userId }));
  return [...created, ...(currentIssues || [])];
}

function mergeManagedUsers(currentUsers, incomingUsers, profile) {
  if (profile.role === 'admin') return incomingUsers || currentUsers;

  const current = currentUsers || [];
  const incoming = incomingUsers || current;
  const protectedIds = new Set(current.filter((user) => user.role === 'admin' || user.id === profile.id).map((user) => user.id));
  const allowedPermissions = Object.keys(defaults.coordinator).filter((key) => key !== 'manageUsers' && has(profile, key));
  const limitPermissions = (permissions = {}) => Object.fromEntries(
    Object.keys(defaults.coordinator).map((key) => [key, allowedPermissions.includes(key) && permissions[key] === true]),
  );

  const preserved = current.filter((user) => protectedIds.has(user.id));
  const managed = incoming
    .filter((user) => user?.id && !protectedIds.has(user.id) && user.role !== 'admin')
    .map((user) => ({ ...user, permissions: limitPermissions(user.permissions) }));

  // Delegierte Benutzerverwalter dürfen weder Administratoren noch das eigene
  // Konto verändern oder entfernen und keine höheren Rechte weitergeben.
  return [...preserved, ...managed];
}

function accepted(current, incoming, profile) {
  // A tab from before task separation must not reintroduce event templates into room tasks.
  const currentKitchen = current.eventDocumentSettings?.kitchen;
  if (currentKitchen?.taskLayoutVersion && (incoming.eventDocumentSettings?.kitchen?.taskLayoutVersion || 0) < currentKitchen.taskLayoutVersion) {
    incoming = clone(incoming);
    incoming.eventDocumentSettings = { ...incoming.eventDocumentSettings, kitchen: currentKitchen };
    const room = current.rooms?.find(r => r.id === currentKitchen.roomId);
    if (room) incoming.rooms = [...(incoming.rooms || []).filter(r => r.id !== room.id), clone(room)];
  }
  // Older open tabs must not remove the newly installed kitchen data.
  if (current.eventDocumentSettings?.kitchen && !incoming.eventDocumentSettings?.kitchen) {
    incoming = clone(incoming);
    incoming.eventDocumentSettings = { ...incoming.eventDocumentSettings, kitchen: current.eventDocumentSettings.kitchen };
    for (const key of ['rooms','maintenanceAssets','inventory','storageLocations']) {
      const items = incoming[key] || [];
      const ids = new Set(items.map(x => x.id));
      incoming[key] = [...items, ...(current[key] || []).filter(x => !ids.has(x.id) && (x.kitchenArea || /^(kitchen-|ecg-kitchen)/.test(x.id)))];
    }
    const roomId = current.eventDocumentSettings.kitchen.roomId;
    const oldRoom = current.rooms?.find(x => x.id === roomId);
    const newRoom = incoming.rooms?.find(x => x.id === roomId);
    if (oldRoom && newRoom) {
      newRoom.kitchenArea = true;
      const ids = new Set((newRoom.tasks || []).map(x => x.id));
      newRoom.tasks = [...(newRoom.tasks || []), ...oldRoom.tasks.filter(x => x.kitchenTask && !ids.has(x.id))];
    }
  }
  if (current.eventDocumentSettings?.kitchen?.updatedAt && new Date(current.eventDocumentSettings.kitchen.updatedAt) > new Date(incoming.eventDocumentSettings?.kitchen?.updatedAt || 0)) {
    incoming = { ...incoming, eventDocumentSettings: { ...incoming.eventDocumentSettings, kitchen: current.eventDocumentSettings.kitchen } };
  }
  // Keep newer event checklists (including kitchen assignments) across stale tabs.
  if (incoming.eventChecklists && current.eventChecklists) {
    const currentMap = new Map(current.eventChecklists.map(x => [x.id,x]));
    incoming = { ...incoming, eventChecklists: incoming.eventChecklists.map(x => {
      const old = currentMap.get(x.id);
      return old && new Date(old.updatedAt) > new Date(x.updatedAt || 0) ? old : x;
    }) };
    const ids = new Set(incoming.eventChecklists.map(x => x.id));
    incoming.eventChecklists.push(...current.eventChecklists.filter(x => x.kitchen && !ids.has(x.id)));
  }
  // A shared entry is read-only. Preserve other owners' entries even for stale/admin payloads.
  const userId = profile.id;
  const foreignIds = new Set((current.timeEntries || []).filter(entry => entry.userId !== userId).map(entry => entry.id));
  const timeEntries = [
    ...(current.timeEntries || []).filter(entry => entry.userId !== userId),
    ...(incoming.timeEntries || current.timeEntries || []).filter(entry => entry.userId === userId && !foreignIds.has(entry.id)),
  ];
  const timeRunning = incoming.timeRunning?.userId === userId
    ? incoming.timeRunning
    : (current.timeRunning?.userId === userId ? null : current.timeRunning);
  if (profile.role === 'admin') {
    return {
      ...incoming,
      timeEntries,
      timeRunning,
      timeSharing: current.timeSharing || {},
      issuePlanning: current.issuePlanning || {},
      myTimeSharing: undefined,
      sharedTimeUsers: undefined,
      kitchenPhotos: current.kitchenPhotos,
      rooms: mergeTaskProgress(current.rooms, incoming.rooms, { acceptRooms: true, acceptTasks: true }),
      outdoorAreas: mergeTaskProgress(current.outdoorAreas, incoming.outdoorAreas, { acceptRooms: true, acceptTasks: true }),
    };
  }
  const output = clone(current);
  output.issuePlanning = current.issuePlanning || {};
  output.timeEntries = profile.role === 'technician' ? current.timeEntries : timeEntries;
  output.timeRunning = profile.role === 'technician' ? current.timeRunning : timeRunning;

  output.eventTaskDone = profile.role === 'technician' ? current.eventTaskDone : { ...(current.eventTaskDone || {}), ...(incoming.eventTaskDone || {}) };
  output.issues = has(profile, 'manageIssues')
    ? (incoming.issues || current.issues)
    : mergeReportedIssues(current.issues, incoming.issues, userId);

  if (has(profile, 'manageUsers')) output.users = mergeManagedUsers(current.users, incoming.users, profile);

  const acceptRooms = has(profile, 'manageRooms');
  const acceptTasks = has(profile, 'manageTasks');
  output.rooms = mergeTaskProgress(current.rooms, incoming.rooms, { acceptRooms, acceptTasks, technicalOnly: profile.role === 'technician' });
  output.outdoorAreas = mergeTaskProgress(current.outdoorAreas, incoming.outdoorAreas, { acceptRooms, acceptTasks, technicalOnly: profile.role === 'technician' });
  if (has(profile, 'manageTasks')) output.templates = incoming.templates || current.templates;

  if (has(profile, 'manageInventory')) {
    for (const key of ['inventory', 'materials', 'storageLocations', 'loans', 'shopping']) output[key] = incoming[key] || current[key];
  }
  if (has(profile, 'manageCalendar')) {
    for (const key of ['calendarEvents', 'eventRules', 'eventChecklists', 'eventDocumentSettings']) output[key] = incoming[key] || current[key];
  }
  if (has(profile, 'manageMaintenance')) output.maintenanceAssets = incoming.maintenanceAssets || current.maintenanceAssets;
  return output;
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL fehlt' });
  const sql = neon(process.env.DATABASE_URL);
  const auth = await requireUser(req, res, sql);
  if (!auth) return;

  try {
    if (req.method === 'GET' && req.query?.kitchenPhoto) {
      const name = String(req.query.kitchenPhoto);
      const photos = auth.state.kitchenPhotos || {};
      const photo = Object.hasOwn(photos, name) ? photos[name] : null;
      if (typeof photo !== 'string' || !/^[a-zA-Z0-9+/=]+$/.test(photo)) return res.status(404).end();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(Buffer.from(photo, 'base64'));
    }
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'GET') return res.status(200).json(visible(auth.state, auth.profile));
    if (req.method === 'PATCH') {
      if (auth.profile.role === 'technician') return res.status(403).json({ error: 'Persönliche Planung ist für die Technikrolle nicht freigeschaltet.' });
      if (typeof req.body?.shareTimes === 'boolean' && Object.keys(req.body).every(key => key === 'shareTimes')) {
        const preference = JSON.stringify({ [auth.profile.id]: req.body.shareTimes });
        await sql`UPDATE app_state SET data=jsonb_set(data,'{timeSharing}',COALESCE(data->'timeSharing','{}'::jsonb) || ${preference}::jsonb),revision=revision+1,updated_at=now() WHERE id='main'`;
        return res.status(200).json({ ok: true, shareTimes: req.body.shareTimes });
      }
      if (req.body?.issuePlan && Object.keys(req.body).every(key => key === 'issuePlan')) {
        const raw = req.body.issuePlan;
        const issueId = String(raw.issueId || '');
        const issue = (auth.state.issues || []).find(item => item.id === issueId);
        if (!issue) return res.status(404).json({ error: 'Hinweis nicht gefunden.' });
        const estimatedMinutes = raw.estimatedMinutes === null || raw.estimatedMinutes === '' ? null : Number(raw.estimatedMinutes);
        if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 1440)) {
          return res.status(400).json({ error: 'Zeitaufwand muss zwischen 5 und 1440 Minuten liegen.' });
        }
        const planningPriority = ['normal','diese_woche','dringend'].includes(raw.planningPriority) ? raw.planningPriority : 'normal';
        const plan = {
          estimatedMinutes,
          planningPriority,
          note: String(raw.note || '').slice(0, 1000),
          blocked: raw.blocked === true,
          updatedAt: new Date().toISOString(),
        };
        const userId = auth.profile.id;
        const nextUserPlans = { ...(auth.state.issuePlanning?.[userId] || {}), [issueId]: plan };
        const nextPlanning = { ...(auth.state.issuePlanning || {}), [userId]: nextUserPlans };
        const payload = JSON.stringify(nextPlanning);
        await sql`UPDATE app_state SET data=jsonb_set(data,'{issuePlanning}',${payload}::jsonb),revision=revision+1,updated_at=now() WHERE id='main'`;

        const url = process.env.ORGANIZATION_API_URL;
        const token = process.env.ORGANIZATION_SYNC_TOKEN;
        const ownerEmail = (process.env.ORGANIZATION_SYNC_USER_EMAIL || '').trim().toLowerCase();
        if (url && token && ownerEmail) {
          const room = (auth.state.rooms || []).find(item => item.id === issue.roomId);
          const outdoor = (auth.state.outdoorAreas || []).find(item => item.id === issue.outdoorId);
          const asset = (auth.state.inventory || []).find(item => item.id === issue.assetId);
          const location = room ? `${room.floor || ''} – ${room.name || ''}`.replace(/^ – | – $/g,'') : outdoor?.name || (asset ? `Inventar – ${asset.name}` : 'Allgemein');
          const response = await fetch(`${url.replace(/\/$/, '')}/api/organization/ecg-planning-sync`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ ownerEmail, plan: { issueId, title: issue.text || 'ECG Hinweis', location, issuePriority: issue.priority || 'normal', issueStatus: issue.status || 'open', ...plan } }),
          }).catch((error) => { console.error('organization planning sync error', error?.message || error); return null; });
          if (response && !response.ok) console.error('organization planning sync rejected', response.status);
        }
        return res.status(200).json({ ok: true, issueId, plan });
      }
      return res.status(400).json({ error: 'Ungültige persönliche Einstellung.' });
    }
    if (req.method === 'PUT') {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Ungültige Daten' });
      }
      const next = accepted(auth.state, req.body, auth.profile);
      next.issuePlanning = auth.state.issuePlanning || {};
      const payload = JSON.stringify(next);
      const rows = await sql`UPDATE app_state SET data=jsonb_set(${payload}::jsonb,'{timeSharing}',COALESCE(data->'timeSharing','{}'::jsonb)),revision=revision+1,updated_at=now() WHERE id='main' RETURNING revision,updated_at`;

      const url = process.env.ORGANIZATION_API_URL;
      const token = process.env.ORGANIZATION_SYNC_TOKEN;
      const email = (process.env.ORGANIZATION_SYNC_USER_EMAIL || '').trim().toLowerCase();
      if (url && token && email) {
        const ids = new Set((next.users || []).filter((user) => (user.email || '').trim().toLowerCase() === email).map((user) => user.id));
        const entries = (next.timeEntries || []).filter((entry) => ids.has(entry.userId));
        await fetch(`${url.replace(/\/$/, '')}/api/organization/ecg-sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ ownerEmail: email, entries }),
        }).catch((error) => console.error('organization sync error', error?.message || error));
      }
      return res.status(200).json({ ok: true, ...rows[0] });
    }
    res.setHeader('Allow', 'GET, PUT, PATCH');
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (error) {
    console.error('state api error', error);
    return res.status(500).json({ error: 'Datenbankfehler' });
  }
}
