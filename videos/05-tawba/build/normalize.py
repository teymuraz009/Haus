# usage: python3 normalize.py <in.mp4> <out.mp4>  — two-pass loudnorm to YouTube level (-14 LUFS), video copied
import json, re, subprocess, sys
src, out = sys.argv[1:3]
err = subprocess.run(['ffmpeg', '-i', src, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-vn', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
m = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', err, re.S).group(0))
af = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
      f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', af, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], check=True)
print('ok', out)
