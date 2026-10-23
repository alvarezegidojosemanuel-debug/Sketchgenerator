"""Ambiente de pájaros sintetizado (mañana tranquila: trinos, gorjeos lejanos y algo de brisa), bucle de 30 s.
El primer segundo es solo brisa: al cambiar de toma el ambiente vuelve a empezar y así no se nota el corte.
Uso: python3 tools/sfx/pajaros.py [semilla] [salida]  (por defecto 11 → public/assets/sfx/pajaros.mp3)"""
import sys, numpy as np, subprocess, tempfile, wave

SR = 44100
DUR = 30.0
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 11
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/assets/sfx/pajaros.mp3"
rng = np.random.default_rng(SEED)
N = int(SR * DUR)
out = np.zeros(N)


def env(n, a=0.12, r=0.5):
    t = np.linspace(0, 1, n)
    return np.minimum(1, t / a) * np.minimum(1, (1 - t) / r) ** 1.5


def tone(f, amp=1.0):
    """f: frecuencia instantánea (array). Con un armónico suave."""
    ph = 2 * np.pi * np.cumsum(f) / SR
    return amp * (np.sin(ph) + 0.18 * np.sin(2 * ph))


def put(sig, at, gain, pan_far=False):
    i = int(at * SR) % N
    n = len(sig)
    idx = (np.arange(n) + i) % N
    out[idx] += sig * gain


def chirp(f0, f1, dur):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    f = f0 + (f1 - f0) * (t ** 0.7)
    return tone(f) * env(n, 0.15, 0.6)


def trill(at, base, gain, count):
    """pío-pío-pío rápido"""
    for k in range(count):
        d = rng.uniform(0.05, 0.08)
        put(chirp(base * rng.uniform(0.95, 1.05), base * rng.uniform(1.25, 1.5), d), at + k * (d + rng.uniform(0.02, 0.05)), gain)


def warble(at, base, gain, dur):
    """gorjeo: frecuencia con vibrato rápido"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = base * (1 + 0.12 * np.sin(2 * np.pi * rng.uniform(14, 22) * t) + 0.08 * np.sin(2 * np.pi * 3 * t))
    put(tone(f) * env(n, 0.1, 0.3), at, gain)


def whistle(at, gain):
    """silbido de dos notas (como un mirlo lejano)"""
    a, b = rng.uniform(1800, 2400), rng.uniform(2600, 3200)
    put(chirp(a, a * 1.05, 0.22), at, gain)
    put(chirp(b, b * 0.92, 0.28), at + 0.3, gain)


t = 1.2
while t < DUR - 1.0:
    kind = rng.random()
    near = rng.random() < 0.45
    g = 0.22 if near else 0.08
    if kind < 0.45:
        trill(t, rng.uniform(3800, 5200), g, rng.integers(3, 8))
    elif kind < 0.75:
        warble(t, rng.uniform(2800, 4200), g * 0.8, rng.uniform(0.4, 1.0))
    else:
        whistle(t, g * 1.1)
    t += rng.uniform(0.6, 2.2)

# brisa: ruido rosa muy suave y filtrado
w = rng.standard_normal(N)
w = np.convolve(w, np.ones(400) / 400, mode="same")
w = np.convolve(w, np.ones(40) / 40, mode="same")
w *= 0.6 * (1 + 0.5 * np.sin(2 * np.pi * np.arange(N) / SR / 7))
out += w * 0.9

# reverberación sencilla (exterior abierto: cola corta)
ir_n = int(0.6 * SR)
ir = rng.standard_normal(ir_n) * np.exp(-np.linspace(0, 9, ir_n))
ir[0] = 1.0
wet = np.fft.irfft(np.fft.rfft(out, N + ir_n) * np.fft.rfft(ir, N + ir_n))[: N + ir_n]
wet[:ir_n] += wet[N:N + ir_n]  # la cola vuelve al principio: bucle sin corte
out = 0.75 * out + 0.12 * wet[:N] / np.abs(ir).sum() * 8

# nivel parecido a los ambientes grabados (≈ −30 dB RMS)
out = out / np.sqrt(np.mean(out ** 2)) * 10 ** (-30 / 20)
out = np.clip(out, -0.99, 0.99)
pcm = (out * 32767).astype(np.int16)
with tempfile.NamedTemporaryFile(suffix=".wav") as f:
    with wave.open(f.name, "wb") as wv:
        wv.setnchannels(1); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-ac", "1", "-b:a", "96k", OUT], check=True)
print("ok", round(float(np.abs(out).max()), 3))
