// Share card: draws a result as a square image and shares it (or downloads it).
import { download } from './ui.js';

// card: { title, subtitle, big, positive, lines: [[label, value], ...], footer }
export function drawCard(card, size = 1080) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const u = size / 1080;
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#0f1412'); grad.addColorStop(1, '#16382a');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  // chip watermark
  g.globalAlpha = 0.08; g.fillStyle = '#2fbf7f'; g.beginPath(); g.arc(size * 0.85, size * 0.18, 260 * u, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  const font = (w, px) => `${w} ${px * u}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.fillStyle = '#93a39b'; g.font = font(600, 40); g.fillText('BANKROLL', 80 * u, 130 * u);
  g.fillStyle = '#eef2ef'; g.font = font(800, 72); g.fillText(card.title || '', 80 * u, 250 * u, size - 160 * u);
  g.fillStyle = '#93a39b'; g.font = font(500, 40); g.fillText(card.subtitle || '', 80 * u, 315 * u, size - 160 * u);
  g.fillStyle = card.positive === false ? '#ff6b6b' : card.positive ? '#3ddc84' : '#eef2ef';
  g.font = font(850, 200); g.fillText(card.big || '', 72 * u, 560 * u, size - 144 * u);
  let y = 700 * u;
  for (const [k, v] of card.lines || []) {
    g.fillStyle = '#93a39b'; g.font = font(500, 42); g.fillText(k, 80 * u, y);
    g.fillStyle = '#eef2ef'; g.font = font(700, 42); g.textAlign = 'right'; g.fillText(String(v), size - 80 * u, y); g.textAlign = 'left';
    y += 72 * u;
  }
  g.fillStyle = '#5f7068'; g.font = font(500, 30); g.fillText(card.footer || '', 80 * u, size - 60 * u);
  return c;
}

export function toBlob(canvas) { return new Promise(r => canvas.toBlob(r, 'image/png')); }

export async function shareCard(card, name = 'bankroll.png') {
  const blob = await toBlob(drawCard(card));
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: card.title }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  download(name, blob);
  return 'downloaded';
}
