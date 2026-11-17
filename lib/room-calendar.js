// Pure room matching: never guess from partial names; require an unambiguous exact alias.
export function normalizeRoomLocation(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('de-DE')
    .replace(/\b(?:nr\.?|nummer)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function matchCalendarRoom(event, rooms) {
  if (event?.cancelled) return { status: 'cancelled', roomId: null };
  const declaredId = String(event?.googleRoomId || '').trim();
  if (declaredId) return (rooms || []).some(room => room?.id === declaredId)
    ? { status: 'matched', roomId: declaredId }
    : { status: 'unknown', roomId: null };
  const location = normalizeRoomLocation(event?.location);
  if (!location) return { status: 'missing', roomId: null };
  const matches = (rooms || []).filter(room => {
    if (!room?.id) return false;
    const aliases = [room.name, room.number, ...(Array.isArray(room.calendarAliases) ? room.calendarAliases : [])];
    return aliases.some(value => normalizeRoomLocation(value) === location && location);
  });
  if (matches.length === 1) return { status: 'matched', roomId: matches[0].id };
  return { status: matches.length ? 'ambiguous' : 'unknown', roomId: null };
}
export function attachCalendarRooms(events, rooms) {
  return (events || []).map(event => {
    const match = matchCalendarRoom(event, rooms);
    return { ...event, roomId: match.roomId, roomMatchStatus: match.status };
  });
}
