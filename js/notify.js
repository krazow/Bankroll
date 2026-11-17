// "Session running" notification and app-icon badge while you play.
import * as db from './db.js';
import * as M from './model.js';
import { money, timeLabel } from './ui.js';

const TAG = 'bankroll-live';

export const supported = () => 'Notification' in window && 'serviceWorker' in navigator;

export async function enable() {
  if (!supported()) throw new Error('This browser can’t show notifications.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the browser’s site settings.');
  await db.setSetting('notify', true);
}
export async function disable() { await db.setSetting('notify', false); await clear(); }

export async function update(session) {
  try {
    if (navigator.setAppBadge) { if (session) navigator.setAppBadge(1).catch(() => {}); else navigator.clearAppBadge().catch(() => {}); }
    if (!supported() || Notification.permission !== 'granted' || !(await db.getSetting('notify', false))) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    if (!session) return clear();
    const body = `${M.sessionTitle(session)}${session.venue ? ' @ ' + session.venue : ''} · in for ${money(M.totalBuyIn(session))} · since ${timeLabel(session.start)}${M.onBreak(session) ? ' · on break' : ''}`;
    await reg.showNotification(M.onBreak(session) ? 'Bankroll: on break' : 'Bankroll: session running', {
      tag: TAG, body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', silent: true, renotify: false, requireInteraction: true, data: { url: './#/live' },
    });
  } catch (e) { console.warn('notification', e); }
}

export async function clear() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const list = reg ? await reg.getNotifications({ tag: TAG }) : [];
    list.forEach(n => n.close());
  } catch { /* nothing to clear */ }
}
