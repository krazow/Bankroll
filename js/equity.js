// Texas Hold'em hand evaluator and equity calculator. Pure functions.
// Cards are strings like "As", "Td", "9c" (rank + suit).

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const DECK = [...RANKS].flatMap(r => [...SUITS].map(s => r + s));
export const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

const RANK_VALUE = Object.fromEntries([...RANKS].map((r, i) => [r, i + 2]));
const rankOf = c => RANK_VALUE[c[0]]; // 2..14

export function parseCards(text) {
  const out = String(text || '').replace(/10/g, 'T').match(/[2-9TJQKA][shdc]/gi) || [];
  return out.map(c => c[0].toUpperCase() + c[1].toLowerCase());
}
export function validCard(c) { return typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]); }
export function pretty(c) { return c ? c[0].replace('T', '10') + SUIT_SYMBOL[c[1]] : ''; }

// Score for exactly 5 cards; higher is better. Category is Math.floor(score / 15**5).
export function eval5(cards) {
  const rs = [rankOf(cards[0]), rankOf(cards[1]), rankOf(cards[2]), rankOf(cards[3]), rankOf(cards[4])].sort((a, b) => b - a);
  const su = cards[0][1];
  const flush = cards[1][1] === su && cards[2][1] === su && cards[3][1] === su && cards[4][1] === su;
  // groups: [count, rank] sorted by count desc then rank desc (rs is already rank desc)
  const groups = [];
  for (let i = 0; i < 5;) { let j = i; while (j < 5 && rs[j] === rs[i]) j++; groups.push([j - i, rs[i]]); i = j; }
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let straightHigh = 0;
  if (groups.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const c0 = groups[0][0], c1 = groups.length > 1 ? groups[1][0] : 0;
  let cat;
  if (straightHigh && flush) cat = 8;
  else if (c0 === 4) cat = 7;
  else if (c0 === 3 && c1 === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh) cat = 4;
  else if (c0 === 3) cat = 3;
  else if (c0 === 2 && c1 === 2) cat = 2;
  else if (c0 === 2) cat = 1;
  else cat = 0;
  let score = cat;
  if (straightHigh) score = score * 759375 + straightHigh * 50625; // 15^5, 15^4
  else for (let i = 0; i < 5; i++) score = score * 15 + (groups[i] ? groups[i][1] : 0);
  return score;
}

// Best score from 5 to 7 cards.
export function evalBest(cards) {
  if (cards.length === 5) return eval5(cards);
  let best = -1;
  const idx = cards.length === 7 ? IDX7 : IDX6;
  for (const ix of idx) { const s = eval5([cards[ix[0]], cards[ix[1]], cards[ix[2]], cards[ix[3]], cards[ix[4]]]); if (s > best) best = s; }
  return best;
}
export const category = score => CATEGORIES[Math.floor(score / 15 ** 5)];
export const describe = cards => category(evalBest(cards));

// Small seeded random generator so results can be repeated in tests.
export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function* combos(arr, k, start = 0, prefix = []) {
  if (prefix.length === k) { yield prefix; return; }
  for (let i = start; i <= arr.length - (k - prefix.length); i++) yield* combos(arr, k, i + 1, [...prefix, arr[i]]);
}
const IDX7 = [...combos([0, 1, 2, 3, 4, 5, 6], 5)];
const IDX6 = [...combos([0, 1, 2, 3, 4, 5], 5)];
const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };

// players: array of hands; each hand is [] (random), or 2 cards. board: 0-5 cards.
// Returns { equity: [%], win: [%], tie: [%], trials, exact }.
export function equity(players, board = [], { iterations = 20000, seed, exactLimit = 60000 } = {}) {
  if (players.length < 2) throw new Error('Need at least two players.');
  const used = [...board, ...players.flat()];
  if (used.some(c => !validCard(c))) throw new Error('Unknown card.');
  if (new Set(used).size !== used.length) throw new Error('The same card is used twice.');
  if (board.length > 5) throw new Error('The board has at most 5 cards.');
  for (const p of players) if (p.length !== 0 && p.length !== 2) throw new Error('Each hand needs 2 cards (or leave it random).');
  const deck = DECK.filter(c => !used.includes(c));
  const randomPlayers = players.filter(p => p.length === 0).length;
  const need = 5 - board.length;
  const n = players.length;
  const eq = new Array(n).fill(0), win = new Array(n).fill(0), tie = new Array(n).fill(0);

  const score = (hands, fullBoard) => {
    const scores = hands.map(hd => evalBest([...hd, ...fullBoard]));
    const best = Math.max(...scores);
    const winners = scores.reduce((a, s, i) => (s === best ? [...a, i] : a), []);
    winners.forEach(i => { eq[i] += 1 / winners.length; if (winners.length === 1) win[i]++; else tie[i]++; });
  };

  let trials = 0, exact = false;
  if (randomPlayers === 0 && choose(deck.length, need) <= exactLimit) {
    exact = true;
    for (const rest of combos(deck, need)) { score(players, [...board, ...rest]); trials++; }
  } else {
    const rand = rng(seed ?? Date.now());
    const d = deck.slice();
    for (let t = 0; t < iterations; t++) {
      // partial shuffle: draw what we need
      const take = need + randomPlayers * 2;
      for (let i = 0; i < take; i++) { const j = i + Math.floor(rand() * (d.length - i)); [d[i], d[j]] = [d[j], d[i]]; }
      let k = 0;
      const hands = players.map(p => (p.length ? p : [d[k++], d[k++]]));
      score(hands, [...board, ...d.slice(k, k + need)]);
      trials++;
    }
  }
  const pct = a => a.map(x => Math.round((x / trials) * 1000) / 10);
  return { equity: pct(eq), win: pct(win), tie: pct(tie), trials, exact };
}

// Pot odds: the equity you need to call.
export function potOdds(pot, toCall) {
  if (!(toCall > 0)) return null;
  return Math.round((toCall / (pot + toCall)) * 1000) / 10;
}

// Rule of 2 and 4: rough equity from outs.
export function outsEquity(outs, cardsToCome) {
  const unseen = cardsToCome === 2 ? 47 : 46;
  const miss = cardsToCome === 2 ? ((unseen - outs) / unseen) * ((unseen - 1 - outs) / (unseen - 1)) : (unseen - outs) / unseen;
  return Math.round((1 - miss) * 1000) / 10;
}
