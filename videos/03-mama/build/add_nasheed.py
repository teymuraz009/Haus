# usage: python3 add_nasheed.py <video.mp4> <nasheed.mp3> <out.mp4>
# Mixes a quiet vocal-only nasheed under the existing voiceover, ducked while the voice speaks.
import subprocess, sys
V, N, OUT = sys.argv[1:4]
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', V]))
f = (f"[0:a]asplit[vo][key];"
     f"[1:a]atrim=0:{dur:.2f},asetpts=PTS-STARTPTS,loudnorm=I=-27:TP=-3,aresample=48000,"
     f"afade=t=in:d=2.5,afade=t=out:st={dur-3:.2f}:d=3[n];"
     f"[n][key]sidechaincompress=threshold=0.02:ratio=5:attack=40:release=600[nd];"
     f"[vo][nd]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', V, '-i', N, '-filter_complex', f, '-map', '0:v', '-map', '[a]',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT], check=True)
print('ok', OUT)
