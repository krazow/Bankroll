// Home-game helpers: payouts, blind structures and settling up. Pure functions.

// Common percentage splits by number of places paid.
export const PAYOUTS = {
  1: [100], 2: [65, 35], 3: [50, 30, 20], 4: [40, 30, 20, 10], 5: [38, 26, 18, 11, 7],
  6: [35, 24, 16, 11, 8, 6], 7: [33, 22, 15, 11, 8, 6, 5], 8: [31, 21, 14, 10, 8, 6, 5, 5],
  9: [30, 20, 13, 10, 8, 6, 5, 4, 4],
};

export function recommendedPlaces(players) {
  if (players <= 4) return 1;
  if (players <= 8) return 2;
  if (players <= 16) return 3;
  if (players <= 24) return 4;
  if (players <= 35) return 5;
  return Math.min(9, Math.round(players * 0.15));
}

// Splits a prize pool. Amounts are rounded to `unit` (e.g. 5) and any rounding difference goes to 1st.
export function payouts(pool, places, { unit = 1, split } = {}) {
  places = Math.max(1, Math.min(9, places | 0));
  const pct = split && split.length === places ? split : PAYOUTS[places];
  const total = pct.reduce((a, b) => a + b, 0);
  const amounts = pct.map(p => Math.floor(((pool * p) / total) / unit) * unit);
  amounts[0] += Math.round((pool - amounts.reduce((a, b) => a + b, 0)) * 100) / 100;
  return amounts.map((amount, i) => ({ place: i + 1, pct: Math.round((pct[i] / total) * 1000) / 10, amount }));
}

export function prizePool({ players = 0, buyIn = 0, rebuys = 0, rebuyCost = 0, addOns = 0, addOnCost = 0, rake = 0 }) {
  const gross = players * buyIn + rebuys * rebuyCost + addOns * addOnCost;
  return Math.max(0, gross - rake);
}

// Round a blind to a "nice" value that can be paid with the smallest chip.
export function niceBlind(v, smallestChip = 25) {
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const mag = 10 ** Math.floor(Math.log10(v));
  let best = steps.map(s => s * mag).reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  best = Math.max(smallestChip, Math.round(best / smallestChip) * smallestChip);
  return best;
}

// Builds a blind schedule that should end in about `hours`.
// Big blind starts near 1/100 of a starting stack and grows ~30-40% per level, so that by the end
// the big blind is about 1/10 to 1/5 of the chips in play per player.
export function blindStructure({ players = 8, startingStack = 10000, hours = 4, levelMinutes = 20, smallestChip = 25, breakEvery = 0 } = {}) {
  const levels = Math.max(3, Math.round((hours * 60) / levelMinutes));
  const startBB = niceBlind(startingStack / 100, smallestChip * 2);
  const endBB = (startingStack * players) / 12;
  const growth = Math.max(1.15, (endBB / startBB) ** (1 / Math.max(1, levels - 1)));
  const out = [];
  let bb = startBB;
  for (let i = 0; i < levels; i++) {
    const nb = i === 0 ? startBB : Math.max(niceBlind(bb, smallestChip * 2), out[out.length - 1].bb + smallestChip * 2);
    const sb = niceBlind(nb / 2, smallestChip);
    out.push({ level: i + 1, sb: Math.min(sb, nb), bb: nb, ante: 0, minutes: levelMinutes });
    bb = nb * growth;
    if (breakEvery > 0 && (i + 1) % breakEvery === 0 && i < levels - 1) out.push({ break: true, minutes: 10 });
  }
  return out;
}

// Who pays whom at the end of a cash game. players: [{name, in, out}].
// Returns { transfers: [{from, to, amount}], diff } where diff != 0 means the money doesn't add up.
export function settleUp(players) {
  const r2 = n => Math.round(n * 100) / 100;
  const bal = players.map(p => ({ name: p.name, v: r2((Number(p.out) || 0) - (Number(p.in) || 0)) }));
  const diff = r2(bal.reduce((a, b) => a + b.v, 0));
  const pos = bal.filter(b => b.v > 0).sort((a, b) => b.v - a.v);
  const neg = bal.filter(b => b.v < 0).map(b => ({ ...b, v: -b.v })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < neg.length && j < pos.length) {
    const amt = r2(Math.min(neg[i].v, pos[j].v));
    if (amt > 0) transfers.push({ from: neg[i].name, to: pos[j].name, amount: amt });
    neg[i].v = r2(neg[i].v - amt); pos[j].v = r2(pos[j].v - amt);
    if (neg[i].v <= 0) i++;
    if (pos[j].v <= 0) j++;
  }
  return { transfers, diff, results: bal };
}
