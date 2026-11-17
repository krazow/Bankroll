// App-level data helpers on top of db.js.
import * as db from './db.js';
import * as M from './model.js';

// Make sure there's always at least one bankroll.
export async function getBankrolls() {
  let list = await db.all('bankrolls');
  if (!list.length) {
    // A fixed id makes this safe when two screens ask at the same moment.
    const main = await db.put('bankrolls', { id: 'main', name: 'Main', archived: false, createdAt: 0 });
    await db.setSetting('defaultBankroll', main.id);
    list = await db.all('bankrolls');
  }
  return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function runningSession() {
  const all = await db.all('sessions');
  return all.filter(M.isRunning).sort((a, b) => b.start - a.start)[0] || null;
}

export async function lastFinished() {
  const all = await db.all('sessions');
  return all.filter(s => s.status === 'done').sort((a, b) => b.start - a.start)[0] || null;
}

// Sessions without a bankroll (e.g. imported) belong to the default one.
export async function sessionsWithBankroll() {
  const [sessions, def] = await Promise.all([db.all('sessions'), db.getSetting('defaultBankroll', null)]);
  return sessions.map(s => (s.bankrollId ? s : { ...s, bankrollId: def }));
}

export async function startRepeat() {
  const prev = await lastFinished();
  if (!prev) return null;
  const s = M.repeatOf(prev);
  const { autoBacking } = await import('./staking.js');
  s.backing = autoBacking(s, await db.all('deals'));
  const banks = await getBankrolls();
  if (!banks.some(b => b.id === s.bankrollId)) s.bankrollId = await db.getSetting('defaultBankroll', banks[0].id);
  return db.put('sessions', s);
}

// Everything the bankroll needs to count only YOUR money when some action belongs to backers.
export async function moneyInputs() {
  const K = await import('./staking.js');
  const [txs, sessions, money, def] = await Promise.all([db.all('transactions'), sessionsWithBankroll(), db.all('stakemoney'), db.getSetting('defaultBankroll', 'main')]);
  const settles = money.filter(m => m.kind === 'settle').map(m => ({ ...m, bankrollId: m.bankrollId || def }));
  const held = (await db.all('backers')).reduce((a, b) => a + Math.max(0, K.backerBalance(b.id, sessions, money).due), 0);
  return { txs, sessions, money, opts: { result: K.playerNet, settles }, held: Math.round(held * 100) / 100 };
}
