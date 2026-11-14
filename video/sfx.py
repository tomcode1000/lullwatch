# Original sound effects, synthesised (no samples): tap, chime, error, whoosh, flip, pop, key.
import numpy as np, wave
SR = 48000
rng = np.random.default_rng(7)
def save(name, x):
    x = x / (np.abs(x).max() + 1e-9) * 0.9
    s = np.int16(np.clip(x, -1, 1) * 32767)
    with wave.open(f'sfx/{name}.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(s.tobytes())
t = lambda d: np.arange(int(SR * d)) / SR
def env(d, a, r): x = t(d); return np.minimum(1, x / a) * np.exp(-x / r)
# tap: a short soft click, like a phone tap
x = t(0.05); save('tap', (rng.standard_normal(len(x)) * np.exp(-x / 0.004) * 0.5 + np.sin(2*np.pi*1800*x) * np.exp(-x/0.01)))
# chime: two bell partials, a fifth apart
x = t(1.2); b = lambda f: np.sin(2*np.pi*f*x) + 0.4*np.sin(2*np.pi*f*2.76*x)*np.exp(-x/0.15)
save('chime', b(1318.5) * env(1.2, 0.004, 0.35) + np.concatenate([np.zeros(int(SR*0.09)), (b(1975.5) * env(1.2, 0.004, 0.4))[:-int(SR*0.09)]]))
# error: low two-note buzz
x = t(0.5); tone = lambda f: np.sign(np.sin(2*np.pi*f*x)) * 0.3 + np.sin(2*np.pi*f*x)
e = np.where(x < 0.17, tone(330), tone(262)) * np.minimum(1, x/0.005) * np.exp(-x/0.22)
save('error', np.convolve(e, np.ones(12)/12, 'same'))
# whoosh: filtered noise sweep
x = t(0.7); n = rng.standard_normal(len(x)); out = np.zeros_like(n); y = 0
cut = 0.02 + 0.25 * np.sin(np.pi * x / 0.7)
for i in range(len(n)): y += cut[i] * (n[i] - y); out[i] = y
save('whoosh', out * np.sin(np.pi * x / 0.7) ** 2)
# flip: split-flap clatter
x = t(0.35); f = np.zeros_like(x)
for k in range(6):
    s0 = int(SR * k * 0.045); seg = rng.standard_normal(int(SR*0.02)) * np.exp(-np.arange(int(SR*0.02))/SR/0.003)
    f[s0:s0+len(seg)] += seg * (1 - k*0.1)
save('flip', f)
# pop: soft UI pop
x = t(0.18); save('pop', np.sin(2*np.pi*(520 + 900*np.exp(-x/0.02))*x) * env(0.18, 0.002, 0.04))
# key: keyboard tick
x = t(0.03); save('key', rng.standard_normal(len(x)) * np.exp(-x/0.0025))
print('ok')
