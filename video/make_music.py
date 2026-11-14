"""
Original music bed for a narrated demo video, synthesised from scratch.

No samples and nothing to license: every sound is generated here with numpy,
and the random seed is fixed, so the same section list always gives the same
file. This is how the Quorum waitlist video was scored (scripts/make_audio.py
in that project) and how Hapax v3 was scored; the HeyGen music catalogue needs
an interactive sign-in and has been unreliable, so this is the default.

The score follows the video's story through SECTIONS: each section names its
start second, its mood and its intensity. Moods:

    tense   minor key, pad + slow low pulse, no drums          (the problem)
    lift    relative major, bell arpeggio enters                (the reveal)
    groove  pad + soft bass pulse + light hi-hats               (explaining)
    under   the same groove, quieter and sparser                (live demo under voice)
    resolve brighter pad + arpeggio + soft kick, final chord    (the close)

Edit SECTIONS, DUR, KEY and BPM for a new video, then:

    python make_music.py out.wav

and mix it ducked under the narration (sidechaincompress), as mix.mjs does.
"""
import sys
import wave
import numpy as np

SR = 48000
rng = np.random.default_rng(11)

# ---------------------------------------------------------------- per video --
DUR = 162.5
BPM = 84
KEY = 52  # E: minor = E minor, major = G major
SECTIONS = [  # (start second, mood, intensity 0..1)
    (0.0, 'tense', 0.42),
    (55.0, 'lift', 0.7),
    (56.6, 'under', 0.48),
    (142.4, 'lift', 0.62),
    (149.2, 'resolve', 0.8),
]
# ------------------------------------------------------------------------------

N = int(SR * DUR)
beat = 60 / BPM
eighth = beat / 2
bar = beat * 4


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(n):
    return np.arange(n) / SR


