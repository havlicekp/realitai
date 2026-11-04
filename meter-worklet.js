// Noise meter DSP: IEC 61672-1 A-weighting in the time domain (three biquads from the bilinear transform of the analog
// poles 20.6 Hz ×2, 107.7 Hz, 737.9 Hz, 12194 Hz ×2, gain normalised to 0 dB at 1 kHz – as in nonius, GPL-3.0) and
// mean square of the weighted signal over 125 ms blocks (IEC "Fast" period, as in NoiseCapture / OpeNoise).
// Loaded as an AudioWorklet module; the page loads the same file as a script for the ScriptProcessor fallback.
globalThis.makeAW = function makeAW(fs) {
  const k = 2 * fs, pole = hz => (k - 2 * Math.PI * hz) / (k + 2 * Math.PI * hz);
  const p1 = pole(20.598997), p4 = pole(12194.217), p2 = pole(107.65265), p3 = pole(737.86223);
  const st = [[1, -2, 1, -2 * p1, p1 * p1], [1, -2, 1, -2 * p4, p4 * p4], [1, 2, 1, -(p2 + p3), p2 * p3]].map(c => ({ c, x1: 0, x2: 0, y1: 0, y2: 0 }));
  const gainAt = ([b0, b1, b2, a1, a2], w) => { const zr = Math.cos(w), zi = -Math.sin(w), z2r = zr * zr - zi * zi, z2i = 2 * zr * zi;
    return Math.hypot(b0 + b1 * zr + b2 * z2r, b1 * zi + b2 * z2i) / Math.hypot(1 + a1 * zr + a2 * z2r, a1 * zi + a2 * z2i); };
  const g = 1 / st.reduce((a, s) => a * gainAt(s.c, 2 * Math.PI * 1000 / fs), 1);
  const n = Math.round(fs * 0.125);
  let e = 0, i = 0;
  // feeds samples, calls out(meanSquare) after every 125 ms block
  return (x, out) => {
    for (let j = 0; j < x.length; j++) {
      let y = x[j];
      for (const s of st) { const [b0, b1, b2, a1, a2] = s.c, o = b0 * y + b1 * s.x1 + b2 * s.x2 - a1 * s.y1 - a2 * s.y2; s.x2 = s.x1; s.x1 = y; s.y2 = s.y1; s.y1 = o; y = o; }
      y *= g; e += y * y;
      if (++i === n) { out(e / n); e = 0; i = 0; }
    }
  };
};
if (typeof AudioWorkletProcessor === 'function') {
  registerProcessor('rai-meter', class extends AudioWorkletProcessor {
    constructor() { super(); this.f = makeAW(sampleRate); this.post = ms => this.port.postMessage(ms); }
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.f(ch, this.post); return true; }
  });
}
