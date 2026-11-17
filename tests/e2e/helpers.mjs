// Shared test setup: serves the repo on a local port and opens it in a real Chromium (Playwright).
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
export const { chromium } = require('playwright');

const ROOT = path.resolve(process.env.SITE_DIR || '.');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv' };

export async function startServer() {
  const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(ROOT)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

export async function launch() {
  const opts = {};
  if (process.env.PW_CHANNEL) opts.channel = process.env.PW_CHANNEL;
  return chromium.launch(opts);
}

// Opens a fresh app page (empty storage) and collects page errors.
export async function openApp(browser, url, { hash = '', viewport = { width: 390, height: 844 }, serviceWorkers = 'block' } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers, acceptDownloads: true });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(url + (hash ? '#' + hash : ''), { waitUntil: 'load' });
  await page.waitForSelector('html[data-ready="1"]', { timeout: 10000 });
  return { context, page };
}

export async function nav(page, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(150);
}

// Runs code inside the page with the app's own modules, e.g. db.put(...)
export function inPage(page, fn, arg) { return page.evaluate(fn, arg); }

export function noErrors(page) {
  const errs = page.errors.filter(e => !/favicon|service worker/i.test(e));
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
}
