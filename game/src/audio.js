// Synthesized WebAudio sound. Every effect is generated from oscillators and a
// noise buffer at run time: no audio files, no decoders, no network.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOscs = [];
    this.sirenGain = null;
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.lastStep = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = .42;
      this.master.connect(this.ctx.destination);

      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 480;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter.connect(this.engineGain).connect(this.master);
      for (const [type, detune] of [['sawtooth', 0], ['square', 7]]) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = 60;
        o.detune.value = detune;
        o.connect(this.engineFilter);
        o.start();
        this.engineOscs.push(o);
      }

      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 700;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.frequency.value = 1.6;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    } catch { this.ctx = null; }
  }

  get ready() { return !!this.ctx; }

  tone(freq, duration, type = 'sine', gain = .12, slide = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + duration + .02);
  }

  noise(duration, filterType, freq, gain = .2) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = .8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + duration + .02);
  }

  setEngine(speed, throttle, inCar) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const targetGain = inCar ? .12 + Math.min(.16, Math.abs(speed) * .006) : 0;
    this.engineGain.gain.setTargetAtTime(targetGain, t, .12);
    const f = 48 + Math.abs(speed) * 5.5 + (throttle > 0 ? 26 : 0);
    this.engineFilter.frequency.setTargetAtTime(320 + Math.abs(speed) * 24, t, .1);
    for (const o of this.engineOscs) o.frequency.setTargetAtTime(f, t, .09);
  }

  setSiren(active) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(active ? .085 : 0, this.ctx.currentTime, .3);
  }

  shot() { this.noise(.11, 'bandpass', 1400, .34); this.tone(110, .13, 'square', .2, 48); }
  enemyShot() { this.noise(.09, 'bandpass', 900, .16); this.tone(90, .1, 'square', .1, 40); }
  screech() { this.noise(.28, 'bandpass', 2100, .16); }
  crash() { this.noise(.3, 'lowpass', 420, .3); this.tone(70, .25, 'sawtooth', .16, 35); }
  hit() { this.noise(.16, 'lowpass', 600, .22); }
  pickup() { this.tone(620, .12, 'triangle', .15); setTimeout(() => this.tone(940, .18, 'triangle', .16), 90); }
  ui() { this.tone(760, .07, 'triangle', .1); }
  footstep(time) {
    if (time - this.lastStep < .32) return;
    this.lastStep = time;
    this.noise(.06, 'lowpass', 380, .045);
  }
  busted() {
    this.tone(420, .5, 'sawtooth', .18, 90);
    setTimeout(() => this.tone(260, .6, 'sawtooth', .15, 60), 180);
  }
  mission() {
    [523, 659, 784, 1047].forEach((n, i) => setTimeout(() => this.tone(n, .3, 'triangle', .16), i * 110));
  }
}
