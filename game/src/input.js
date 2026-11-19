// Keyboard/mouse/gamepad input with rebindable physical keys, an optional
// virtual override used by ?shot=, and auto-pause signals when focus is lost.
import { DEFAULT_BINDINGS } from './settings.js';

export class Input {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mouseClicked = false;
    this.lookX = 0;
    this.lookY = 0;
    this.pointerLocked = false;
    this.virtual = null;
    this.enabled = true;
    this.onAutoPause = handlers.onAutoPause ?? null;
    this.bindings = { ...DEFAULT_BINDINGS };
    this.reverse = {};
    this.setBindings(this.bindings);
    this._gp = null;
    this._prevPad = [];
    this.sensitivity = 1;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      const code = this.reverse[e.code] || e.code;
      if (!e.repeat) this.pressed.add(code);
      this.keys.add(code);
    });
    window.addEventListener('keyup', (e) => {
      const code = this.reverse[e.code] || e.code;
      this.keys.delete(code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear(); this.mouseDown = false;
      this.onAutoPause?.('blur');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.keys.clear(); this.onAutoPause?.('hidden'); }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      if (!this.pointerLocked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      if (wasLocked && !this.pointerLocked) this.onAutoPause?.('pointer-lock');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.virtual) return;
      if (this.pointerLocked || this.mouseDown) {
        this.lookX += (e.movementX || 0) * this.sensitivity;
        this.lookY += (e.movementY || 0) * this.sensitivity;
      }
    });
  }

  setBindings(bindings) {
    this.bindings = { ...bindings };
    this.reverse = {};
    for (const [action, code] of Object.entries(this.bindings)) this.reverse[code] = action;
  }

  setVirtual(state) { this.virtual = state; }
  releasePointerLock() { if (document.pointerLockElement === this.canvas) document.exitPointerLock?.(); }

  // Poll a standard gamepad once per frame. Buttons are exposed as an index
  // array; main.js uses padPressed() for edge-triggered actions.
  pollGamepad() {
    let gp = null;
    try {
      const pads = navigator.getGamepads?.() || [];
      for (const p of pads) { if (p && p.mapping === 'standard') { gp = p; break; } }
    } catch { gp = null; }
    if (!gp) { this._gp = null; this._prevPad = []; return null; }
    const dead = (v) => Math.abs(v || 0) < .18 ? 0 : v;
    const pressed = gp.buttons.map((b) => !!b.pressed);
    this._gp = {
      forward: -dead(gp.axes[1]), strafe: dead(gp.axes[0]),
      lookX: dead(gp.axes[2]) * 17, lookY: dead(gp.axes[3]) * 13,
      pressed,
      sprint: pressed[7] || pressed[5], handbrake: pressed[6], aim: pressed[7],
      fire: pressed[0] || (gp.buttons[7]?.value > .4),
    };
    this._prevPad = pressed.slice();
    return this._gp;
  }

  padPressed(index) { return !!this._gp?.pressed[index] && !this._prevPad[index]; }

  down(code) {
    return this.virtual ? this.virtual.keys.has(code) : this.keys.has(code);
  }

  justPressed(code) {
    return this.virtual ? this.virtual.pressed.has(code) : this.pressed.has(code);
  }

  get firing() { return this.virtual ? !!this.virtual.mouseDown : this.mouseDown; }
  get firePressed() { return this.virtual ? !!this.virtual.mouseClicked : this.mouseClicked; }

  get look() {
    if (this.virtual) return { x: this.virtual.lookX || 0, y: this.virtual.lookY || 0 };
    const gpLook = this._gp ? { x: this._gp.lookX, y: this._gp.lookY } : null;
    if (gpLook && (gpLook.x || gpLook.y)) return gpLook;
    return { x: this.lookX, y: this.lookY };
  }

  clearLook() {
    if (this.virtual) { this.virtual.lookX = 0; this.virtual.lookY = 0; }
    else { this.lookX = 0; this.lookY = 0; }
  }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
    if (this.virtual) this.virtual.pressed.clear();
    if (this.virtual) this.virtual.mouseClicked = false;
  }
}
