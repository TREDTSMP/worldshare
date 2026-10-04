// Changes the login email of the 4 accounts in Supabase (no confirmation emails are sent).
// Put this file in the worldshare-cloud/scripts folder, then run:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SECRET_KEY="sb_secret_..."      (your NEW secret key; never paste it in chat or GitHub)
//   node scripts/update-emails.mjs
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY'); process.exit(1); }
if (KEY.startsWith('sb_publishable_') || KEY.includes('"role":"anon"')) { console.error('That is a public key. Use the secret key.'); process.exit(1); }

const NEW_EMAILS = {
  'Ishaan_2011':      'ishaan.das21@gmail.com',
  'SuperSon3AA':      'supersonaa6@gmail.com',
  'hemang_chugh':     'hemang.chugh0809@gmail.com',
  'TREDT_Gaming2009': 'soumya.deep.das.tredt@gmail.com'
};

const headers = { apikey: KEY, 'Content-Type': 'application/json' };
if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;
const call = async (method, path, body) => {
  const r = await fetch(`${URL_}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

const list = await call('GET', '/admin/users?per_page=200');
if (list.status !== 200) { console.error('Could not list users:', JSON.stringify(list.j)); process.exit(1); }

for (const [username, email] of Object.entries(NEW_EMAILS)) {
  const u = (list.j.users || []).find(x => (x.user_metadata?.username || '').toLowerCase() === username.toLowerCase());
  if (!u) { console.log(`FAIL ${username}: user not found`); continue; }
  const res = await call('PUT', `/admin/users/${u.id}`, { email, email_confirm: true });
  console.log(res.status < 300 ? `ok   ${username} -> ${email}` : `FAIL ${username}: ${JSON.stringify(res.j)}`);
}
