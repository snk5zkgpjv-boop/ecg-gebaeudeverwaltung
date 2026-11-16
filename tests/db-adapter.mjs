import assert from 'node:assert/strict';
import { neon as providerNeon } from '@neondatabase/serverless';
import { neon as ecgNeon } from '../lib/db.js';
assert.strictEqual(ecgNeon, providerNeon, 'database adapter must preserve the existing tag API');
console.log('PASS: database driver uses a single-compatible import boundary. No external database accessed.');
