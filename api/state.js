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

const has = (profile, key) => profile.role === 'admin' || (profile.permissions?.[key] ?? defaults[profile.role]?.[key] ?? false);
const clone = (value) => structuredClone(value || {});

function visible(state, profile) {
  if (profile.role === 'admin') return state;
  const output = clone(state);
  const userId = profile.id;
  if (!has(profile, 'manageUsers')) output.users = (state.users || []).filter((user) => user.id === userId);
  if (!has(profile, 'viewAllTimes')) output.timeEntries = (state.timeEntries || []).filter((entry) => entry.userId === userId);
  if (!has(profile, 'viewAllTimes') && output.timeRunning?.userId !== userId) output.timeRunning = null;
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

function mergeTaskProgress(currentRooms, incomingRooms, { acceptRooms = false, acceptTasks = false } = {}) {
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
      tasks: taskSource.map((task) => mergeNewestTaskProgress(
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
  if (profile.role === 'admin') {
    return {
      ...incoming,
      rooms: mergeTaskProgress(current.rooms, incoming.rooms, { acceptRooms: true, acceptTasks: true }),
      outdoorAreas: mergeTaskProgress(current.outdoorAreas, incoming.outdoorAreas, { acceptRooms: true, acceptTasks: true }),
    };
  }
  const output = clone(current);
  const userId = profile.id;

  if (has(profile, 'viewAllTimes')) {
    output.timeEntries = incoming.timeEntries || current.timeEntries;
    output.timeRunning = incoming.timeRunning || null;
  } else {
    output.timeEntries = [
      ...(current.timeEntries || []).filter((entry) => entry.userId !== userId),
      ...(incoming.timeEntries || []).filter((entry) => entry.userId === userId),
    ];
    output.timeRunning = incoming.timeRunning?.userId === userId
      ? incoming.timeRunning
      : (current.timeRunning?.userId === userId ? null : current.timeRunning);
  }

  output.eventTaskDone = { ...(current.eventTaskDone || {}), ...(incoming.eventTaskDone || {}) };
  output.issues = has(profile, 'manageIssues')
    ? (incoming.issues || current.issues)
    : mergeReportedIssues(current.issues, incoming.issues, userId);

  if (has(profile, 'manageUsers')) output.users = mergeManagedUsers(current.users, incoming.users, profile);

  const acceptRooms = has(profile, 'manageRooms');
  const acceptTasks = has(profile, 'manageTasks');
  output.rooms = mergeTaskProgress(current.rooms, incoming.rooms, { acceptRooms, acceptTasks });
  output.outdoorAreas = mergeTaskProgress(current.outdoorAreas, incoming.outdoorAreas, { acceptRooms, acceptTasks });
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
    if (req.method === 'GET') return res.status(200).json(visible(auth.state, auth.profile));
    if (req.method === 'PUT') {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Ungültige Daten' });
      }
      const next = accepted(auth.state, req.body, auth.profile);
      const payload = JSON.stringify(next);
      const rows = await sql`UPDATE app_state SET data=${payload}::jsonb,revision=revision+1,updated_at=now() WHERE id='main' RETURNING revision,updated_at`;

      const url = process.env.ORGANIZATION_API_URL;
      const token = process.env.ORGANIZATION_SYNC_TOKEN;
      const email = (process.env.ORGANIZATION_SYNC_USER_EMAIL || '').trim().toLowerCase();
      if (url && token && email) {
        const ids = new Set((next.users || []).filter((user) => (user.email || '').trim().toLowerCase() === email).map((user) => user.id));
        const entries = (next.timeEntries || []).filter((entry) => ids.has(entry.userId));
        await fetch(`${url.replace(/\/$/, '')}/api/organization/ecg-sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ entries }),
        }).catch((error) => console.error('organization sync error', error?.message || error));
      }
      return res.status(200).json({ ok: true, ...rows[0] });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (error) {
    console.error('state api error', error);
    return res.status(500).json({ error: 'Datenbankfehler' });
  }
}