def lowpass(x, cutoff):
    """One-pole low-pass, as a truncated exponential convolution (vectorised)."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    klen = int(min(len(x), max(16, np.log(1e-4) / np.log(a))))
    k = (1 - a) * a ** np.arange(klen)
    return np.convolve(x, k)[: len(x)]


def env(n, a=0.01, r=0.2, s=0.8, d=0.1):
    e = np.full(n, s)
    na, nd, nr = max(int(a * SR), 1), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na)
    seg = e[na:na + nd]
    if len(seg):
        e[na:na + nd] = np.linspace(1, s, len(seg))
    if 0 < nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def saw(f, n):
    t = t_axis(n)
    return 2 * ((t * f) % 1.0) - 1


def tone(f, length, kind, vol, cutoff=1800, a=0.01, r=0.2, s=0.8, d=0.1):
    n = int(length * SR)
    t = t_axis(n)
    if kind == 'pad':
        sig = (saw(f, n) + saw(f * 1.006, n) + saw(f * 0.994, n)) / 3
        sig = lowpass(sig, cutoff)
    elif kind == 'bass':
        sig = lowpass(0.6 * saw(f, n) + 0.4 * np.sin(2 * np.pi * f * t), cutoff)
    elif kind == 'bell':
        sig = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t) + 0.12 * np.sin(2 * np.pi * f * 3 * t)
    else:
        sig = np.sin(2 * np.pi * f * t)
    return sig * env(n, a, r, s, d) * vol


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(i + len(sig), len(buf))
    buf[i:j] += sig[: j - i]


def section_at(t):
    cur = SECTIONS[0]
    for s in SECTIONS:
        if t >= s[0]:
            cur = s
    return cur


# Progressions, relative to KEY. Minor: i VI III VII. Major (relative): I V vi IV.
MINOR = [(0, [0, 3, 7]), (-4, [-4, 0, 3]), (3, [3, 7, 10]), (-2, [-2, 2, 5])]
MAJOR = [(3, [3, 7, 10]), (-2, [-2, 2, 5]), (0, [0, 3, 7]), (-4, [-4, 0, 3])]

music = np.zeros(N)

# Pad: one chord per bar, the whole length.
i = 0
while i * bar < DUR:
    t0 = i * bar
    _, mood, inten = section_at(t0)
    root, chord = (MINOR if mood == 'tense' else MAJOR)[i % 4]
    cutoff = {'tense': 900, 'lift': 1600, 'groove': 1500, 'under': 1200, 'resolve': 2400}[mood]
    vol = 0.05 * inten
    for m in chord:
        add(music, tone(hz(KEY + m), bar * 1.05, 'pad', vol, cutoff, a=0.8, r=0.9, s=0.9), t0)
    i += 1

# Low pulse / bass.
t0, k = 0.0, 0
while t0 < DUR - 0.3:
    _, mood, inten = section_at(t0)
    bar_i = int(t0 // bar)
    root, _ = (MINOR if mood == 'tense' else MAJOR)[bar_i % 4]
    f = hz(KEY + root - 24)
    if mood == 'tense':  # slow: quarter notes, dark
        add(music, tone(f, beat * 0.9, 'bass', 0.12 * inten, 260, a=0.02, r=0.2, s=0.7), t0)
        t0 += beat
    else:  # eighths, accent on the beat
        acc = 1.2 if k % 2 == 0 else 0.75
        cut = 520 if mood == 'under' else 760
        add(music, tone(f, eighth * 0.85, 'bass', 0.11 * inten * acc, cut, a=0.005, r=0.06, s=0.6), t0)
        t0 += eighth
    k += 1

# Hi-hats: groove, under (sparser), resolve.
t0 = 0.0
while t0 < DUR - 0.5:
    _, mood, inten = section_at(t0)
    if mood in ('groove', 'under', 'resolve'):
        n = int(0.035 * SR)
        h = rng.standard_normal(n) * np.exp(-np.linspace(0, 10, n))
        h = h - lowpass(h, 7000)
        step = int(round(t0 / eighth))
        if mood != 'under' or step % 2 == 1:  # under: offbeats only
            add(music, h * 0.035 * inten, t0)
    t0 += eighth

# Soft kick on the beat in the close.
t0 = 0.0
while t0 < DUR - 2.5:
    _, mood, inten = section_at(t0)
    if mood == 'resolve':
        n = int(0.32 * SR)
        tt = t_axis(n)
        fr = 95 * np.exp(-tt * 16) + 42
        add(music, np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 9) * 0.22 * inten, t0)
    t0 += beat

# Bell arpeggio: the reveal and the close.
ARP = [12, 16, 19, 24, 19, 16]  # around the relative major's tonic
t0, j = 0.0, 0
while t0 < DUR - 2.5:
    _, mood, inten = section_at(t0)
    if mood in ('lift', 'resolve'):
        bar_i = int(t0 // bar)
        root, _ = MAJOR[bar_i % 4]
        add(music, tone(hz(KEY + root + ARP[j % len(ARP)] - 12), eighth * 0.95, 'bell', 0.03 * inten, a=0.004, r=0.3, s=0.35, d=0.2), t0)
        j += 1
    t0 += eighth

# Final chord rings out.
for m in [3, 7, 10, 15]:
    add(music, tone(hz(KEY + m), 4.0, 'pad', 0.05, 2600, a=0.05, r=2.5, s=0.9), DUR - 4.2)

# Shape: fade in, gentle swells into each section change, fade out.
shape = np.ones(N)
fi = int(2.0 * SR)
shape[:fi] = np.linspace(0, 1, fi)
fo = int(3.5 * SR)
shape[-fo:] *= np.linspace(1, 0, fo) ** 1.4
for s, mood, _ in SECTIONS[1:]:
    a, b = int((s - 0.6) * SR), int(s * SR)
    shape[a:b] *= np.linspace(1, 0.55, b - a)  # a breath before each change
music *= shape

peak = np.max(np.abs(music)) or 1.0
music = music / peak * 0.89
out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
stereo = np.stack([music, music], axis=1)
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype('<i2').tobytes())
print('wrote', out, f'{DUR:.1f}s', f'{BPM} bpm')
