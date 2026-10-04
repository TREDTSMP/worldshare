// 1) Puts each account's login email back to  <username>@worldshare.example.com  (so username login works again)
// 2) Stores the player's real Gmail on the account as "contact_email" (a note; not used for login)
// Passwords are not touched.
// Put this file in worldshare-cloud/scripts, then run:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SECRET_KEY="sb_secret_..."      (never paste it in chat or GitHub)
//   node scripts/restore-and-store.mjs
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY'); process.exit(1); }
if (KEY.startsWith('sb_publishable_') || KEY.includes('"role":"anon"')) { console.error('That is a public key. Use the secret key.'); process.exit(1); }

const CONTACT = {
  'Ishaan_2011':      'ishaan.das21@gmail.com',
  'SuperSon3AA':      'supersonaa6@gmail.com',
  'hemang_chugh':     'hemang.chugh0809@gmail.com',
  'TREDT_Gaming2009': 'soumya.deep.das.tredt@gmail.com'
};
const loginEmail = u => `${u.toLowerCase()}@worldshare.example.com`;

const headers = { apikey: KEY, 'Content-Type': 'application/json' };
if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
const call = async (method, path, body) => {
  const r = await fetch(`${URL_}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

const list = await call('GET', '/admin/users?per_page=200');
if (list.status !== 200) { console.error('Could not list users:', JSON.stringify(list.j)); process.exit(1); }

for (const [username, gmail] of Object.entries(CONTACT)) {
  const u = (list.j.users || []).find(x => (x.user_metadata?.username || '').toLowerCase() === username.toLowerCase());
  if (!u) { console.log(`FAIL ${username}: user not found`); continue; }
  const res = await call('PUT', `/admin/users/${u.id}`, {
    email: loginEmail(username), email_confirm: true, app_metadata: { contact_email: gmail }
  });
  console.log(res.status < 300 ? `ok   ${username}: login = ${loginEmail(username)}, contact = ${gmail}` : `FAIL ${username}: ${JSON.stringify(res.j)}`);
}
