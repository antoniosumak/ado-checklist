# Song excerpt on a measured downbeat + UI sounds placed by their measured peaks. Periodic: sounds wrap around the loop.
import json, subprocess, numpy as np
SR, L = 48000, 32.0
START = 40.007  # downbeat of the 16-bar groove (grid.py: 119.99 BPM, phase 0.0035 s); 40.007–72.011 loops as one phrase
raw = subprocess.run(['ffmpeg','-v','quiet','-ss',str(START),'-t',str(L),'-i','../songs/201.mp3','-ac','2','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
song = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
N = int(SR * L); song = np.pad(song, ((0, max(0, N - len(song))), (0, 0)))[:N]

rng = np.random.default_rng(7)
t = lambda d: np.arange(int(SR * d)) / SR
def env(x, a, d): tt = t(len(x) / SR); return x * np.minimum(1, tt / a) * np.exp(-tt / d)
def hp_noise(d): n = rng.standard_normal(int(SR * d)); return np.diff(n, prepend=0)
def tap():   x = 0.5 * env(hp_noise(.03), .0005, .004) + 0.35 * env(np.sin(2*np.pi*2300*t(.03)), .0005, .005) + 0.4 * env(np.sin(2*np.pi*170*t(.03)), .001, .01); return 0.16 * x
def enter(): x = 0.6 * env(hp_noise(.05), .0005, .006) + 0.7 * env(np.sin(2*np.pi*120*t(.05)), .001, .018) + 0.3 * env(np.sin(2*np.pi*1900*t(.05)), .0005, .006); return 0.24 * x
def click(): x = env(np.sin(2*np.pi*3600*t(.02)), .0003, .0016) + 0.6 * env(np.sin(2*np.pi*1250*t(.02)), .0003, .004); return 0.22 * x
def tick():  x = env(np.sin(2*np.pi*1568*t(.2)), .002, .05) + 0.35 * env(np.sin(2*np.pi*2352*t(.2)), .002, .03); return 0.11 * x
def chime(): a = env(np.sin(2*np.pi*1318.5*t(.6)), .003, .22); b = np.pad(env(np.sin(2*np.pi*1975.5*t(.5)), .003, .25), (int(SR*.09), int(SR*.1)))[:len(a)]; return 0.12 * (a + 0.3 * b)
def soft():  return 0.07 * env(np.sin(2*np.pi*440*t(.12)), .004, .03)
def pop():   tt = t(.08); f = 900 + 600 * np.minimum(1, tt / .03); return 0.08 * env(np.sin(2*np.pi*np.cumsum(f)/SR), .002, .03)
SOUNDS = {k: v() for k, v in dict(tap=tap, enter=enter, click=click, tick=tick, chime=chime, soft=soft, pop=pop).items()}
PEAK = {k: int(np.argmax(np.abs(v))) for k, v in SOUNDS.items()}

sfx = np.zeros(N)
for e in json.load(open('events.json')):
    s = SOUNDS[e['type']]
    if e['type'] == 'tap': s = s * rng.uniform(.75, 1.1)
    i0 = int(round(e['t'] * SR)) - PEAK[e['type']]
    idx = (i0 + np.arange(len(s))) % N
    np.add.at(sfx, idx, s)
mix = song * 0.85 + sfx[:, None]
peak = np.abs(mix).max()
if peak > 0.98: mix *= 0.98 / peak
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','2','-i','-','audio.wav'], input=mix.astype(np.float32).tobytes(), check=True)
print('peaks (samples):', PEAK, 'mix peak', round(float(peak), 3))
