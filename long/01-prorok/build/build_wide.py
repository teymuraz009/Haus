# usage: python3 build_wide.py <assets_dir> <out.mp4> <nasheed1.mp3> [<nasheed2.mp3> ...]
# 16:9 long-form build: Ken Burns clips (rendered in parallel), crossfades, word-highlight subtitles,
# source badges, chapter title cards, soft-processed voice, looped vocal nasheed bed, -14 LUFS.
import json, os, re, subprocess, sys, wave
from concurrent.futures import ThreadPoolExecutor
A, OUTF, NASHEEDS = sys.argv[1], sys.argv[2], sys.argv[3:]
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
S = json.load(open(ROOT + '/script.json', encoding='utf-8'))
W, H = S.get('size', [1920, 1080]); FPS, GAP, X = 30, S.get('gap', 0.6), 0.8
def run(*a, quiet=True): subprocess.run(a, check=True, stderr=subprocess.DEVNULL if quiet else None)
sc = S['scenes']
for s in sc:
    w = wave.open(f"{A}/{s['id']}.wav"); s['dur'] = w.getnframes() / w.getframerate()
t = 0.6  # short silence before the first word
for s in sc: s['start'] = t; s['L'] = s['dur'] + s.get('pause', GAP); t += s['L']
total = t + 1.5
print('total', round(total, 2))
# --- voice track
vw = wave.open(A + '/voice.wav', 'wb'); vw.setnchannels(1); vw.setsampwidth(2); vw.setframerate(24000)
vw.writeframes(b'\0\0' * int(0.6 * 24000))
for s in sc:
    vw.writeframes(wave.open(f"{A}/{s['id']}.wav").readframes(10**9)); vw.writeframes(b'\0\0' * int(s.get('pause', GAP) * 24000))
vw.writeframes(b'\0\0' * int(1.5 * 24000)); vw.close()
# --- captions: word-highlight subtitles, badges, chapter cards
def weight(w):
    c = re.sub(r'[^\wё]', '', w, flags=re.I); x = len(c) + 1
    if w.endswith(('.', '?', '!', '…', '»')): x += 5
    elif w.endswith((',', ':', ';', '—')): x += 2
    return x
caps, timeline, chap_n = [], [], 0
for s in sc:
    words = s['text'].replace(' — ', ' — ').split(' ')
    wts = [weight(w) for w in words]; tot = sum(wts); pos = s['start'] + 0.05; spans = []
    for w, k in zip(words, wts):
        d = (s['dur'] - 0.05) * k / tot; spans.append((pos, pos + d)); pos += d
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        if w.endswith(('.', '?', '!', '…', '».', '»')) or len(cur) >= 6 or sum(len(words[j]) for j in cur) > 34:
            chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    for ch in chunks:
        for i in ch:
            name = f"{s['id']}_{i:02d}"
            caps.append({'kind': 'sub', 'name': name, 'words': [words[j] for j in ch], 'on': ch.index(i)})
            timeline.append((spans[i][0], spans[i][1], name))
    if s.get('badge'):
        b = s['badge']; caps.append({'kind': 'badge', 'name': f"badge_{s['id']}", 'ar': b.get('ar'), 'ru': b['ru']})
    if s.get('chapter'):
        chap_n += 1; s['chap_n'] = chap_n
        caps.append({'kind': 'chapter', 'name': f"chap_{s['id']}", 'num': f'Глава {chap_n}', 'title': s['chapter']})
json.dump(caps, open(A + '/caps.json', 'w'), ensure_ascii=False)
env = dict(os.environ, NODE_PATH=subprocess.check_output(['npm', 'root', '-g'], text=True).strip())
subprocess.run(['node', HERE + '/render_caps_wide.js', A], check=True, env=env)
run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'color=c=black@0.0:s={W}x{H},format=rgba', '-frames:v', '1', A + '/caps/blank.png')
lines, cur_t = [], 0.0
for a, b, name in timeline:
    if a > cur_t + 1e-3: lines.append(('blank', a - cur_t))
    lines.append((name, b - max(a, cur_t))); cur_t = b
if total > cur_t: lines.append(('blank', total - cur_t))
with open(A + '/subs.txt', 'w') as f:
    for n, d in lines: f.write(f"file 'caps/{n}.png'\nduration {d:.3f}\n")
    f.write(f"file 'caps/{lines[-1][0]}.png'\n")
# --- Ken Burns clips, rendered in parallel
clips = []
for k, s in enumerate(sc):
    n = len(s['imgs']); per = s['L'] / n
    if k == 0: per += 0.6 / n
    if k == len(sc) - 1: per += 1.5 / n
    for im in s['imgs']: clips.append((im, per))
