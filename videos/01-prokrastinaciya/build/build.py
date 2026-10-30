import json, wave, subprocess, os
GAP = 0.25
order = ['s1','s2','s3','s4','s5','s6','s7']
dur = {}
for k in order:
    w = wave.open(f'{k}.wav'); dur[k] = w.getnframes()/w.getframerate()
# voice track with gaps
vw = wave.open('voice.wav','wb'); vw.setnchannels(1); vw.setsampwidth(2); vw.setframerate(24000)
start = {}; t = 0.0
for k in order:
    start[k] = t
    w = wave.open(f'{k}.wav'); vw.writeframes(w.readframes(w.getnframes()))
    vw.writeframes(b'\x00\x00' * int(GAP*24000)); t += dur[k] + GAP
vw.close(); total = t
print('total', round(total,2), {k: round(v,2) for k,v in start.items()})
seg = {k: dur[k]+GAP for k in order}
src = {'s1':None,'s2':'v1','s3':'v2','s4':'v3','s5':'v4','s6':'v4','s7':None}
def run(*a): subprocess.run(a, check=True, stderr=None if a[0:2]==('ffmpeg','-y') and '-filter_complex' in a and 'libx264' in a and '-t' in a else subprocess.DEVNULL)
# video segments
for k in order:
    L = seg[k]; out = f'seg_{k}.mp4'
    if os.path.exists(out): continue
    base = ['-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-r','30']
    grade = 'eq=brightness=-0.10:saturation=0.95,vignette=PI/5'
    if src[k] is None:
        run('ffmpeg','-y','-f','lavfi','-i',f'color=c=0x07080d:s=1080x1920:r=30:d={L}','-vf','vignette=PI/4,format=yuv420p',*base,out)
    elif k == 's4':
        run('ffmpeg','-y','-i','v3.mp4','-filter_complex',f'[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1,setpts=PTS*{L/10.08:.5f},minterpolate=fps=30:mi_mode=blend,{grade},trim=duration={L},setpts=PTS-STARTPTS',*base,out)
    elif k == 's6':
        run('ffmpeg','-y','-ss','2.2','-i','v4.mp4','-vf',f'setpts=PTS*{L/2.84:.5f},minterpolate=fps=30:mi_mode=blend,eq=brightness=-0.02:saturation=1.05,trim=duration={L},setpts=PTS-STARTPTS',*base,out)
    else:
        run('ffmpeg','-y','-i',src[k]+'.mp4','-vf',f'setpts=PTS*{L/5.04:.5f},minterpolate=fps=30:mi_mode=blend,{grade},trim=duration={L},setpts=PTS-STARTPTS',*base,out)
with open('list.txt','w') as f:
    for k in order: f.write(f"file 'seg_{k}.mp4'\n")
run('ffmpeg','-y','-f','concat','-safe','0','-i','list.txt','-c','copy','bg.mp4')
# overlays
caps = json.load(open('captions.json'))
inputs = ['-i','bg.mp4']; filt = []; last = '0:v'
for i,c in enumerate(caps):
    a = start[c['scene']] + c['t0']; b = start[c['scene']] + c['t1']; d = b - a
    inputs += ['-loop','1','-t',f'{d:.2f}','-i',f'caps/c{i:02d}.png']
    filt.append(f"[{i+1}:v]format=rgba,fade=in:st=0:d=0.28:alpha=1,fade=out:st={d-0.25:.2f}:d=0.25:alpha=1,setpts=PTS+{a:.2f}/TB[o{i}]")
    filt.append(f"[{last}][o{i}]overlay=0:0:eof_action=pass[v{i}]"); last = f'v{i}'
filt.append(f"[{last}]noise=alls=5:allf=t,fade=in:st=0:d=0.3,fade=out:st={total-0.6:.2f}:d=0.6[vout]")
# audio: voice + ducked music
afilt = (f"[{len(caps)+1}:a]loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,apad=whole_dur={total:.2f},asplit[vo1][vo2];"
         f"[{len(caps)+2}:a]atrim=0:{total:.2f},asetpts=PTS-STARTPTS,volume=0.55,afade=t=in:d=1.5,afade=t=out:st={total-1.8:.2f}:d=1.8,aresample=48000[mu];"
         f"[mu][vo1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[vo2][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]")
inputs += ['-i','voice.wav','-i','music.mp3']
os.makedirs('/home/user/Haus/videos/01-prokrastinaciya', exist_ok=True)
OUTF = '/home/user/Haus/videos/01-prokrastinaciya/shorts_9x16.mp4'
run('ffmpeg','-y',*inputs,'-filter_complex',';'.join(filt+[afilt]),'-map','[vout]','-map','[aout]','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-t',f'{total:.2f}','-movflags','+faststart',OUTF)
print('ok', OUTF)
