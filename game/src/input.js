// Keyboard/mouse input with an optional virtual override used by the ?shot=
// controller, so the same game code drives live play and deterministic captures.

export class Input {
  constructor(canvas) {
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

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      if (!this.pointerLocked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.virtual) return;
      if (this.pointerLocked || this.mouseDown) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });
  }

  setVirtual(state) { this.virtual = state; }

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
