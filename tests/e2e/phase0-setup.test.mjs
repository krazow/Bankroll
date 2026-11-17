// Phase 0 QA: the app shell opens, installs a service worker, works offline, and stores data in IndexedDB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, launch, openApp, noErrors } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });

test('the app opens without errors and has a title', async () => {
  const { page, context } = await openApp(browser, srv.url);
  assert.equal(await page.title(), 'Bankroll');
  await page.waitForTimeout(300);
  noErrors(page);
  await context.close();
});

test('manifest is valid and installable (relative start_url, icons exist)', async () => {
  const m = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(m.start_url, '.');
  assert.equal(m.scope, '.');
  assert.equal(m.display, 'standalone');
  for (const i of m.icons) assert.ok(fs.existsSync(i.src), i.src + ' missing');
  assert.ok(m.icons.some(i => i.sizes === '512x512'));
});

test('every file the service worker caches exists', () => {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const list = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const missing = list.filter(f => f !== './' && !fs.existsSync(f));
  assert.deepEqual(missing, [], 'missing: ' + missing.join(', '));
  // and every app file is cached, so every screen works offline
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const notCached = walk('js').filter(f => !list.includes(f));
  assert.deepEqual(notCached, [], 'not in the service worker list: ' + notCached.join(', '));
});

test('service worker installs and the app opens offline', async () => {
  const { page, context } = await openApp(browser, srv.url, { serviceWorkers: 'allow' });
  const ok = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 8000))]));
  assert.ok(ok, 'no active service worker');
  await page.waitForTimeout(1500); // let it finish caching
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('html[data-ready="1"]', { timeout: 10000 });
  assert.match(await page.textContent('body'), /Bankroll/);
  await context.setOffline(false);
  await context.close();
});

test('IndexedDB storage: save, read, settings, export and import round-trip', async () => {
  const { page, context } = await openApp(browser, srv.url);
  const r = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const s = await db.put('sessions', { start: 1000, type: 'cash' });
    const back = await db.get('sessions', s.id);
    await db.setSetting('currency', '€');
    const cur = await db.getSetting('currency', '$');
    const missing = await db.getSetting('nope', 42);
    const dump = await db.exportAll();
    await db.wipeAll();
    const afterWipe = (await db.all('sessions')).length;
    const counts = await db.importAll(dump);
    const afterImport = (await db.all('sessions')).length;
    let bad = null; try { await db.importAll({ foo: 1 }); } catch (e) { bad = e.message; }
    return { id: s.id, back, cur, missing, afterWipe, afterImport, counts, bad };
  });
  assert.ok(r.id);
  assert.equal(r.back.type, 'cash');
  assert.ok(r.back.createdAt);
  assert.equal(r.cur, '€');
  assert.equal(r.missing, 42);
  assert.equal(r.afterWipe, 0);
  assert.equal(r.afterImport, 1);
  assert.equal(r.counts.sessions, 1);
  assert.match(r.bad, /not a Bankroll backup/);
  // data survives a reload
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  const n = await page.evaluate(async () => (await (await import('./js/db.js')).all('sessions')).length);
  assert.equal(n, 1);
  noErrors(page);
  await context.close();
});

test('settings screen shows storage status and version', async () => {
  const { page, context } = await openApp(browser, srv.url, { hash: '/settings' });
  await page.waitForSelector('#storage-status');
  assert.equal(await page.textContent('#app-version'), fs.readFileSync('VERSION', 'utf8').trim());
  noErrors(page);
  await context.close();
});

test('release kit files are in place', () => {
  const cfg = JSON.parse(fs.readFileSync('release.json', 'utf8'));
  assert.equal(cfg.id, 'bankroll');
  for (const f of ['.github/workflows/ci.yml', '.github/workflows/release.yml', '.claude/commands/release.md', 'VERSION', 'CHANGELOG.md'])
    assert.ok(fs.existsSync(f), f + ' missing');
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.match(sw, /const CACHE_PREFIX = 'bankroll-';/);
  assert.match(sw, /startsWith\(CACHE_PREFIX\)/);
});
