# Builds one 1080x1920 frame per item in manifest.json: caption band + phone, or a title/section card.
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 2
W, H = 1080 * S, 1920 * S
F = '/usr/share/fonts/opentype/inter/'
font = lambda name, size: ImageFont.truetype(F + name, size * S)
BG1, BG2 = (15, 20, 18), (18, 44, 32)
TEXT, MUTED, ACCENT = (238, 242, 239), (147, 163, 155), (47, 191, 127)
SECTIONS = ['Live sessions', 'Sessions & bankroll', 'Stats', 'Tools', 'Your data', 'Security']

m = json.load(open('/tmp/vid/manifest.json'))
os.makedirs('/tmp/vid/frames', exist_ok=True)

def background():
    im = Image.new('RGB', (W, H), BG1)
    px = Image.linear_gradient('L').resize((W, H)).rotate(0)
    top = Image.new('RGB', (W, H), BG2)
    return Image.composite(top, im, px)

def wrap(draw, text, fnt, width):
    lines = []
    for para in text.split('\n'):
        cur = ''
        for word in para.split(' '):
            t = (cur + ' ' + word).strip()
            if draw.textlength(t, font=fnt) <= width: cur = t
            else: lines.append(cur); cur = word
        lines.append(cur)
    return lines

def centered(draw, y, text, fnt, fill, width=W - 160 * S, gap=1.25):
    for line in wrap(draw, text, fnt, width):
        draw.text(((W - draw.textlength(line, font=fnt)) / 2, y), line, font=fnt, fill=fill)
        y += int(fnt.size * gap)
    return y

def progress(draw, section):
    if section not in SECTIONS: return
    i = SECTIONS.index(section)
    seg_w, gap = 120 * S, 14 * S
    total = len(SECTIONS) * seg_w + (len(SECTIONS) - 1) * gap
    x = (W - total) / 2
    for k in range(len(SECTIONS)):
        draw.rounded_rectangle([x, 1868 * S, x + seg_w, 1876 * S], 4 * S, fill=ACCENT if k <= i else (52, 66, 60))
        x += seg_w + gap

icon = Image.open('icons/icon-512.png').convert('RGBA')
def chip(size):
    ic = icon.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0); ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    ic.putalpha(mask); return ic

for idx, it in enumerate(m):
    im = background(); d = ImageDraw.Draw(im)
    kind = it.get('kind', 'shot')
    if kind == 'title':
        c = chip(300 * S); im.paste(c, ((W - 300 * S) // 2, 520 * S), c)
        d.text(((W - d.textlength(it['title'], font=font('InterDisplay-ExtraBold.otf', 132))) / 2, 880 * S), it['title'], font=font('InterDisplay-ExtraBold.otf', 132), fill=TEXT)
        y = 1070 * S
        for k, line in enumerate(it['sub'].split('\n')):
            fnt = font('Inter-Medium.otf', 50) if k == 0 or idx == 0 else font('Inter-SemiBold.otf', 50)
            col = MUTED if (idx == 0 or k == 0) else ACCENT
            y = centered(d, y, line, fnt, col) + 16 * S
    elif kind == 'card':
        n = SECTIONS.index(it['section']) + 1 if it['section'] in SECTIONS else 0
        label = f'{n} / {len(SECTIONS)}  ·  {it["section"].upper()}'
        lf = font('Inter-SemiBold.otf', 36)
        d.text(((W - d.textlength(label, font=lf)) / 2, 700 * S), label, font=lf, fill=ACCENT)
        y = centered(d, 790 * S, it['title'], font('InterDisplay-ExtraBold.otf', 96), TEXT, gap=1.12)
        centered(d, y + 40 * S, it['sub'], font('Inter-Medium.otf', 46), MUTED)
        progress(d, it['section'])
    else:
        # caption band
        lf = font('Inter-SemiBold.otf', 30)
        d.text((80 * S, 96 * S), it['section'].upper(), font=lf, fill=ACCENT)
        tf = font('InterDisplay-Bold.otf', 66)
        y = 146 * S
        for line in wrap(d, it['title'], tf, W - 160 * S): d.text((80 * S, y), line, font=tf, fill=TEXT); y += 78 * S
        sf = font('Inter-Regular.otf', 38)
        for line in wrap(d, it['sub'], sf, W - 160 * S): d.text((80 * S, y + 6 * S), line, font=sf, fill=MUTED); y += 50 * S
        # phone
        shot = Image.open(it['file']).convert('RGB')
        top = max(y + 46 * S, 430 * S)
        ph = 1830 * S - top
        pw = round(shot.width * ph / shot.height)
        shot = shot.resize((pw, ph), Image.LANCZOS)
        x = (W - pw) // 2
        r, b = 54 * S, 14 * S
        shadow = Image.new('L', (W, H), 0)
        ImageDraw.Draw(shadow).rounded_rectangle([x - b, top - b + 18 * S, x + pw + b, top + ph + b + 18 * S], r + b, fill=170)
        im.paste((0, 0, 0), (0, 0), shadow.filter(ImageFilter.GaussianBlur(28 * S)))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([x - b, top - b, x + pw + b, top + ph + b], r + b, fill=(6, 9, 8), outline=(58, 72, 66), width=3 * S)
        mask = Image.new('L', (pw, ph), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], r, fill=255)
        im.paste(shot, (x, top), mask)
        progress(d, it['section'])
    out = f'/tmp/vid/frames/{idx:02d}.png'
    im.save(out); it['frame'] = out

json.dump(m, open('/tmp/vid/manifest.json', 'w'), indent=1)
print('frames', len(m))
