// PaceLab — IndexedDB storage (all data stays on the phone).
const DB_NAME = 'pacelab';
const DB_VER = 2;
const STORES = ['players', 'deliveries', 'frames', 'videos', 'snaps', 'strips'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      const tx = req.transaction;
      if (!tx.objectStore('deliveries').indexNames.contains('playerId')) tx.objectStore('deliveries').createIndex('playerId', 'playerId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function wrap(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
async function store(name, mode = 'readonly') { const db = await open(); return db.transaction(name, mode).objectStore(name); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function put(name, obj) { return wrap((await store(name, 'readwrite')).put(obj)); }
export async function get(name, id) { return wrap((await store(name)).get(id)); }
export async function del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); }
export async function all(name) { return wrap((await store(name)).getAll()); }

export async function listPlayers() {
  return (await all('players')).sort((a, b) => a.name.localeCompare(b.name));
}
export async function deliveriesFor(playerId) {
  const s = await store('deliveries');
  const list = await wrap(s.index('playerId').getAll(playerId));
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
}
export async function deleteDelivery(id) {
  await Promise.all(['deliveries', 'frames', 'videos', 'snaps', 'strips'].map(s => del(s, id)));
}
export async function deletePlayer(id) {
  for (const d of await deliveriesFor(id)) await deleteDelivery(d.id);
  await del('players', id);
}

export async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
  return false;
}
export async function storageEstimate() {
  try { return await navigator.storage.estimate(); } catch (e) { return null; }
}

// ---------- backup ----------
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = str => { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
const dataURLToBlob = async u => (await fetch(u)).blob();

export async function exportBackup() {
  const out = { app: 'PaceLab', version: 1, exported: new Date().toISOString(), players: await all('players'), deliveries: await all('deliveries'), frames: [], snaps: [] };
  for (const f of await all('frames')) out.frames.push({ id: f.id, n: f.n, t: b64(f.t.buffer), lm: b64(f.lm.buffer), wl: b64(f.wl.buffer), ok: b64(f.ok.buffer) });
  for (const s of await all('snaps')) {
    const o = { id: s.id, frames: s.frames || {}, imgs: {} };
    for (const k in s.imgs) o.imgs[k] = await blobToDataURL(s.imgs[k]);
    out.snaps.push(o);
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'PaceLab') throw new Error('Not a PaceLab backup file');
  for (const p of data.players) await put('players', p);
  for (const d of data.deliveries) await put('deliveries', d);
  for (const f of data.frames) await put('frames', { id: f.id, n: f.n, t: new Float64Array(unb64(f.t)), lm: new Float32Array(unb64(f.lm)), wl: new Float32Array(unb64(f.wl)), ok: new Uint8Array(unb64(f.ok)) });
  for (const s of data.snaps) { const imgs = {}; for (const k in s.imgs) imgs[k] = await dataURLToBlob(s.imgs[k]); await put('snaps', { id: s.id, frames: s.frames || {}, imgs }); }
  return { players: data.players.length, deliveries: data.deliveries.length };
}

// Pack/unpack per-frame pose data compactly.
export function packFrames(id, frames) {
  const n = frames.length;
  const t = new Float64Array(n), lm = new Float32Array(n * 132), wl = new Float32Array(n * 99), ok = new Uint8Array(n);
  frames.forEach((f, i) => { t[i] = f.t; if (f.lm) { ok[i] = 1; lm.set(f.lm, i * 132); if (f.wl) wl.set(f.wl, i * 99); } });
  return { id, n, t, lm, wl, ok };
}
export function unpackFrames(p) {
  const out = [];
  for (let i = 0; i < p.n; i++) out.push({ t: p.t[i], lm: p.ok[i] ? p.lm.subarray(i * 132, i * 132 + 132) : null, wl: p.ok[i] ? p.wl.subarray(i * 99, i * 99 + 99) : null });
  return out;
}
