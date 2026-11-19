// Original low-poly vehicles and their arcade driving model. Cars are simple
// groups of boxes/cylinders assembled from shared geometry where possible.
// Damage advances smoke -> fire -> explosion; crashes also flag nearby traffic
// so ambient cars brake and swerve around an accident.
import * as THREE from 'three';
import { CITY } from './config.js';

const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.36, 12);
wheelGeometry.rotateZ(Math.PI / 2);

const bodyMaterialCache = new Map();
function bodyMaterial(color) {
  if (!bodyMaterialCache.has(color)) {
    bodyMaterialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: .38, metalness: .42 }));
  }
  return bodyMaterialCache.get(color);
}
const glassMat = new THREE.MeshStandardMaterial({ color: 0x163245, roughness: .12, metalness: .65, emissive: 0x07131c, emissiveIntensity: .4 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: .95 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, roughness: .3, metalness: .8 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b32, toneMapped: false });

function part(geo, mat, parent, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function createCarMesh(def, color, isPolice = false) {
  const group = new THREE.Group();
  const paint = isPolice ? new THREE.MeshStandardMaterial({ color: 0xe8ecea, roughness: .35, metalness: .4 }) : bodyMaterial(color);
  const tall = def.name === 'PICKUP ROCA' || def.name === 'SOL VAN';
  const sporty = def.name === 'VULCAN GT' || def.name === 'NOVA COUPE';
  const bodyH = tall ? 0.95 : sporty ? 0.54 : 0.72;
  const bodyY = tall ? 0.95 : 0.78;
  const halfL = sporty ? 2.35 : tall ? 2.3 : 2.15;

  part(new THREE.BoxGeometry(2.1, bodyH, halfL * 2), paint, group, 0, bodyY, 0);
  part(new THREE.BoxGeometry(2.0, 0.3, sporty ? 1.2 : 1.0), paint, group, 0, bodyY + bodyH / 2 + .08, halfL - .65);
  if (!sporty) part(new THREE.BoxGeometry(2.0, 0.28, 1.0), paint, group, 0, bodyY + bodyH / 2 + .06, -halfL + .6);

  const cabinH = sporty ? 0.52 : tall ? 1.0 : 0.7;
  const cabinZ = sporty ? -0.25 : tall ? -0.55 : -0.15;
  part(new THREE.BoxGeometry(1.82, cabinH, tall ? 2.1 : 2.05), glassMat, group, 0, bodyY + bodyH / 2 + cabinH / 2, cabinZ);
  part(new THREE.BoxGeometry(1.86, 0.12, tall ? 2.2 : 2.1), paint, group, 0, bodyY + bodyH / 2 + cabinH + .02, cabinZ);

  for (const x of [-1.02, 1.02]) {
    for (const z of [-halfL + .65, halfL - .65]) {
      part(wheelGeometry, tyreMat, group, x, 0.5, z);
      part(new THREE.CylinderGeometry(.24, .24, .38, 10), rimMat, group, x, 0.5, z).rotation.z = Math.PI / 2;
    }
    part(new THREE.BoxGeometry(.45, .22, .14), headMat, group, x * .72, bodyY + .08, halfL + .04);
    part(new THREE.BoxGeometry(.42, .19, .12), tailMat, group, x * .72, bodyY + .08, -halfL - .04);
  }
  if (isPolice) {
    const red = part(new THREE.BoxGeometry(.7, .22, .34), new THREE.MeshBasicMaterial({ color: 0xff2d2d, toneMapped: false }), group, -.45, 1.72, 0);
    const blue = part(new THREE.BoxGeometry(.7, .22, .34), new THREE.MeshBasicMaterial({ color: 0x2d6bff, toneMapped: false }), group, .45, 1.72, 0);
    group.userData.lights = { red, blue };
    part(new THREE.BoxGeometry(.9, .36, .5), new THREE.MeshBasicMaterial({ color: 0x101820 }), group, 0, 1.55, halfL - .3);
  }
  group.userData.sporty = sporty;
  return group;
}

export class Vehicle {
  constructor(def, color, x, z, heading, isPolice = false, health = 60) {
    this.def = def;
    this.color = color;
    this.isPolice = isPolice;
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = health;
    this.maxHealth = health;
    this.mesh = createCarMesh(def, color, isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.radius = 2.0;
    this.driver = null;
    this.traffic = null;
    this.disabled = false;
    this.horn = 0;
    // Damage visuals: 0 intact, 1 smoking, 2 burning, 3 wrecked/exploded.
    this.damageState = 0;
    this.crashTimer = 0;
    this.onDestroyed = null;
    this.smoke = null;
    this.fire = null;
    this.wreckTimer = 0;
  }

  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // Build the smoke/fire sprites lazily: most cars never get damaged, so an
  // untouched traffic car costs nothing extra.
  ensureDamageFx() {
    if (this.smoke) return;
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x363b40, transparent: true, opacity: .55, depthWrite: false });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7b2e, transparent: true, opacity: .85, depthWrite: false, toneMapped: false });
    const g = new THREE.SphereGeometry(.42, 7, 5);
    this.smoke = [];
    this.fire = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(g, smokeMat.clone());
      s.position.set((i - 2) * .16, 1.5 + i * .12, -1.1);
      this.mesh.add(s);
      this.smoke.push(s);
      const f = new THREE.Mesh(g, fireMat.clone());
      f.scale.setScalar(.7);
      f.position.set((i - 2) * .14, 1.1, -1.0);
      f.visible = false;
      this.mesh.add(f);
      this.fire.push(f);
    }
  }

  updateDamage(dt, time) {
    if (this.damageState === 0 || !this.smoke) return;
    for (let i = 0; i < this.smoke.length; i++) {
      const s = this.smoke[i];
      s.position.y = 1.5 + i * .12 + Math.sin(time * 2 + i) * .18;
      s.scale.setScalar(.7 + Math.sin(time * 2.5 + i * 1.3) * .3);
      s.material.opacity = this.damageState === 2 ? .62 : .42;
    }
    if (this.damageState === 2) {
      for (let i = 0; i < this.fire.length; i++) {
        const f = this.fire[i];
        f.visible = true;
        f.scale.setScalar(.6 + Math.abs(Math.sin(time * 9 + i * 2)) * .7);
        f.material.color.setHex(i % 2 ? 0xffb23c : 0xff5a24);
      }
    }
    if (this.damageState === 3) {
      this.wreckTimer -= dt;
      this.mesh.position.y = Math.max(-1.4, this.mesh.position.y - dt * .6);
      this.mesh.rotation.z += dt * .25;
      if (this.wreckTimer <= 0) this.mesh.visible = false;
    }
  }

  crash(intensity = 1) {
    this.crashTimer = Math.max(this.crashTimer, 2.5);
    if (intensity > 8) this.damage(intensity * 1.6);
  }

  update(dt, controls, colliders = []) {
    if (this.disabled) { this.speed *= Math.exp(-4 * dt); this.sync(dt); return; }
    const def = this.def;
    const throttle = controls.throttle || 0;
    const steer = controls.steer || 0;
    const maxSpeed = def.speed * (controls.boost ? 1.18 : 1);
    if (throttle > 0) this.speed += def.accel * throttle * dt;
    else if (throttle < 0) this.speed -= def.accel * 1.15 * dt;
    else this.speed *= Math.exp(-1.0 * dt);
    if (controls.handbrake) this.speed *= Math.exp(-3.4 * dt);
    this.speed = Math.max(-maxSpeed * .32, Math.min(maxSpeed, this.speed));

    const grip = def.grip * (0.32 + Math.min(1, Math.abs(this.speed) / 11)) * (controls.handbrake ? 1.45 : 1);
    this.heading += steer * grip * dt * (this.speed < -0.5 ? -1 : 1);
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);

    const fwd = this.forward;
    this.x += fwd.x * this.speed * dt;
    this.z += fwd.z * this.speed * dt;

    for (const c of colliders) {
      const dx = this.x - c.x, dz = this.z - c.z;
      const ox = c.hw + this.radius - Math.abs(dx);
      const oz = c.hd + this.radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        const impact = Math.abs(this.speed);
        if (ox < oz) { this.x += Math.sign(dx || 1) * ox; this.speed *= -.28; }
        else { this.z += Math.sign(dz || 1) * oz; this.speed *= -.28; }
        if (impact > 6) this.crash(impact);
      }
    }
    // Ocean is lethal unless you are on the pier causeway.
    const onPier = Math.abs(this.z - CITY.pierZ) < 10 && this.x > CITY.limit - 20;
    if (!onPier && this.x > CITY.oceanX - 6) { this.x = CITY.oceanX - 6; this.speed *= -.4; this.crash(12); }
    if (this.x < -CITY.limit) { this.x = -CITY.limit; this.speed *= -.4; }
    if (this.z < -CITY.limit) { this.z = -CITY.limit; this.speed *= -.4; }
    if (this.z > CITY.limit) { this.z = -CITY.limit + 5; this.speed *= -.4; }
    this.crashTimer = Math.max(0, this.crashTimer - dt);
    this.sync(dt);
  }

  sync(dt, time = performance.now() * .001) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Front wheels visibly turn with the steering input.
    const wheels = this.mesh.children.filter((c) => c.geometry === wheelGeometry);
    for (const w of wheels) w.rotation.y = w.position.z > 0 ? this.steer * .45 : 0;
    if (this.isPolice && this.mesh.userData.lights) {
      const flash = Math.sin(time * 12) > 0;
      const { red, blue } = this.mesh.userData.lights;
      red.material.color.setHex(flash ? 0xff2d2d : 0x5a1414);
      blue.material.color.setHex(flash ? 0x14214a : 0x2d6bff);
    }
    this.updateDamage(dt, time);
  }

  damage(amount) {
    if (this.disabled) return false;
    this.health -= amount;
    if (this.health < this.maxHealth * .5 && this.damageState === 0) {
      this.ensureDamageFx();
      this.damageState = 1;
    }
    if (this.health < this.maxHealth * .25 && this.damageState === 1) this.damageState = 2;
    if (this.health <= 0) {
      this.health = 0;
      this.disabled = true;
      this.ensureDamageFx();
      this.damageState = 3;
      this.wreckTimer = 2.6;
      if (this.onDestroyed) this.onDestroyed(this);
      return true;
    }
    return false;
  }

  removeFrom(scene) {
    scene.remove(this.mesh);
  }
}
