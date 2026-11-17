// Theme (dark / light / auto) and button size.
import * as db from './db.js';

export async function applyAppearance() {
  const [theme, size] = await Promise.all([db.getSetting('theme', 'dark'), db.getSetting('size', 'normal')]);
  const light = theme === 'light' || (theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.documentElement.dataset.size = size;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? '#f5f7f6' : '#0f1412';
}
