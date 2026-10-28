"""Звуковая дорожка к «Пончику»: музыка и шумы синтезируются с нуля.

python3 sound.py <events.json> <out.wav>
Тайминги берутся из events.json, который пишет render.cjs, — картинка и звук
всегда совпадают.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1]))
out_path = sys.argv[2]
T = ev['T']
B = ev['beat']
DUR = ev['duration']
N = int(DUR * SR) + SR // 2
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    s = sig[:j - i] * gain
    a = (pan + 1) * np.pi / 4
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
    """Синус с переменной частотой (freq — число или массив)."""
    f = np.broadcast_to(freq, (int(d * SR),))
    return 2 * np.pi * np.cumsum(f) / SR


# ---------- инструменты ----------
def piano(m, d=0.6, vel=1.0):
    f = midi(m)
    t = tt(d + 0.3)
    s = np.zeros_like(t)
    for k in range(1, 9):
        s += (1 / k ** 1.4) * np.exp(-t * (2.0 + 0.9 * k)) * np.sin(2 * np.pi * f * k * (1 + 0.0003 * k * k) * t + k)
    s *= np.minimum(1, t / 0.004) * np.clip(1 - (t - d) / 0.25, 0, 1)
    return s * vel * 0.35


def upright(m, d=0.6, vel=1.0):
    # старое расстроенное пианино: две струны чуть врозь
    return piano(m, d, vel) * 0.6 + piano(m + 0.12, d, vel) * 0.4


def clarinet(m, d, vel=1.0):
    f = midi(m)
    t = tt(d)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.12) / 0.1, 0, 1)
    ph = osc(f * vib, d)
    s = sum((1 / k) * np.sin(k * ph) for k in (1, 3, 5, 7, 9)) + 0.15 * np.sin(2 * ph)
    s = s + 0.02 * bandnoise(d, 1500, 5000)
    return fade(s, 0.025, 0.05) * vel * 0.22


def tuba(m, d=0.3, vel=1.0):
    f = midi(m)
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) + 0.25 * np.sin(6 * np.pi * f * t)
    return fade(s * np.exp(-t * 3), 0.015, 0.06) * vel * 0.4


def woodblock(f, d=0.12):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 55) + 0.5 * np.sin(2 * np.pi * f * 2.7 * t) * np.exp(-t * 80)
    s += 0.3 * bandnoise(d, 2000, 8000) * np.exp(-t * 300)
    return s * 0.5


def brush(d=0.15):
    return bandnoise(d, 3000, 12000) * np.exp(-tt(d) * 25) * 0.08


def crash(d=1.2):
    return bandnoise(d, 3000, 14000) * np.exp(-tt(d) * 3.5) * 0.12


# ---------- шумы ----------
def thud(f=90, d=0.15):
    t = tt(d)
    return np.sin(osc(f * (1 - 0.3 * t / d), d)) * np.exp(-t * 25) * 0.7


def squeak():
    d = 0.14
    ph = osc(np.linspace(1250, 780, int(d * SR)), d)
    return fade(np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph), 0.005, 0.03) * 0.18


def coo():
    # «гу-у-у»: низкий тон с быстрым тремоло и провалом посередине
    d = 0.42
    t = tt(d)
    u = t / d
    f = 300 + 90 * np.sin(np.pi * u) - 40 * u
    trem = 0.55 + 0.45 * np.sin(2 * np.pi * 26 * t)
    env = np.sin(np.pi * u) ** 0.6 * (1 - 0.7 * np.exp(-((u - 0.32) / 0.06) ** 2))
    ph = osc(f, d)
    s = (np.sin(ph) + 0.35 * np.sin(2 * ph)) * trem * env
    s += 0.05 * bandnoise(d, 200, 900) * env
    return s * 0.35


def slide_whistle(d=0.35, f0=520, f1=1500):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d) * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    ph = osc(f, d)
    s = np.sin(ph) + 0.08 * np.sin(2 * ph) + 0.03 * bandnoise(d, 1000, 6000)
    return fade(s, 0.02, 0.05) * 0.2


def boing(d=0.7, f0=110, f1=210, gain=0.28):
    t = tt(d)
    f = f0 + (f1 - f0) * (1 - np.exp(-t * 30))
    wob = 1 + 0.25 * np.sin(2 * np.pi * 14 * t) * np.exp(-t * 4)
    ph = osc(f * wob, d)
    s = np.sin(ph) + 0.6 * np.sin(2 * ph) + 0.4 * np.sin(3 * ph) + 0.2 * np.sin(5 * ph)
    return fade(s * np.exp(-t * 4.5), 0.003, 0.05) * gain


def whistle(f0, f1, d=0.22):
    t = tt(d)
    f = f0 * (f1 / f0) ** np.clip(t / d * 1.3, 0, 1)
    s = np.sin(osc(f, d)) + 0.05 * bandnoise(d, 2000, 8000)
    return s * np.sin(np.pi * t / d) ** 0.5 * 0.18


def flap():
    d = 0.07
    return bandnoise(d, 300, 3000) * np.sin(np.pi * tt(d) / d) ** 2 * 0.25


def plop():
    d = 0.12
    return np.sin(osc(np.linspace(650, 180, int(d * SR)), d)) * np.exp(-tt(d) * 30) * 0.35


# ---------- музыка ----------
# Вступление под титры: аккорд-«фанфара» и подводка к ходьбе.
t0 = 0.08
for k, m in enumerate((48, 60, 64, 67, 72)):
    add(upright(m, 1.0, 0.9), t0 + 0.02 * k)
add(tuba(36, 0.6), t0)
add(crash(1.0), t0, 0.8)
for k, m in enumerate((67, 72, 76, 79)):
    add(clarinet(m, 0.6 if k == 3 else 0.1), t0 + 0.1 * k)
add(clarinet(62, 0.3), 2.0 - 2 * B / 2)
add(clarinet(63, 0.3), 2.0 - B / 2)

# Ходьба: «умпа» тубы, пианино на слабых долях, кларнет ведёт мелодию.
W0 = T['walk'][0]
bass = [48, 43, 41, 48, 43, 50, 48]
chords = [(60, 64, 67), (60, 64, 67), (60, 65, 69), (60, 65, 69), (59, 65, 67), (59, 65, 67), (60, 64, 67)]
for b in range(7):
    add(tuba(bass[b], 0.3), W0 + b * B)
    for m in chords[b]:
        add(upright(m, 0.18, 0.55), W0 + (b + 0.5) * B)
    add(brush(), W0 + (b + 0.5) * B)
melody = [(0, .5, 64), (.5, .5, 67), (1, 1, 72), (2, .5, 69), (2.5, .5, 72), (3, 1, 69),
          (4, .5, 67), (4.5, .5, 71), (5, .5, 74), (5.5, .5, 77), (6, .45, 76)]
for b, d, m in melody:
    add(clarinet(m, d * B * 0.92), W0 + b * B)

# Финал: «shave and a haircut — two bits».
S0, q = T['shave'], 0.3
for o, m, d in [(0, 72, q), (q, 67, q / 2), (1.5 * q, 67, q / 2), (2 * q, 69, q), (3 * q, 67, q), (5 * q, 71, q), (6 * q, 72, 2.5 * q)]:
    add(clarinet(m, d * 0.9, 1.1), S0 + o)
add(tuba(48, 0.25), S0)
add(tuba(43, 0.25), S0 + 3 * q)
for m in (55, 59, 65):
    add(upright(m, 0.2, 0.8), S0 + 5 * q)
add(tuba(43, 0.25), S0 + 5 * q)
for m in (48, 60, 64, 67, 72):
    add(upright(m, 1.4, 0.9), S0 + 6 * q)
add(tuba(36, 0.9), S0 + 6 * q)
add(crash(1.6), S0 + 6 * q)

# ---------- шумы по сценарию ----------
for st in ev['steps']:
    add(woodblock(820 if st['foot'] == 0 else 1000), st['t'], 0.55, st['pan'])
    add(thud(70, 0.1), st['t'], 0.25, st['pan'])

w1 = T['walk'][1]
cpan = ev['charPanEnd']
ppan = ev['pigeonPan']
add(squeak(), w1 + 0.02, 1.0, cpan)
for c in T['coo']:
    add(coo(), c, 1.0, ppan['lamp'])
add(slide_whistle(), T['look'][0], 1.0, cpan)
add(boing(), T['take'], 1.0, cpan)
add(woodblock(420, 0.1), T['hatDown'], 0.6, cpan)
add(thud(110, 0.08), T['hatDown'], 0.4, cpan)
add(whistle(1500, 2100), T['whistle'][0], 1.0, cpan)
add(whistle(1700, 2500, 0.26), T['whistle'][1], 1.0, cpan)

f0, f1 = T['fly']
tf = f0
while tf < f1 - 0.05:
    u = (tf - f0) / (f1 - f0)
    g = 0.6 + 0.6 * np.sin(np.pi * u)
    add(flap(), tf, g, ppan['lamp'] + (ppan['land'] - ppan['lamp']) * u)
    tf += 0.075 + rng.random() * 0.02
add(plop(), f1, 1.0, ppan['land'])
add(coo(), T['happy'][0] + 0.05, 0.9, ppan['land'])
add(boing(0.4, 200, 380, 0.2), T['hop'][0], 1.0, cpan)
add(thud(80, 0.12), T['hop'][1], 0.5, cpan)

# ---------- фон: треск плёнки и гул проектора ----------
imp = np.zeros(N)
mask = rng.random(N) < 14 / SR
imp[mask] = rng.standard_normal(mask.sum()) * 0.25
crackle = np.convolve(imp, np.exp(-np.arange(48) / 6), mode='same')
hiss = bandnoise(N / SR, 1500, 8000)[:N] * 0.006
hum = bandnoise(N / SR, 60, 400)[:N] * 0.012 * (0.6 + 0.4 * np.sin(2 * np.pi * 24 * np.arange(N) / SR))
amb = crackle + hiss + hum
L += amb
R += amb * 0.9 + np.roll(crackle, 37) * 0.1

# ---------- «старая плёнка»: узкая полоса частот, мягкое насыщение ----------
def vintage(x):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    curve = 1 / np.sqrt(1 + (80 / np.maximum(f, 1)) ** 4) / np.sqrt(1 + (f / 7500) ** 4)
    return np.fft.irfft(X * curve, len(x))


L, R = vintage(L), vintage(R)
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.9, R / peak * 0.9
L, R = np.tanh(1.3 * L) / np.tanh(1.3), np.tanh(1.3 * R) / np.tanh(1.3)
n_out = int(DUR * SR)
fade_n = int(0.5 * SR)
env = np.ones(n_out)
env[-fade_n:] = np.linspace(1, 0, fade_n)
L, R = L[:n_out] * env, R[:n_out] * env
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.89, R / peak * 0.89

pcm = (np.stack([L, R], axis=1) * 32767).astype('<i2')
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'звук: {out_path}, {DUR:.1f} с')
