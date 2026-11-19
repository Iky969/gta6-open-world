// Day/night cycle, rain and dusk neon. One phase drives the sun, hemisphere,
// fog and sky gradient; dusk/night boosts the city's neon materials. In ?shot=
// mode the phase is pinned to golden hour and rain is off for deterministic,
// good-looking captures.
import * as THREE from 'three';
import { WEATHER } from './config.js';

const lerpColor = (a, b, t, out) => out.setHex(a).lerp(_tmpColor.setHex(b), t);
const _tmpColor = new THREE.Color();

export class WeatherSystem {
  constructor(scene, city, sky, sun, hemi, rim, fog, rng, fixedPhase = null) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.sky = sky;
    this.sun = sun;
    this.hemi = hemi;
    this.rim = rim;
    this.fog = fog;
    this.fixedPhase = fixedPhase;
    this.phase = fixedPhase ?? WEATHER.goldenHour;
    this.rain = 0;
    this.manualRain = false;
    this._color = new THREE.Color();
    this.neonBase = (city.neonMaterials || []).map((m) => m.color.clone());
    this.makeRain();
    this.update(0, { x: 0, z: 0 });
  }

  makeRain() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    this.rainSpeeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (this.rng() - .5) * 130;
      positions[i * 3 + 1] = this.rng() * 46;
      positions[i * 3 + 2] = (this.rng() - .5) * 130;
      this.rainSpeeds[i] = 26 + this.rng() * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfe4f2, size: .12, transparent: true, opacity: .55, depthWrite: false });
    this.rainPoints = new THREE.Points(geo, mat);
    this.rainPoints.frustumCulled = false;
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);
  }

  toggleRain() { this.manualRain = !this.manualRain; }

  update(dt, focus) {
    if (this.fixedPhase === null) this.phase = (this.phase + dt / WEATHER.cycleSeconds) % 1;
    const elevation = -Math.cos(this.phase * Math.PI * 2);
    // Golden hour sits at phase 0.26 (elevation ~0.06): keep it bright and
    // sun-soaked, while true night (elevation -1) still falls to near zero.
    const day = Math.max(0, Math.min(1, elevation * 1.1 + .78));
    const dusk = Math.max(0, 1 - Math.abs(elevation) * 2.2);

    this.sun.intensity = .18 + day * 2.5;
    lerpColor(0xff7a3c, 0xfff0d2, Math.min(1, day * 1.3), this._color);
    this.sun.color.copy(this._color);
    this.hemi.intensity = .45 + day * 1.15;
    this.rim.intensity = .25 + dusk * .7;
    lerpColor(0x0b1730, 0xe9ab7e, day, this.fog.color);
    if (this.sky && this.sky.userData.uniforms) {
      const u = this.sky.userData.uniforms;
      lerpColor(0x050b1e, 0x143a5c, day, u.topColor.value);
      lerpColor(0x1b2732, 0x77b3c4, day, u.midColor.value);
      lerpColor(0x27333c, 0xffc08a, day, u.horizonColor.value);
      lerpColor(0x111923, 0xd88963, day, u.lowColor.value);
      lerpColor(0x9aa8b8, 0xffe6ae, day, u.sunColor.value);
    }
    // Keep the signs readable but never let them wash the frame in cyan/magenta.
    const neonGlow = .45 + (1 - day) * .45;
    const mats = this.city.neonMaterials || [];
    for (let i = 0; i < mats.length; i++) {
      if (!this.neonBase[i]) continue;
      mats[i].color.copy(this.neonBase[i]).multiplyScalar(neonGlow);
    }
    // Rain is scheduled by phase (a passing front in the afternoon) and can be
    // forced with the weather key. Shots never spawn rain.
    const scheduled = this.fixedPhase === null && elevation < -.15 && elevation > -.72;
    const want = this.fixedPhase !== null ? 0 : (this.manualRain || scheduled ? 1 : 0);
    this.rain += (want - this.rain) * Math.min(1, dt * 1.4);
    if (this.rain < .01 || this.fixedPhase !== null) { this.rainPoints.visible = false; return; }
    this.rainPoints.visible = true;
    this.rainPoints.material.opacity = .55 * this.rain;
    const pos = this.rainPoints.geometry.attributes.position;
    const fx = focus.x ?? 0, fz = focus.z ?? 0;
    for (let i = 0; i < this.rainSpeeds.length; i++) {
      let y = pos.array[i * 3 + 1] - this.rainSpeeds[i] * dt;
      if (y < 0 || Math.abs(pos.array[i * 3] - fx) > 80 || Math.abs(pos.array[i * 3 + 2] - fz) > 80) {
        y = 42 + this.rng() * 6;
        pos.array[i * 3] = fx + (this.rng() - .5) * 130;
        pos.array[i * 3 + 2] = fz + (this.rng() - .5) * 130;
      }
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
  }
}
