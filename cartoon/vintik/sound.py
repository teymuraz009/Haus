"""Звук к «Винтику и новому другу»: музыка и шумы синтезируются с нуля (numpy).

python3 sound.py <events.json> <out.wav>
Все тайминги — из events.json, который пишет render.cjs: шаги, повороты головы, прыжки зайца, реплики.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1]))
out_path = sys.argv[2]
DUR = ev['duration']
N = int(DUR * SR) + SR
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(11)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    j = min(N, i + len(sig))
    s = sig[:j - i] * gain
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    L[i:j] += s * np.cos(a) * 1.414
    R[i:j] += s * np.sin(a) * 1.414


def tt(d):
    return np.arange(int(d * SR)) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def fade(sig, a=0.005, r=0.02):
    n = len(sig)
    e = np.ones(n)
    ai, ri = min(n, int(a * SR)), min(n, int(r * SR))
    if ai:
        e[:ai] = np.linspace(0, 1, ai)
    if ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return sig * e


def bandnoise(d, lo, hi):
    n = max(2, int(d * SR))
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.std(y) + 1e-9)


def osc(freq, d):
    f = np.broadcast_to(freq, (int(d * SR),))
    return 2 * np.pi * np.cumsum(f) / SR


# ---------- инструменты ----------
def pluck(m, d=0.8, bright=0.5):
    """Укулеле: алгоритм Карплуса — Стронга."""
    f = midi(m)
    n, P = int(d * SR), max(2, int(SR / f))
    y = np.zeros(n + P + 1)
    y[:P] = bandnoise((P + 2) / SR, 200, 4000 + 6000 * bright)[:P] * 0.6
    decay = 0.996
    for start in range(P, n + P, P):
        idx = np.arange(start, min(start + P, n + P))
        y[idx] = decay * 0.5 * (y[idx - P] + y[idx - P - 1])
    return fade(y[:n], 0.002, 0.05) * 0.5


def glock(m, d=1.4, vel=1.0):
    f = midi(m)
    t = tt(d)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
         + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 7)
         + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 14))
    return fade(s, 0.001, 0.1) * vel * 0.22


def bass(m, d=0.5, vel=1.0):
    f = midi(m)
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)
    return fade(s * np.exp(-t * 3.5), 0.006, 0.06) * vel * 0.42


def pad(notes, d, vel=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for det in (-0.12, 0.12):
            ff = f * 2 ** (det / 12)
            s += sum((0.6 ** k) * np.sin(2 * np.pi * ff * (k + 1) * t + k) for k in range(4))
    env = np.minimum(1, t / 0.35) * np.minimum(1, (d - t) / 0.4)
    return s * env / (len(notes) * 4) * vel * 0.5


def shaker(vel=1.0):
    d = 0.06
    return bandnoise(d, 5000, 12000) * np.exp(-tt(d) * 70) * 0.05 * vel


def kick():
    d = 0.22
    t = tt(d)
    return np.sin(osc(55 + 90 * np.exp(-t * 30), d)) * np.exp(-t * 14) * 0.55


def snap():
    d = 0.1
    return bandnoise(d, 1500, 7000) * np.exp(-tt(d) * 45) * 0.12


# ---------- шумы и голос робота ----------
def chirp(segments, wave_amt=0.25, vib=0.0):
    """Голос робота: цепочка (f0, f1, длительность) с плавными глиссандо."""
    parts = []
    for f0, f1, d in segments:
        t = tt(d)
        f = f0 * (f1 / f0) ** (t / d) * (1 + vib * np.sin(2 * np.pi * 7 * t))
        ph = osc(f, d)
        parts.append(fade(np.sin(ph) + wave_amt * np.sin(3 * ph) + 0.1 * np.sin(2 * ph), 0.008, 0.02))
    return np.concatenate(parts) * 0.16


VOICE = {
    'beep_q': lambda: chirp([(620, 880, 0.11), (700, 1250, 0.2)]),
    'beep_happy': lambda: chirp([(880, 880, 0.08), (1108, 1108, 0.08), (1318, 1318, 0.08), (1760, 1600, 0.22)], vib=0.02),
    'beep_wow': lambda: chirp([(480, 1450, 0.28), (1450, 900, 0.25)], vib=0.015),
    'beep_sad': lambda: chirp([(900, 480, 0.55)], vib=0.03),
    'beep_soft': lambda: chirp([(520, 540, 0.15), (600, 680, 0.22)], wave_amt=0.05),
}


def surprise():
    s = np.concatenate([chirp([(1600, 1700, 0.05), (2000, 2100, 0.05), (1900, 320, 0.28)], wave_amt=0.4)])
    t = tt(0.6)
    spring = np.sin(osc(160 * (1 + 0.3 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 5)), 0.6)) * np.exp(-t * 5) * 0.2
    out = np.zeros(max(len(s), len(spring)))
    out[:len(s)] += s
    out[:len(spring)] += spring
    return out


def step(side):
    d = 0.12
    t = tt(d)
    f = 1400 if side else 1250
    s = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (55 + 20 * k)) for a, k in ((1, 1), (0.5, 2.4), (0.3, 3.9)))
    s += 1.2 * np.sin(osc(150 * np.exp(-t * 8), d)) * np.exp(-t * 30)
    return s * 0.3


def servo():
    d = 0.32
    t = tt(d)
    ph = osc(230 + 120 * t / d + 15 * np.sin(2 * np.pi * 40 * t), d)
    s = sum(np.sin(k * ph) / k for k in range(1, 7))
    s = s * np.sin(np.pi * t / d) ** 0.7 + 0.15 * bandnoise(d, 2000, 6000) * np.sin(np.pi * t / d)
    return s * 0.06


def bells(notes, gap, vel=1.0):
    out = np.zeros(int((gap * len(notes) + 1.5) * SR))
    for k, m in enumerate(notes):
        g = glock(m, 1.4, vel)
        i = int(k * gap * SR)
        out[i:i + len(g)] += g
    return out


def rustle(d=0.45):
    t = tt(d)
    env = np.abs(np.sin(np.pi * t / d)) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 13 * t)))
    return bandnoise(d, 1200, 7000) * env * 0.09


def thump(f0=140, f1=80, d=0.1, gain=0.3):
    t = tt(d)
    return (np.sin(osc(np.linspace(f0, f1, len(t)), d)) * np.exp(-t * 35) + 0.15 * bandnoise(d, 300, 2000) * np.exp(-t * 60)) * gain


def sniff():
    out = np.zeros(int(0.35 * SR))
    for k in range(3):
        d = 0.05
        s = bandnoise(d, 2500, 8000) * np.sin(np.pi * tt(d) / d) * 0.05
        i = int(k * 0.09 * SR)
        out[i:i + len(s)] += s
    return out


def bird():
    out = np.zeros(int(0.4 * SR))
    base = 2800 + rng.random() * 1200
    for k in range(2 + int(rng.random() * 2)):
        d = 0.07
        s = chirp([(base, base * 1.4, d)], wave_amt=0.0) * 0.25
        i = int(k * 0.11 * SR)
        out[i:i + len(s)] += s
    return out


# ---------- музыка ----------
BEAT = 60 / 110
PROG = [('C', [60, 64, 67, 72], 48), ('G', [62, 67, 71, 74], 43), ('Am', [60, 64, 69, 72], 45), ('F', [60, 65, 69, 72], 41)]
MELODY = [
    [(0, 76, 1), (1, 79, .5), (1.5, 81, .5), (2, 79, 1), (3, 76, 1)],
    [(0, 74, 1), (1, 79, 1), (2, 83, .5), (2.5, 81, .5), (3, 79, 1)],
    [(0, 84, 1), (1, 83, .5), (1.5, 81, .5), (2, 76, 1), (3, 81, 1)],
    [(0, 81, 1), (1, 79, .5), (1.5, 77, .5), (2, 76, 1.5), (3.5, 74, .5)],
]
SECTIONS = [(0, 3.5, 'intro'), (3.5, 9.9, 'groove'), (9.9, 13.6, 'wonder'), (13.6, 20.3, 'chase'),
            (20.3, 24.2, 'quiet'), (24.2, 29.8, 'warm'), (29.8, 33.8, 'finale')]


def section(t):
    for a, b, name in SECTIONS:
        if a <= t < b:
            return name
    return None


n_beats = int(33.8 / BEAT)
for b in range(n_beats):
    t = b * BEAT
    sec = section(t)
    bar, beat = b // 4, b % 4
    name, chord, root = PROG[bar % 4]
    if beat == 0 and sec in ('intro', 'wonder', 'warm', 'quiet'):
        add(pad(chord, min(4 * BEAT, 33.8 - t) + 0.3), t, {'intro': 1, 'wonder': 0.9, 'warm': 1, 'quiet': 0.35}[sec])
    if sec in ('groove', 'finale', 'chase'):
        add(bass(root, 0.45), t, 1.0 if beat in (0, 2) else 0.6)
        if beat in (0, 2):
            add(kick(), t, 0.8 if sec != 'chase' else 0.5)
        if beat in (1, 3):
            add(snap(), t, 1.0)
        for k in range(4):
            add(shaker(0.6 + 0.4 * (k % 2)), t + k * BEAT / 4, 0.8, 0.3)
        # укулеле: страм на сильную долю и «чоп» на слабые восьмые
        for half in (0, 0.5):
            if sec == 'chase' and half == 0:
                continue
            for k, m in enumerate(chord):
                add(pluck(m, 0.35 if half else 0.6, 0.6), t + half * BEAT + k * 0.012, 0.55 if half else 0.75, -0.3)
    if sec == 'warm' and beat in (0, 2):
        for k, m in enumerate(chord):
            add(pluck(m + 12, 0.9, 0.3), t + k * BEAT / 4, 0.45, -0.2)
    if beat == 0 and sec in ('intro', 'groove', 'warm', 'finale', 'chase'):
        vel = {'intro': 0.9, 'groove': 0.8, 'warm': 0.7, 'finale': 1.0, 'chase': 0.6}[sec]
        for off, m, d in MELODY[bar % 4]:
            if t + off * BEAT < 33.8:
                add(glock(m, 1.2 + d * BEAT, vel), t + off * BEAT, 1.0, 0.25)
    if sec == 'wonder' and beat in (0, 3):
        add(glock(chord[(b // 3) % 4] + 24, 1.6, 0.5), t + 0.1, 1.0, 0.4)
# финальный аккорд
for k, m in enumerate([48, 60, 64, 67, 72, 76]):
    add(pluck(m, 2.2, 0.4), 33.8 + k * 0.03, 0.8)
add(pad([60, 64, 67, 72], 2.0), 33.8, 1.0)
add(bells([72, 76, 79, 84], 0.09, 0.9), 33.8, 0.8, 0.2)

# ---------- шумы по сцене ----------
for s in ev['steps']:
    add(step(s['side']), s['t'], 1.0, s['pan'])
for s in ev['servo']:
    add(servo(), s['t'], 1.0, s['pan'])
for h in ev['hops']:
    add(thump(), h['t'], 1.0, h['pan'])
for c in ev['cues']:
    t, kind, pan = c['t'], c['type'], c['pan']
    if kind in VOICE:
        add(VOICE[kind](), t, 1.0, pan)
    elif kind == 'surprise':
        add(surprise(), t, 1.0, pan)
    elif kind == 'servo':
        add(servo(), t, 1.0, pan)
    elif kind == 'bloom':
        add(bells([84, 88, 91, 96, 100], 0.11, 0.8), t, 1.0, pan)
        add(bandnoise(1.4, 6000, 14000) * np.exp(-tt(1.4) * 2.5) * 0.02, t, 1.0, pan)
    elif kind == 'sparkle':
        add(bells([96, 91, 100], 0.07, 0.45), t, 1.0, pan)
    elif kind == 'rustle':
        add(rustle(), t, 1.0, pan)
    elif kind == 'land':
        add(thump(120, 60, 0.18, 0.5), t, 1.0, pan)
        add(step(1), t, 0.8, pan)
    elif kind == 'sniff':
        add(sniff(), t, 1.0, pan)

# ---------- фон: птицы и далёкий город ----------
tb = 0.8
while tb < DUR - 1.5:
    add(bird(), tb, 0.6, rng.uniform(-0.8, 0.8))
    tb += 1.8 + rng.random() * 2.2
city = bandnoise(N / SR, 60, 500)[:N] * 0.006
L += city
R += np.roll(city, 400)

# ---------- сведение ----------
n_out = int(DUR * SR)
L, R = L[:n_out], R[:n_out]
fade_n = int(0.8 * SR)
env = np.ones(n_out)
env[-fade_n:] = np.linspace(1, 0, fade_n)
L, R = L * env, R * env
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = np.tanh(1.2 * L / peak) / np.tanh(1.2), np.tanh(1.2 * R / peak) / np.tanh(1.2)
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.89, R / peak * 0.89
pcm = (np.stack([L, R], axis=1) * 32767).astype('<i2')
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'звук: {out_path}, {DUR:.1f} с')