os.makedirs(A + '/clips', exist_ok=True)
def kb(i):
    im, L = clips[i]; c = L + (X if i < len(clips) - 1 else 0); fr = int(round(c * FPS))
    rate = 0.08 / fr; z = f"min(1.0+{rate:.6f}*on,1.08)" if i % 2 == 0 else f"max(1.08-{rate:.6f}*on,1.0)"
    px = ('+' if i % 3 else '-') + f"{(i % 4) * 0.3 + 0.4:.2f}*on"
    out = f"{A}/clips/k{i:03d}.mp4"
    run('ffmpeg', '-y', '-loop', '1', '-t', f'{c:.3f}', '-i', f"{A}/img{im:02d}.png", '-vf',
        f"scale={2*W}:{2*H}:flags=lanczos,zoompan=z='{z}':x='iw/2-(iw/zoom/2){px}':y='ih/2-(ih/zoom/2)':d={fr}:s={W}x{H}:fps={FPS},format=yuv420p,setsar=1",
        '-frames:v', str(fr), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out)
    return out
with ThreadPoolExecutor(max_workers=4) as ex: files = list(ex.map(kb, range(len(clips))))
inputs, filt = [], []
for f in files: inputs += ['-i', f]
last, acc = '0:v', clips[0][1]
for i in range(1, len(files)):
    filt.append(f"[{last}][{i}:v]xfade=transition=fade:duration={X}:offset={acc:.3f}[x{i}]"); last = f'x{i}'; acc += clips[i][1]
N = len(files)
inputs += ['-f', 'concat', '-safe', '0', '-i', A + '/subs.txt']; si = N
filt.append(f"[{si}:v]fps={FPS},format=rgba[subs]")
filt.append(f"[{last}]vignette=PI/6,eq=saturation=1.05[bg]"); cur = 'bg'; ii = si + 1
for s in sc:
    if s.get('badge'):
        inputs += ['-loop', '1', '-i', f"{A}/caps/badge_{s['id']}.png"]
        a, b = s['start'] + 0.4, s['start'] + s['L'] - 0.2
        filt.append(f"[{ii}:v]format=rgba,fade=in:st={a:.2f}:d=0.4:alpha=1,fade=out:st={b-0.35:.2f}:d=0.35:alpha=1[bd{ii}]")
        filt.append(f"[{cur}][bd{ii}]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[o{ii}]"); cur = f'o{ii}'; ii += 1
    if s.get('chapter'):
        inputs += ['-loop', '1', '-i', f"{A}/caps/chap_{s['id']}.png"]
        a, b = max(s['start'] - 0.5, 0), s['start'] + 3.2
        filt.append(f"[{ii}:v]format=rgba,fade=in:st={a:.2f}:d=0.6:alpha=1,fade=out:st={b-0.6:.2f}:d=0.6:alpha=1[ch{ii}]")
        filt.append(f"[{cur}][ch{ii}]overlay=0:0:enable='between(t,{a:.2f},{b:.2f})'[o{ii}]"); cur = f'o{ii}'; ii += 1
filt.append(f"[{cur}][subs]overlay=0:0:eof_action=pass,fade=in:st=0:d=1.0,fade=out:st={total-2:.2f}:d=2[vout]")
# audio: soft voice (-6 dB under the bed) + crossfaded nasheed bed, ducked under speech
inputs += ['-i', A + '/voice.wav']; vi = ii; ii += 1
for n in NASHEEDS: inputs += ['-i', n]
bed = f"[{ii}:a]"
for j in range(1, len(NASHEEDS)):
    filt.append(f"{bed}[{ii+j}:a]acrossfade=d=6:c1=tri:c2=tri[bed{j}]"); bed = f"[bed{j}]"
af = (f"[{vi}:a]highpass=f=70,deesser=i=0.5:m=0.5:f=0.5,equalizer=f=5000:t=q:w=1.4:g=-3.5,equalizer=f=9000:t=q:w=1.0:g=-3,"
      f"equalizer=f=180:t=q:w=1.0:g=2,acompressor=threshold=0.1:ratio=2.5:attack=15:release=200,loudnorm=I=-16:TP=-1.5:LRA=7,"
      f"aresample=48000,apad=whole_dur={total:.2f},asplit[v0][key];[v0]volume=-6dB[vo];"
      f"{bed}atrim=0:{total:.2f},asetpts=PTS-STARTPTS,loudnorm=I=-11:TP=-3,aresample=48000,afade=t=in:d=3,afade=t=out:st={total-4:.2f}:d=4[n];"
      f"[n][key]sidechaincompress=threshold=0.02:ratio=3:attack=40:release=600[nd];[vo][nd]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]")
filt.append(af)
tmp = A + '/premix.mp4'
run('ffmpeg', '-y', *inputs, '-filter_complex', ';'.join(filt), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k',
    '-t', f'{total:.2f}', '-movflags', '+faststart', tmp, quiet=False)
subprocess.run([sys.executable, '-I', HERE + '/normalize.py', tmp, OUTF], check=True)
with open(ROOT + '/chapters.txt', 'w', encoding='utf-8') as f:
    f.write('0:00 Он скучал по тебе\n')
    for s in sc:
        if s.get('chapter'):
            m, sec = divmod(int(max(s['start'] - 0.5, 0)), 60); f.write(f"{m}:{sec:02d} {s['chapter']}\n")
print('ok', OUTF)
