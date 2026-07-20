// GARGANTUA — optional synchronized audio drone.
// Pure WebAudio synthesis (no assets): a low detuned drone + filtered noise
// whose intensity follows camera distance and disk brightness each frame.

export class BHAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.running = false;
    this._nodes = [];
  }

  start() {
    if (this.running) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.master = master;

    // --- drone: two detuned low oscillators
    const o1 = ctx.createOscillator(); o1.type = 'sine';     o1.frequency.value = 36.0;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 54.3;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    o1.connect(g1).connect(master);
    o2.connect(g2).connect(master);

    // slow beating LFO on o2 detune
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 2.2;
    lfo.connect(lfoG).connect(o2.detune);

    // --- filtered noise "accretion wind"
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {           // brown-ish noise
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 240; bp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.16;
    noise.connect(bp).connect(ng).connect(master);

    o1.start(); o2.start(); lfo.start(); noise.start();
    this._nodes = [o1, o2, lfo, noise];
    this._bp = bp;
    this.running = true;
  }

  // called every frame from the render loop — keeps audio synchronized
  update(camDist, diskBright) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const prox = Math.min(1, Math.max(0, (18 - camDist) / 15));   // closer = louder
    const target = 0.05 + 0.30 * prox * Math.min(1.5, diskBright);
    this.master.gain.setTargetAtTime(target, t, 0.25);
    this._bp.frequency.setTargetAtTime(180 + 500 * prox, t, 0.4);
  }

  stop() {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.1);
    const nodes = this._nodes, ctx = this.ctx;
    setTimeout(() => {
      nodes.forEach(n => { try { n.stop(); } catch (e) {} });
      try { ctx.close(); } catch (e) {}
    }, 400);
    this.running = false;
    this.ctx = null;
  }

  toggle(camDist, diskBright) {
    if (this.running) this.stop();
    else { this.start(); this.update(camDist, diskBright); }
    return this.running;
  }
}
