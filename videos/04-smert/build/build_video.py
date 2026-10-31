import json, os, re, subprocess, sys, wave
A = sys.argv[1]; OUTF = sys.argv[2]            # assets dir, output mp4
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(ROOT + '/script.json', encoding='utf-8'))
FPS, GAP, X = 30, S.get('gap', 0.30), 0.40
def run(*a, quiet=True): subprocess.run(a, check=True, stderr=subprocess.DEVNULL if quiet else None)
sc = S['scenes']
for s in sc:
    w = wave.open(f"{A}/{s['id']}.wav"); s['dur'] = w.getnframes() / w.getframerate()
t = 0.0
for s in sc: s['start'] = t; s['L'] = s['dur'] + GAP; t += s['L']
total = t; print('total', round(total, 2))
# --- voice
vw = wave.open(A + '/voice.wav', 'wb'); vw.setnchannels(1); vw.setsampwidth(2); vw.setframerate(24000)
for s in sc:
    vw.writeframes(wave.open(f"{A}/{s['id']}.wav").readframes(10**9)); vw.writeframes(b'\0\0' * int(GAP * 24000))
vw.close()
# --- subtitle states
def weight(w):
    c = re.sub(r'[^\wё]', '', w, flags=re.I); x = len(c) + 1
    if w.endswith(('.', '?', '!', '…')): x += 5
    elif w.endswith((',', ':', ';', '—')): x += 2
    return x
caps, timeline = [], []   # timeline: (t0, t1, name|None)
for s in sc:
    words = s['text'].replace(' — ', '\u00a0— ').split(' ')
    wts = [weight(w) for w in words]; tot = sum(wts); pos = s['start'] + 0.05; spans = []
    for w, k in zip(words, wts):
        d = (s['dur'] - 0.05) * k / tot; spans.append((pos, pos + d)); pos += d
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        end = w.endswith(('.', '?', '!', '…')) or w.endswith(':')
        if end or len(cur) >= 4 or sum(len(words[j]) for j in cur) > 20: chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    for ch in chunks:
        for i in ch:
            name = f"{s['id']}_{i:02d}"
            caps.append({'kind': 'sub', 'name': name, 'words': [words[j] for j in ch], 'on': ch.index(i)})
            timeline.append((spans[i][0], spans[i][1], name))
    if s.get('badge'):
        b = s['badge']; caps.append({'kind': 'badge', 'name': f"badge_{s['id']}", 'ar': b.get('ar'), 'ru': b['ru']})
json.dump(caps, open(A + '/caps.json', 'w'), ensure_ascii=False)
env = dict(os.environ, NODE_PATH=subprocess.check_output(['npm', 'root', '-g'], text=True).strip())
subprocess.run(['node', os.path.dirname(os.path.abspath(__file__)) + '/render_caps.js', A], check=True, env=env)
# blank + concat list (continuous coverage 0..total)
run('ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920,format=rgba', '-frames:v', '1', A + '/caps/blank.png')
lines, cur_t = [], 0.0
for a, b, name in timeline:
    if a > cur_t + 1e-3: lines.append(('blank', a - cur_t))
    lines.append((name, b - max(a, cur_t))); cur_t = b
if total > cur_t: lines.append(('blank', total - cur_t))
with open(A + '/subs.txt', 'w') as f:
    for n, d in lines: f.write(f"file 'caps/{n}.png'\nduration {d:.3f}\n")
    f.write(f"file 'caps/{lines[-1][0]}.png'\n")
# --- image clips (Ken Burns)
clips = []
for s in sc:
    n = len(s['imgs']); per = s['L'] / n
    for j, im in enumerate(s['imgs']): clips.append((im, per))
N = len(clips); inputs, filt = [], []
for i, (im, L) in enumerate(clips):
    c = L + (X if i < N - 1 else 0); fr = int(round(c * FPS))
    inputs += ['-loop', '1', '-t', f'{c:.3f}', '-i', f"{A}/img{im:02d}.png"]
    rate = 0.10 / fr; zin = (i % 2 == 0)
    z = f"min(1.0+{rate:.6f}*on,1.10)" if zin else f"max(1.10-{rate:.6f}*on,1.0)"
    px = ('+' if i % 3 else '-') + f"{(i % 4) * 0.4 + 0.6:.2f}*on"
    filt.append(f"[{i}:v]scale=2160:3840:flags=lanczos,zoompan=z='{z}':x='iw/2-(iw/zoom/2){px}':y='ih/2-(ih/zoom/2)':d={fr}:s=1080x1920:fps={FPS},format=yuv420p,setsar=1[k{i}]")
last, acc = 'k0', clips[0][1]
for i in range(1, N):
    filt.append(f"[{last}][k{i}]xfade=transition=fade:duration={X}:offset={acc:.3f}[x{i}]"); last = f'x{i}'; acc += clips[i][1]
# subtitles + badges + finishing
inputs += ['-f', 'concat', '-safe', '0', '-i', A + '/subs.txt']; si = N
filt.append(f"[{si}:v]fps={FPS},format=rgba[subs]")
filt.append(f"[{last}]vignette=PI/6,eq=saturation=1.05[bg]"); cur = 'bg'
bi = si + 1
for s in sc:
    if s.get('badge'):
        inputs += ['-loop', '1', '-i', f"{A}/caps/badge_{s['id']}.png"]
        a, b = s['start'] + 0.5, s['start'] + s['L'] - 0.2
        filt.append(f"[{bi}:v]format=rgba,fade=in:st={a:.2f}:d=0.4:alpha=1,fade=out:st={b-0.3:.2f}:d=0.3:alpha=1[bd{bi}]")
        filt.append(f"[{cur}][bd{bi}]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[o{bi}]"); cur = f'o{bi}'; bi += 1
filt.append(f"[{cur}][subs]overlay=0:0:eof_action=pass,fade=in:st=0:d=0.4,fade=out:st={total-0.8:.2f}:d=0.8[vout]")
inputs += ['-i', A + '/voice.wav']; vi = bi
afilt = (f"[{vi}:a]highpass=f=70,deesser=i=0.5:m=0.5:f=0.5,equalizer=f=5000:t=q:w=1.4:g=-3.5,equalizer=f=9000:t=q:w=1.0:g=-3,equalizer=f=180:t=q:w=1.0:g=2,acompressor=threshold=0.1:ratio=2.5:attack=15:release=200,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,apad=whole_dur={total:.2f}[vo];"
         f"anoisesrc=color=pink:amplitude=0.5:sample_rate=48000:duration={total:.2f},highpass=f=80,lowpass=f=900,volume=0.035,afade=t=in:d=1.5,afade=t=out:st={total-1.5:.2f}:d=1.5[amb];"
         f"[vo][amb]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]")
os.makedirs(os.path.dirname(OUTF), exist_ok=True)
run('ffmpeg', '-y', *inputs, '-filter_complex', ';'.join(filt + [afilt]), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k',
    '-t', f'{total:.2f}', '-movflags', '+faststart', OUTF, quiet=False)
print('ok', OUTF)
