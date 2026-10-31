# usage: python3 add_wind.py <video.mp4> <voice_processed.wav> <out.mp4>
# Procedural desert-wind ambience (filtered noise, no melody possible) under the voice, ducked while speaking.
import subprocess, sys
V, VOICE, OUT = sys.argv[1:4]
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', V]))
d = f"{dur:.2f}"
f = (
    # low rumble: brown noise, slowly breathing
    f"anoisesrc=color=brown:amplitude=0.6:sample_rate=48000:duration={d}:seed=7,lowpass=f=220,highpass=f=35,"
    f"volume='0.55+0.30*sin(2*PI*t/11)*sin(2*PI*t/29+1)':eval=frame[low];"
    # gusts: pink noise band, swelling and fading
    f"anoisesrc=color=pink:amplitude=0.5:sample_rate=48000:duration={d}:seed=11,bandpass=f=600:width_type=q:w=0.7,"
    f"volume='0.12+0.45*pow(max(0,sin(2*PI*t/17)*sin(2*PI*t/7.3+2)),2)':eval=frame[gust];"
    # sand hiss: very quiet high band
    f"anoisesrc=color=white:amplitude=0.3:sample_rate=48000:duration={d}:seed=3,highpass=f=3500,lowpass=f=9000,"
    f"volume='0.04+0.05*max(0,sin(2*PI*t/13+0.5))':eval=frame[hiss];"
    f"[low][gust][hiss]amix=inputs=3:normalize=0,loudnorm=I=-36:TP=-9,afade=t=in:d=3,afade=t=out:st={dur-3:.2f}:d=3[wind];"
    f"[1:a]loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,asplit[vo][key];"
    f"[wind][key]sidechaincompress=threshold=0.03:ratio=2:attack=80:release=900[wd];"
    f"[vo][wd]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]"
)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', V, '-i', VOICE, '-filter_complex', f, '-map', '0:v', '-map', '[a]',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', d, '-movflags', '+faststart', OUT], check=True)
print('ok', OUT)
