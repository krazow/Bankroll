# One mp4 per section (crossfades inside), then join with -c copy.
import json, subprocess, os, itertools
m = json.load(open('/tmp/vid/manifest.json'))
os.makedirs('/tmp/vid/parts', exist_ok=True)
ENC = ['-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-profile:v', 'high', '-level:v', '5.2', '-pix_fmt', 'yuv420p', '-r', '30',
       '-g', '15', '-bf', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-tune', 'stillimage']
parts = []
groups = [list(g) for _, g in itertools.groupby(m, key=lambda x: x['section'])]
for gi, g in enumerate(groups):
    # fade length into each item: short between frames of the same caption (ticking clock), longer otherwise
    fades = [0.1 if g[k]['title'] == g[k - 1]['title'] else 0.4 for k in range(1, len(g))]
    lens = [it['dur'] + (fades[k] if k < len(fades) else 0) for k, it in enumerate(g)]
    args = ['ffmpeg', '-y', '-v', 'error']
    for it, L in zip(g, lens):
        args += ['-framerate', '30', '-i', it['frame']]
    fl = []
    for k, L in enumerate(lens):
        fl.append(f'[{k}:v]scale=out_color_matrix=bt709,format=yuv420p,loop=-1:1,trim=duration={L:.3f},setpts=PTS-STARTPTS,fps=30[v{k}]')
    cur, cur_len = 'v0', lens[0]
    for k in range(1, len(g)):
        T = fades[k - 1]
        out = f'x{k}'
        fl.append(f'[{cur}][v{k}]xfade=transition=fade:duration={T}:offset={cur_len - T:.3f}[{out}]')
        cur, cur_len = out, cur_len + lens[k] - T
    if gi == 0: fl.append(f'[{cur}]fade=t=in:st=0:d=0.5[fin]'); cur = 'fin'
    if gi == len(groups) - 1: fl.append(f'[{cur}]fade=t=out:st={cur_len - 0.7:.3f}:d=0.7[fout]'); cur = 'fout'
    tmp, final = f'/tmp/vid/parts/p{gi:02d}.tmp.mp4', f'/tmp/vid/parts/p{gi:02d}.mp4'
    subprocess.run(args + ['-filter_complex', ';'.join(fl), '-map', f'[{cur}]'] + ENC + [tmp], check=True)
    os.replace(tmp, final); parts.append(final)
    print(gi, g[0]['section'], f'{cur_len:.1f}s')
open('/tmp/vid/parts/list.txt', 'w').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', '/tmp/vid/parts/list.txt', '-c', 'copy', '-movflags', '+faststart', '/tmp/vid/joined.tmp.mp4'], check=True)
os.replace('/tmp/vid/joined.tmp.mp4', '/tmp/vid/joined.mp4')
# YouTube-ready: add a silent AAC 48 kHz stereo track, video copied as is
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', '/tmp/vid/joined.mp4', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '384k', '-shortest', '-movflags', '+faststart', '/tmp/vid/bankroll-tutorial-4k.tmp.mp4'], check=True)
os.replace('/tmp/vid/bankroll-tutorial-4k.tmp.mp4', '/tmp/vid/bankroll-tutorial-4k.mp4')
