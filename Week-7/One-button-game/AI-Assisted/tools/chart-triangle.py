"""First-pass chart from 16-bit PCM WAV, using numpy.
Usage: python tools/chart-triangle.py clip.wav Songs/pink-panther.chart.json
Candidates need listening review; these resonant bands are specific to this clip.
"""
import json, sys, wave
import numpy as np
with wave.open(sys.argv[1]) as w:
    if w.getsampwidth() != 2: raise ValueError('Use 16-bit PCM WAV')
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float)
    x = x.reshape(-1, w.getnchannels()).mean(axis=1) / 32768
size, hop = 2048, 220
frames = np.lib.stride_tricks.sliding_window_view(x, size)[::hop]
s = np.abs(np.fft.rfft(frames * np.hanning(size)))
f = np.fft.rfftfreq(size, 1 / sr)
# Persistent metallic resonances observed in the spectrogram, not an isolated stem.
bands = [(3880,4030), (5680,5780), (6020,6130), (7260,7400)]
e = np.stack([np.sum(s[:, (f>=lo)&(f<=hi)]**2, axis=1) for lo,hi in bands], axis=1)
e = np.log1p(e * 4)
score = np.pad(np.maximum(e[3:]-e[:-3], 0).mean(axis=1), (3,0))
score = np.convolve(score, np.ones(3)/3, mode='same')
threshold = max(float(np.percentile(score,85)), 0.04)
candidates = []
for i in range(2, len(score)-2):
    local = score[max(0,i-100):i+101]
    median = np.median(local)
    cutoff = max(threshold, float(median+2.5*np.median(np.abs(local-median))))
    if score[i]>cutoff and score[i]==max(score[i-2:i+3]):
        t = round((i*hop+size/2)/sr - 0.015, 3)
        if 0<=t<=61.145918: candidates.append((t,float(score[i])))
selected = []
for t,strength in sorted(candidates, key=lambda p:-p[1]):
    if all(abs(t-other[0])>=0.25 for other in selected): selected.append((t,strength))
selected.sort()
chart = dict(title='Pink Panther — triangle part', audio='Songs/Pink Panther Clip.m4a', duration=61.145918,
    status='provisional', method='Metallic-band attack detection, 250 ms minimum spacing. Spectrogram reviewed; not verified by listening. Other percussion may be included and quiet triangle strikes may be missing.',
    uncertainPassages=['Entire chart needs listening/playtest review; dense second half is especially ambiguous.'],
    notes=[t for t,_ in selected])
with open(sys.argv[2],'w') as out: json.dump(chart,out,indent=2); out.write('\n')
print(f'{len(selected)} provisional strikes; first timestamps: {chart["notes"][:15]}')
