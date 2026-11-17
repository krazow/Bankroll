// Backups: a JSON file you keep, or a private GitHub Gist (optional, needs a token with the "gist" scope).
import * as db from './db.js';

const FILE = 'bankroll-backup.json';
// Settings that never leave this device: your GitHub token and the backup's own settings.
const PRIVATE_KEYS = ['gist'];

export async function backupData() {
  const dump = await db.exportAll();
  dump.data.kv = dump.data.kv.filter(r => !PRIVATE_KEYS.includes(r.key));
  return dump;
}

export function backupName(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `bankroll-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// Restore replaces everything on this device, but keeps this device's private settings.
export async function restore(dump) {
  if (typeof dump === 'string') { try { dump = JSON.parse(dump); } catch { throw new Error('This file is not a Bankroll backup.'); } }
  const keep = [];
  for (const k of PRIVATE_KEYS) { const v = await db.getSetting(k, undefined); if (v !== undefined) keep.push([k, v]); }
  const clean = { ...dump, data: { ...dump.data, kv: (dump.data?.kv || []).filter(r => !PRIVATE_KEYS.includes(r.key)) } };
  const counts = await db.importAll(clean, { replace: true });
  for (const [k, v] of keep) await db.setSetting(k, v);
  return counts;
}

// ---- GitHub Gist
const API = 'https://api.github.com/gists';
const headers = token => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' });

async function ghError(res) {
  if (res.status === 401) return new Error('GitHub did not accept the token. Check it has the "gist" permission.');
  if (res.status === 404) return new Error('Backup gist not found. Clear the gist ID to make a new one.');
  return new Error(`GitHub answered ${res.status}.`);
}

export async function gistBackup() {
  const g = await db.getSetting('gist', {});
  if (!g.token) throw new Error('Add a GitHub token first.');
  const body = JSON.stringify({ description: 'Bankroll backup (private)', public: false, files: { [FILE]: { content: JSON.stringify(await backupData()) } } });
  const res = await fetch(g.id ? `${API}/${g.id}` : API, { method: g.id ? 'PATCH' : 'POST', headers: headers(g.token), body });
  if (!res.ok) throw await ghError(res);
  const json = await res.json();
  const next = { ...g, id: json.id, lastAt: Date.now(), lastError: null };
  await db.setSetting('gist', next);
  return next;
}

export async function gistRestore() {
  const g = await db.getSetting('gist', {});
  if (!g.token || !g.id) throw new Error('Add a GitHub token and gist ID first.');
  const res = await fetch(`${API}/${g.id}`, { headers: headers(g.token) });
  if (!res.ok) throw await ghError(res);
  const json = await res.json();
  const f = json.files && json.files[FILE];
  if (!f) throw new Error('That gist has no Bankroll backup in it.');
  let content = f.content;
  if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
  return restore(content);
}

// Called after each finished session when automatic backups are on. Never throws.
export async function autoBackup() {
  try {
    const g = await db.getSetting('gist', {});
    if (g.auto && g.token) await gistBackup();
  } catch (e) {
    const g = await db.getSetting('gist', {});
    await db.setSetting('gist', { ...g, lastError: e.message });
  }
}
