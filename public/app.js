import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { analyzeWorld } from './analyze.js';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'worlds';
const MAX_BYTES = 50 * 1024 * 1024;
const emailFor = u => `${u.trim().toLowerCase()}@worldshare.example.com`;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = n => { const u=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<3){n/=1024;i++;} return n.toFixed(i?2:0)+' '+u[i]; };
const fmtDate = t => t ? new Date(t).toLocaleString([], {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '-';

let session = null, picked = null;
const username = () => session?.user?.user_metadata?.username || session?.user?.email || '';

function showLogin() { session = null; $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); $('#who').textContent = ''; }
function showApp() { $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden'); $('#who').textContent = 'USER: ' + username(); loadFiles(); }

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginMsg').textContent = 'CHECKING...';
  const { data, error } = await sb.auth.signInWithPassword({ email: emailFor($('#u').value), password: $('#p').value });
  if (error) { $('#loginMsg').textContent = 'ACCESS DENIED. INVALID USER OR PASSWORD.'; return; }
  session = data.session; $('#p').value = ''; $('#loginMsg').textContent = ''; showApp();
});
$('#logout').onclick = async () => { await sb.auth.signOut(); showLogin(); };

document.querySelectorAll('.tabs button[data-tab]').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button[data-tab]').forEach(x => x.classList.toggle('active', x === b));
  ['files','upload','help'].forEach(t => $('#tab-'+t).classList.toggle('hidden', t !== b.dataset.tab));
});

async function loadFiles() {
  $('#listMsg').textContent = '';
  const { data: files, error } = await sb.from('worlds').select('*').order('uploaded_at', { ascending: false });
  if (error) { $('#listMsg').textContent = 'ERROR: ' + error.message; return; }
  const myId = session.user.id;
  $('#count').textContent = files.length + ' FILE(S) ON DISK';
  $('#rows').innerHTML = files.length ? files.map(f => `
    <tr>
      <td>${esc(f.filename)}${f.world_name ? '<br><span class="sub">WORLD: ' + esc(f.world_name) + '</span>' : ''}</td>
      <td>${esc(f.edition).toUpperCase()}</td>
      <td>${esc(f.version)}</td>
      <td>${fmtSize(f.size)}</td>
      <td>${fmtDate(f.file_modified)}${f.last_played ? '<br><span class="sub">LAST PLAYED: ' + fmtDate(f.last_played) + '</span>' : ''}</td>
      <td>${fmtDate(f.uploaded_at)}</td>
      <td>${esc(f.uploaded_by)}</td>
      <td><button data-dl="${f.id}">[ DOWNLOAD ]</button>
          ${f.owner === myId ? `<br><button class="danger" data-del="${f.id}" style="margin-top:4px">[ DELETE ]</button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="8" class="warn">NO FILES YET. USE THE UPLOAD TAB.</td></tr>';
  const byId = Object.fromEntries(files.map(f => [f.id, f]));
  document.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
    const f = byId[b.dataset.dl];
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, { download: f.filename });
    if (error) return alert('DOWNLOAD FAILED: ' + error.message);
    location.href = data.signedUrl;
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('DELETE THIS FILE PERMANENTLY?')) return;
    const f = byId[b.dataset.del];
    const r1 = await sb.storage.from(BUCKET).remove([f.storage_path]);
    if (r1.error) return alert('DELETE FAILED: ' + r1.error.message);
    const r2 = await sb.from('worlds').delete().eq('id', f.id);
    if (r2.error) return alert('DELETE FAILED: ' + r2.error.message);
    loadFiles();
  });
}
$('#refresh').onclick = loadFiles;

function choose(f) { picked = f; $('#chosen').textContent = f ? `SELECTED: ${f.name} (${fmtSize(f.size)})` : ''; $('#go').disabled = !f; }
$('#pick').onclick = () => $('#file').click();
$('#file').onchange = e => choose(e.target.files[0]);
const drop = $('#drop');
['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => choose(e.dataTransfer.files[0]));

const safeName = n => n.replace(/[^\w.\- ()\[\]]+/g, '_').slice(0, 120) || 'world.zip';
const setUp = (msg, cls = '') => { $('#upMsg').className = cls; $('#upMsg').textContent = msg; };

$('#go').onclick = async () => {
  const file = picked; if (!file) return;
  if (file.size > MAX_BYTES) return setUp('FILE TOO LARGE (50 MB MAX ON THE FREE PLAN)', 'err');
  $('#go').disabled = true; $('#bar').style.width = '0';
  setUp('READING WORLD...');
  const info = await analyzeWorld(file, file.name);
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return showLogin();
  const path = `${s.session.user.id}/${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;

  // XHR instead of supabase-js so we get a progress bar.
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`);
  xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + s.session.access_token);
  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  xhr.setRequestHeader('x-upsert', 'false');
  xhr.upload.onprogress = e => { if (e.lengthComputable) {
    const pct = Math.round(e.loaded / e.total * 100); $('#bar').style.width = pct + '%'; setUp(`UPLOADING... ${pct}%`); } };
  xhr.onerror = () => { setUp('NETWORK ERROR', 'err'); $('#go').disabled = false; };
  xhr.onload = async () => {
    if (xhr.status >= 300) {
      let m = ''; try { m = JSON.parse(xhr.responseText).message; } catch (_) {}
      setUp('UPLOAD FAILED: ' + (m || xhr.status), 'err'); $('#go').disabled = false; return;
    }
    const { error } = await sb.from('worlds').insert({
      uploaded_by: username(), filename: file.name, storage_path: path, size: file.size,
      edition: info.edition, version: info.version, world_name: info.worldName || null,
      last_played: info.lastPlayed ? new Date(info.lastPlayed).toISOString() : null,
      file_modified: file.lastModified ? new Date(file.lastModified).toISOString() : null
    });
    if (error) { await sb.storage.from(BUCKET).remove([path]); setUp('SAVE FAILED: ' + error.message, 'err'); $('#go').disabled = false; return; }
    setUp(`DONE. DETECTED: ${info.edition.toUpperCase()} ${info.version}`);
    choose(null); $('#file').value = ''; loadFiles();
  };
  xhr.send(file);
};

sb.auth.getSession().then(({ data }) => { if (data.session) { session = data.session; showApp(); } });
sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') showLogin(); else if (s) session = s; });
