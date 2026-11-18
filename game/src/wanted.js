// Wanted-level bookkeeping. Heat rises with each crime and cools only when the
// player has stayed out of police sight for a while.
export class WantedSystem {
  constructor() {
    this.level = 0;
    this.heat = 0;
    this.time = 0;
    this.lastCrime = -1000;
    this.stars = 0;
  }

  commit(severity) {
    this.level = Math.min(5, this.level + severity);
    this.heat = Math.max(this.heat, 26 + this.level * 15);
    this.lastCrime = this.time;
    this.stars = this.level;
    return this.level;
  }

  setLevel(level) {
    this.level = Math.max(0, Math.min(5, level));
    this.heat = this.level > 0 ? 999 : 0;
    this.stars = this.level;
  }

  update(dt, policeCanSee) {
    this.time += dt;
    if (this.level === 0) return;
    if (!policeCanSee && this.time - this.lastCrime > 11) {
      this.heat -= dt * 5.5;
      if (this.heat <= 0) { this.level = 0; this.heat = 0; }
    }
    this.stars = this.level;
  }
}
