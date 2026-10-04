// One-time helper: creates (or resets the password of) the 4 accounts in Supabase.
// Runs on YOUR computer only. The service-role key never goes to GitHub or Cloudflare.
//
//   1. copy scripts/users.local.example.json -> scripts/users.local.json and fill in passwords
//   2. SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/create-users.mjs
//
// Node 18+ required. users.local.json is git-ignored.
import fs from 'node:fs';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const users = JSON.parse(fs.readFileSync(new URL('./users.local.json', import.meta.url), 'utf8'));
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const emailFor = u => `${u.toLowerCase()}@worldshare.example.com`; // must match public/app.js

async function call(method, path, body) {
  const r = await fetch(`${URL_}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

for (const [username, password] of Object.entries(users)) {
  if (!password || password.startsWith('CHANGE_ME')) { console.log(`skip ${username}: no password set`); continue; }
  const email = emailFor(username);
  let res = await call('POST', '/admin/users', { email, password, email_confirm: true, user_metadata: { username } });
  if (res.status === 422 || res.status === 409) {
    const list = await call('GET', '/admin/users?per_page=200');
    const existing = (list.j.users || []).find(x => x.email === email);
    if (existing) res = await call('PUT', `/admin/users/${existing.id}`, { password, user_metadata: { username } });
  }
  console.log(res.status < 300 ? `ok   ${username}` : `FAIL ${username}: ${JSON.stringify(res.j)}`);
}
