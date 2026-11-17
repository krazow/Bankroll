// Local-first storage on IndexedDB. Everything stays on this device unless you export or back it up.
// (In the beta build the release kit renames the database to "beta-bankroll", so test data never mixes with real data.)

export const DB_NAME = 'bankroll';
export const DB_VERSION = 2;   // 2: staking (backers, deals, stakemoney)
export const STORES = {
  sessions: { keyPath: 'id', indexes: [['start', 'start'], ['bankrollId', 'bankrollId']] },
  bankrolls: { keyPath: 'id', indexes: [] },
  transactions: { keyPath: 'id', indexes: [['bankrollId', 'bankrollId'], ['date', 'date']] },
  hands: { keyPath: 'id', indexes: [['sessionId', 'sessionId']] },
  opponents: { keyPath: 'id', indexes: [] },
  kv: { keyPath: 'key', indexes: [] },
  backers: { keyPath: 'id', indexes: [] },
  deals: { keyPath: 'id', indexes: [['backerId', 'backerId']] },
  stakemoney: { keyPath: 'id', indexes: [['backerId', 'backerId']] },
};

let dbPromise = null;

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [iname, path] of def.indexes) s.createIndex(iname, path);
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Database is open in another tab with an older version. Close other tabs and reload.'));
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
}

export const get = (store, id) => tx(store, 'readonly', s => req(s.get(id)));
export const all = (store) => tx(store, 'readonly', s => req(s.getAll()));
export const del = (store, id) => tx(store, 'readwrite', s => req(s.delete(id)));
export const clear = (store) => tx(store, 'readwrite', s => req(s.clear()));
export const byIndex = (store, index, value) => tx(store, 'readonly', s => req(s.index(index).getAll(value)));

export async function put(store, obj) {
  const def = STORES[store];
  if (def.keyPath === 'id' && !obj.id) obj.id = uid();
  const now = Date.now();
  if (store !== 'kv') { obj.updatedAt = now; if (!obj.createdAt) obj.createdAt = now; }
  await tx(store, 'readwrite', s => req(s.put(obj)));
  emit(store);
  return obj;
}

export async function remove(store, id) { await del(store, id); emit(store); }

// Settings live in the "kv" store as {key, value}.
export async function getSetting(key, fallback) {
  const row = await get('kv', key);
  return row === undefined ? fallback : row.value;
}
export async function setSetting(key, value) { await put('kv', { key, value }); }

// Whole-database export / import (used by backup, restore and tests).
export async function exportAll() {
  const out = { app: 'bankroll', schema: DB_VERSION, exportedAt: new Date().toISOString(), data: {} };
  for (const name of Object.keys(STORES)) out.data[name] = await all(name);
  return out;
}

export async function importAll(dump, { replace = true } = {}) {
  if (!dump || dump.app !== 'bankroll' || !dump.data) throw new Error('This file is not a Bankroll backup.');
  const db = await open();
  const names = Object.keys(STORES).filter(n => Array.isArray(dump.data[n]));
  await new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    for (const n of names) {
      const s = t.objectStore(n);
      if (replace) s.clear();
      for (const row of dump.data[n]) s.put(row);
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  names.forEach(emit);
  return names.reduce((acc, n) => ((acc[n] = dump.data[n].length), acc), {});
}

export async function wipeAll() {
  for (const name of Object.keys(STORES)) await clear(name);
  Object.keys(STORES).forEach(emit);
}

// Tiny change feed so open screens can refresh.
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(store) { listeners.forEach(fn => { try { fn(store); } catch (e) { console.error(e); } }); }

// Ask the browser not to evict our data under storage pressure.
export async function persist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
