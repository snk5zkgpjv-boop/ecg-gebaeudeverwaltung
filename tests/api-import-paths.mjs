import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoints = [
  'api/auth/session.js', 'api/auth/login.js', 'api/auth/admin-user.js',
  'api/auth/change-password.js', 'api/auth/forgot-password.js',
  'api/auth/reset-password.js', 'api/auth/migrate.js',
  'api/state.js', 'api/calendar.js', 'api/ai.js', 'api/status.js',
];
for (const endpoint of endpoints) {
  const source = await readFile(resolve(root, endpoint), 'utf8');
  const matches = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)];
  for (const [, target] of matches) {
    if (!target.startsWith('.')) continue;
    const resolved = resolve(root, dirname(endpoint), target);
    await assert.doesNotReject(access(resolved), `Broken module import in ${endpoint}: ${target}`);
  }
}
assert.match(await readFile(resolve(root,'api/auth/session.js'),'utf8'), /from ['"]\.\.\/\.\.\/lib\/db\.js['"]/);
console.log('PASS: API endpoints resolve all relative imports, including auth session database driver. No production access.');
