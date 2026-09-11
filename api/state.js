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

function mergeTaskProgress(currentRooms, incomingRooms) {
  const incoming = new Map((incomingRooms || []).map((room) => [room.id, room]));
  return (currentRooms || []).map((room) => {
    const nextRoom = incoming.get(room.id);
    if (!nextRoom) return room;
    return {
      ...room,
      tasks: (room.tasks || []).map((task) => {
        const nextTask = (nextRoom.tasks || []).find((item) => item.id === task.id);
        return nextTask ? { ...task, status: nextTask.status, lastDone: nextTask.lastDone, lastDoneBy: nextTask.lastDoneBy } : task;
      }),
    };
  });
}

function keepExistingTasks(incomingRooms, currentRooms) {
  const current = new Map((currentRooms || []).map((room) => [room.id, room]));
  return (incomingRooms || []).map((room) => ({ ...room, tasks: current.get(room.id)?.tasks || [] }));
}

function mergeTaskDefinitions(currentRooms, incomingRooms) {
  const incoming = new Map((incomingRooms || []).map((room) => [room.id, room]));
  return (currentRooms || []).map((room) => ({ ...room, tasks: incoming.get(room.id)?.tasks || room.tasks || [] }));
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
  if (profile.role === 'admin') return incoming;
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

  if (has(profile, 'manageRooms')) {
    output.rooms = has(profile, 'manageTasks')
      ? (incoming.rooms || current.rooms)
      : keepExistingTasks(incoming.rooms, current.rooms);
    output.outdoorAreas = has(profile, 'manageTasks')
      ? (incoming.outdoorAreas || current.outdoorAreas)
      : keepExistingTasks(incoming.outdoorAreas, current.outdoorAreas);
  } else if (has(profile, 'manageTasks')) {
    output.rooms = mergeTaskDefinitions(current.rooms, incoming.rooms);
    output.outdoorAreas = mergeTaskDefinitions(current.outdoorAreas, incoming.outdoorAreas);
  } else {
    output.rooms = mergeTaskProgress(current.rooms, incoming.rooms);
    output.outdoorAreas = mergeTaskProgress(current.outdoorAreas, incoming.outdoorAreas);
  }
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
