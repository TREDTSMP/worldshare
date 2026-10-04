// Reads a Minecraft world zip IN THE BROWSER (no upload needed) and detects edition + version.
// Works in modern browsers and Node 18+ (uses DecompressionStream).

async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseNBT(u8, le) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const td = new TextDecoder();
  let p = 0;
  const i8 = () => dv.getInt8(p++);
  const u8r = () => dv.getUint8(p++);
  const i16 = () => { const v = dv.getInt16(p, le); p += 2; return v; };
  const u16 = () => { const v = dv.getUint16(p, le); p += 2; return v; };
  const i32 = () => { const v = dv.getInt32(p, le); p += 4; return v; };
  const i64 = () => { const v = dv.getBigInt64(p, le); p += 8; return Number(v); };
  const f32 = () => { const v = dv.getFloat32(p, le); p += 4; return v; };
  const f64 = () => { const v = dv.getFloat64(p, le); p += 8; return v; };
  const str = () => { const n = u16(); const s = td.decode(u8.subarray(p, p + n)); p += n; return s; };
  function payload(t) {
    switch (t) {
      case 1: return i8();
      case 2: return i16();
      case 3: return i32();
      case 4: return i64();
      case 5: return f32();
      case 6: return f64();
      case 7: { const n = i32(); p += n; return null; }
      case 8: return str();
      case 9: { const it = u8r(); const n = i32(); const a = []; for (let k = 0; k < n; k++) a.push(payload(it)); return a; }
      case 10: { const o = {}; for (;;) { const tt = u8r(); if (tt === 0) break; const name = str(); o[name] = payload(tt); } return o; }
      case 11: { const n = i32(); p += 4 * n; return null; }
      case 12: { const n = i32(); p += 8 * n; return null; }
      default: throw new Error('bad nbt tag ' + t);
    }
  }
  const t = u8r(); str();
  return payload(t);
}

async function readSlice(blob, start, len) {
  return new Uint8Array(await blob.slice(start, start + len).arrayBuffer());
}

export async function analyzeWorld(blob, filename = '') {
  const info = { edition: 'Unknown', version: 'Unknown', worldName: '', lastPlayed: null };
  try {
    const size = blob.size;
    const tailLen = Math.min(size, 65557 + 22);
    const tail = await readSlice(blob, size - tailLen, tailLen);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { e = i; break; }
    }
    if (e < 0) return info;
    const tdv = new DataView(tail.buffer, tail.byteOffset);
    const total = tdv.getUint16(e + 10, true), cdSize = tdv.getUint32(e + 12, true), cdOff = tdv.getUint32(e + 16, true);
    if (cdOff === 0xffffffff) { info.version = 'Unknown (zip64)'; return info; }
    const cd = await readSlice(blob, cdOff, cdSize);
    const dv = new DataView(cd.buffer, cd.byteOffset);
    const td = new TextDecoder();
    const entries = [];
    let p = 0;
    for (let i = 0; i < total && p + 46 <= cd.length; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      entries.push({ name: td.decode(cd.subarray(p + 46, p + 46 + nlen)), method, csize, lho });
      p += 46 + nlen + elen + clen;
    }
    const names = entries.map(x => x.name);
    const isBedrock = /\.mcworld$/i.test(filename) || names.some(n => /(^|\/)levelname\.txt$/.test(n)) ||
      names.some(n => /(^|\/)db\/[^/]+\.ldb$/.test(n));
    const hasRegion = names.some(n => /(^|\/)region\/r\.-?\d+\.-?\d+\.mc[ar]$/.test(n));
    const lvl = entries
      .filter(x => /(^|\/)level\.dat$/.test(x.name) && !/DIM|datapacks|playerdata/i.test(x.name))
      .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
    if (isBedrock && !hasRegion) info.edition = 'Bedrock';
    else if (hasRegion || lvl) info.edition = 'Java';
    if (!lvl || lvl.csize > 8 * 1024 * 1024) return info;

    const lh = await readSlice(blob, lvl.lho, 30);
    const ldv = new DataView(lh.buffer, lh.byteOffset);
    const start = lvl.lho + 30 + ldv.getUint16(26, true) + ldv.getUint16(28, true);
    const raw = await readSlice(blob, start, lvl.csize);
    let data = lvl.method === 8 ? await inflate(raw, 'deflate-raw') : raw;

    if (info.edition === 'Bedrock') {
      const root = parseNBT(data.subarray(8), true);
      info.worldName = root.LevelName || '';
      if (Array.isArray(root.lastOpenedWithVersion)) info.version = root.lastOpenedWithVersion.slice(0, 3).join('.');
      if (root.LastPlayed) info.lastPlayed = root.LastPlayed * 1000;
    } else {
      if (data[0] === 0x1f && data[1] === 0x8b) data = await inflate(data, 'gzip');
      const d = parseNBT(data, false).Data || {};
      info.worldName = d.LevelName || '';
      if (d.Version && d.Version.Name) info.version = d.Version.Name;
      else if (d.version) info.version = 'Pre-1.9 (legacy)';
      if (d.LastPlayed) info.lastPlayed = d.LastPlayed;
    }
  } catch (err) {
    console.warn('analyzeWorld failed:', err);
  }
  return info;
}
