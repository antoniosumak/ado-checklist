import numpy as np, subprocess
sr=44100
raw=subprocess.run(['ffmpeg','-v','quiet','-i','201.mp3','-ac','1','-ar',str(sr),'-f','f32le','-'],capture_output=True).stdout
x=np.frombuffer(raw,np.float32); dur=len(x)/sr
hop=128;n=2048
fr=np.lib.stride_tricks.sliding_window_view(x,n)[::hop]*np.hanning(n)
F=np.abs(np.fft.rfft(fr,axis=1)); f=np.fft.rfftfreq(n,1/sr)
low=np.log1p(F[:,(f>30)&(f<150)].sum(1)); full=np.log1p(F*10)
ol=np.maximum(0,np.diff(low)); of=np.maximum(0,np.diff(full,axis=0)).sum(1)
fps=sr/hop; t=np.arange(len(ol))/fps + n/2/sr
def score(o,P,ph):
    ts=np.arange(ph,dur-1,P); idx=np.round((ts - n/2/sr)*fps).astype(int); idx=idx[(idx>=0)&(idx<len(o))]
    return o[idx].mean()
best=max(((score(ol,P,ph),P,ph) for P in np.arange(0.495,0.505,0.00005) for ph in np.arange(0,P,0.002)))
print('kick', best, 'bpm', 60/best[1])
_,P,ph=best
# refine phase finer
best=max(((score(ol,P2,ph2),P2,ph2) for P2 in np.arange(P-0.0002,P+0.0002,0.00001) for ph2 in np.arange(ph-0.01,ph+0.01,0.0005)))
_,P,ph=best; print('refined bpm',60/P,'phase',ph)
np.save('grid.npy',np.array([P,ph,dur]))
# RMS per beat to find sections
beats=np.arange(ph,dur-P,P)
rms=[np.sqrt((x[int(b*sr):int((b+P)*sr)]**2).mean()) for b in beats]
hi=[np.sqrt((np.diff(x[int(b*sr):int((b+P)*sr)])**2).mean()) for b in beats]
for i in range(0,len(beats),4):
    print(i, f'{beats[i]:7.3f}', ' '.join(f'{r*100:4.1f}' for r in rms[i:i+4]), ' | hi ', ' '.join(f'{h*100:4.1f}' for h in hi[i:i+4]))
