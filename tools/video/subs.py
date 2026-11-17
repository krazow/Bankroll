# Builds subtitles (SRT + ASS) from the same timings render.py used, then burns them in and adds a soft track.
import json, itertools, subprocess, os
m = json.load(open('/tmp/vid/manifest.json'))

LINES = {
 0: "Meet Bankroll: a poker tracker that keeps your results private.",
 1: "First, let's track a live session.",
 2: "Home shows your bankroll, your stats, and a one-tap start.",
 3: "Pick the game, stakes, venue and buy-in, then start.",
 4: "The clock keeps running, even if you close the app.",
 7: "Rebought? Tap Rebuy. Every buy-in is logged with the time.",
 8: "Update your stack to see your profit live. Stop-win and stop-loss warnings tell you when to quit.",
 9: "On a break? Paused time doesn't count against your hourly rate.",
 10: "Done? Enter what you cashed out.",
 11: "You get your net result, time and hourly rate, after tips.",
 12: "Rate your mood, tilt and focus. Stats will show how they affect your results.",
 13: "Next: logging sessions and managing your bankroll.",
 14: "Forgot to track one? Log it afterwards, tournaments included.",
 15: "Every session, grouped by month.",
 16: "Deposits, withdrawals and results, with a running balance.",
 17: "Now let's look at your stats.",
 18: "Profit, hourly rate, BB per hour, win rate and more.",
 19: "Your profit over time, by session or by date.",
 20: "Break results down by game, stakes, venue, day or time to find your leaks.",
 21: "The calendar shows winning and losing days at a glance.",
 22: "See how tilt, sleep and drinks change your hourly rate.",
 23: "Set monthly goals, and get warned when your bankroll is too small for your stakes.",
 24: "Bankroll also has handy tools built in.",
 25: "Work out the odds: hand versus hand on any board.",
 26: "Save key hands with the cards, the action and the lesson.",
 27: "Hosting a tournament? The blind timer keeps time.",
 28: "Settle up after a home game, in the fewest payments.",
 29: "Your data, your way.",
 30: "Export a CSV for taxes, or a full backup you can restore.",
 31: "Coming from another app? Import its CSV. Duplicates are skipped.",
 32: "Finally, privacy and security.",
 33: "No account, no server, no tracking. A PIN lock stores only a salted hash.",
 34: "Bankroll locks when you open it, and after it's been in the background.",
 35: "Wrong PIN? It stays locked.",
 36: "Optional private GitHub backup. Your token never leaves this device.",
 37: "No signal in the card room? It all works offline.",
 38: "Beta testers get their own separate data, so real sessions are never touched.",
 39: "Open Bankroll in your browser and add it to your home screen.",
}

# timings exactly as render.py lays them out
starts, t0 = [], 0.0
for _, g in itertools.groupby(m, key=lambda x: x['section']):
    g = list(g)
    fades = [0.1 if g[k]['title'] == g[k - 1]['title'] else 0.4 for k in range(1, len(g))]
    lens = [it['dur'] + (fades[k] if k < len(fades) else 0) for k, it in enumerate(g)]
    cur = lens[0]; starts.append(t0)
    for k in range(1, len(g)):
        starts.append(t0 + cur - fades[k - 1]); cur += lens[k] - fades[k - 1]
    t0 += cur
total = t0
cues = []
for i in sorted(LINES):
    nxt = min([j for j in LINES if j > i], default=None)
    end = (starts[nxt] if nxt is not None else total - 0.5)
    cues.append((starts[i] + 0.25, end - 0.05, LINES[i]))

ts = lambda s, sep: f"{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{int(s % 60):02d}{sep}{int(round(s % 1 * 1000)) if sep == ',' else int(s % 1 * 100):0{3 if sep == ',' else 2}d}"
with open('/tmp/vid/bankroll-tutorial.srt', 'w') as f:
    for n, (a, b, t) in enumerate(cues, 1): f.write(f"{n}\n{ts(a, ',')} --> {ts(b, ',')}\n{t}\n\n")
ass = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter SemiBold,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H28000000,0,0,0,0,100,100,0,0,3,12,0,7,84,200,452,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
for a, b, t in cues: ass += f"Dialogue: 0,{ts(a, '.')},{ts(b, '.')},Sub,,0,0,0,,{t}\n"
open('/tmp/vid/subs.ass', 'w').write(ass)
print(len(cues), 'cues, total', round(total, 1), 's')

src = '/tmp/vid/bankroll-tutorial-4k.mp4'
tmp, out = '/tmp/vid/bankroll-tutorial-shorts-4k.tmp.mp4', '/tmp/vid/bankroll-tutorial-shorts-4k.mp4'
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-i', '/tmp/vid/bankroll-tutorial.srt',
  '-vf', 'ass=/tmp/vid/subs.ass:fontsdir=/usr/share/fonts/opentype/inter',
  '-map', '0:v', '-map', '0:a', '-map', '1:s', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-profile:v', 'high', '-level:v', '5.2',
  '-pix_fmt', 'yuv420p', '-g', '15', '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:a', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', tmp], check=True)
os.replace(tmp, out)
