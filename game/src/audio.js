// Synthesized WebAudio sound. Every effect is generated from oscillators and a
// noise buffer at run time: no audio files, no decoders, no network. The car
// radio is four procedural stations; every effect also emits a DOM event so
// the HUD can show a visual cue for what the player just heard.
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
    this.volume = .7;
    this.station = 0;
    this.muted = false;
    this.radioGain = null;
    this.radioTimer = 0;
    this.radioStep = 0;
    // Each station is a short looping chord/melody: root notes in Hz.
    this.stations = [
      { name: 'RADIO SOL · SUNSET POP', notes: [262, 330, 392, 523, 392, 330], beat: .23, wave: 'triangle' },
      { name: 'KCR · LOW END', notes: [110, 110, 147, 98, 110, 165], beat: .28, wave: 'sawtooth' },
      { name: 'ORO FM · LATIN BRASS', notes: [294, 349, 440, 523, 440, 349], beat: .19, wave: 'square' },
      { name: 'VOLT WAVE · NIGHT DRIVE', notes: [220, 277, 330, 415, 330, 277], beat: .32, wave: 'sine' },
    ];
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.value = this.volume * .6;
  }

  setStation(index) {
    this.station = ((index % this.stations.length) + this.stations.length) % this.stations.length;
    this.radioStep = 0; this.radioTimer = 0;
  }

  toggleMute() { this.muted = !this.muted; if (this.radioGain) this.radioGain.gain.value = this.muted ? 0 : .16; }
  get stationName() { return this.stations[this.station].name; }

  // Fired by gameplay events; the HUD listens and pulses a matching cue.
  event(name) {
    try { window.dispatchEvent(new CustomEvent('vesper-sfx', { detail: name })); } catch { /* no DOM in tests */ }
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * .6;
      this.master.connect(this.ctx.destination);
      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.value = this.muted ? 0 : .16;
      this.radioGain.connect(this.master);

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

  // Procedural car radio: advances a looping pattern through its own gain so
  // it ducks under gunfire and can be muted without touching engine/sirens.
  updateRadio(dt, inVehicle) {
    if (!this.ctx || !inVehicle || this.muted) return;
    const station = this.stations[this.station];
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return;
    this.radioTimer = station.beat;
    const note = station.notes[this.radioStep++ % station.notes.length];
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = station.wave;
    o.frequency.value = note;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.32, t + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + station.beat * .9);
    o.connect(g).connect(this.radioGain);
    o.start(t); o.stop(t + station.beat);
  }

  shot() { this.noise(.11, 'bandpass', 1400, .34); this.tone(110, .13, 'square', .2, 48); this.event('shot'); }
  enemyShot() { this.noise(.09, 'bandpass', 900, .16); this.tone(90, .1, 'square', .1, 40); this.event('enemy'); }
  screech() { this.noise(.28, 'bandpass', 2100, .16); this.event('screech'); }
  crash() { this.noise(.3, 'lowpass', 420, .3); this.tone(70, .25, 'sawtooth', .16, 35); this.event('crash'); }
  hit() { this.noise(.16, 'lowpass', 600, .22); this.event('hit'); }
  pickup() { this.tone(620, .12, 'triangle', .15); setTimeout(() => this.tone(940, .18, 'triangle', .16), 90); this.event('pickup'); }
  ui() { this.tone(760, .07, 'triangle', .1); }
  radioClick() { this.tone(520, .06, 'square', .08); this.ui?.(); }
  footstep(time) {
    if (time - this.lastStep < .32) return;
    this.lastStep = time;
    this.noise(.06, 'lowpass', 380, .045);
  }
  busted() {
    this.tone(420, .5, 'sawtooth', .18, 90);
    setTimeout(() => this.tone(260, .6, 'sawtooth', .15, 60), 180);
    this.event('busted');
  }
  mission() {
    [523, 659, 784, 1047].forEach((n, i) => setTimeout(() => this.tone(n, .3, 'triangle', .16), i * 110));
    this.event('mission');
  }
}
