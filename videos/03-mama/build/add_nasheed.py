# usage: python3 add_nasheed.py <video.mp4> <nasheed.mp3> <out.mp4> [nasheed loudness LUFS, default -17] [voice gain dB, default -6]
# Mixes a quiet vocal-only nasheed under the existing voiceover, ducked while the voice speaks.
import subprocess, sys
V, N, OUT = sys.argv[1:4]
LUFS = float(sys.argv[4]) if len(sys.argv) > 4 else -17
VOICE_DB = float(sys.argv[5]) if len(sys.argv) > 5 else -6
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', V]))
f = (f"[0:a]asplit[v0][key];[v0]volume={VOICE_DB}dB[vo];"
     f"[1:a]atrim=0:{dur:.2f},asetpts=PTS-STARTPTS,loudnorm=I={LUFS}:TP=-3,aresample=48000,"
     f"afade=t=in:d=2.5,afade=t=out:st={dur-3:.2f}:d=3[n];"
     f"[n][key]sidechaincompress=threshold=0.02:ratio=3:attack=40:release=600[nd];"
     f"[vo][nd]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', V, '-i', N, '-filter_complex', f, '-map', '0:v', '-map', '[a]',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT], check=True)
print('ok', OUT)
