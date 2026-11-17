// Makes the app icons from one SVG. Run: node tools/make-icons.mjs  (needs the "sharp" package)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const sharp = require('sharp');

function chip(pad) {
  // pad: fraction of the canvas kept clear around the chip (maskable icons need a safe zone)
  const r = 256 - pad * 512;
  const notches = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x = 256 + Math.cos(a) * r * 0.86, y = 256 + Math.sin(a) * r * 0.86;
    return `<rect x="${x - r * 0.09}" y="${y - r * 0.15}" width="${r * 0.18}" height="${r * 0.3}" rx="${r * 0.03}"
      fill="#f4f1e8" transform="rotate(${(a * 180) / Math.PI + 90} ${x} ${y})"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f1412"/>
  <circle cx="256" cy="256" r="${r}" fill="#1f8a5b"/>
  ${notches}
  <circle cx="256" cy="256" r="${r * 0.62}" fill="#16704a" stroke="#f4f1e8" stroke-width="${r * 0.04}" stroke-dasharray="${r * 0.1} ${r * 0.08}"/>
  <text x="256" y="${256 + r * 0.22}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700"
    font-size="${r * 0.66}" fill="#f4f1e8">$</text>
</svg>`;
}

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync('icons/icon.svg', chip(0.02));
await sharp(Buffer.from(chip(0.02))).resize(192, 192).png().toFile('icons/icon-192.png');
await sharp(Buffer.from(chip(0.02))).resize(512, 512).png().toFile('icons/icon-512.png');
await sharp(Buffer.from(chip(0.12))).resize(512, 512).png().toFile('icons/icon-maskable-512.png');
await sharp(Buffer.from(chip(0.02))).resize(180, 180).png().toFile('icons/apple-touch-icon.png');
console.log('icons written');
