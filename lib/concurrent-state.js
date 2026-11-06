import { isDeepStrictEqual as equal } from 'node:util';

const keyed = list => Array.isArray(list) && list.every(item => typeof item?.id === 'string')
  && new Set(list.map(item => item.id)).size === list.length;

function mergeValue(base, local, current, field) {
  if (equal(local, base)) return current;
  if (equal(current, base) || equal(current, local)) return local;
  if ([base, local, current].every(keyed)) {
    const before = new Map(base.map(item => [item.id, item]));
    const edits = new Map(local.map(item => [item.id, item]));
    const latest = new Map(current.map(item => [item.id, item]));
    // Preserve the current order, then append local additions.
    const ids = new Set([...latest.keys(), ...edits.keys(), ...before.keys()]);
    return [...ids].map(id => mergeValue(before.get(id), edits.get(id), latest.get(id), field)).filter(Boolean);
  }
  throw new Error('Gleichzeitige Änderung im Bereich ' + field + '. Bitte den aktuellen Stand öffnen und die Änderung vergleichen.');
}

export function applyStateChanges(current, changes) {
  const result = { ...current };
  for (const [field, edit] of Object.entries(changes)) {
    if (['__proto__', 'constructor', 'prototype'].includes(field) || !edit || typeof edit !== 'object') throw new Error('Ungültige Änderung.');
    result[field] = mergeValue(edit.before, edit.after, current[field], field);
  }
  return result;
}
