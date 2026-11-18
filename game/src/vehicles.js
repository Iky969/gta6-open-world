// Original low-poly vehicles and their arcade driving model. Cars are simple
// groups of boxes/cylinders assembled from shared geometry where possible.
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
  }

  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

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
        if (ox < oz) { this.x += Math.sign(dx || 1) * ox; this.speed *= -.28; }
        else { this.z += Math.sign(dz || 1) * oz; this.speed *= -.28; }
      }
    }
    // Ocean is lethal unless you are on the pier causeway.
    const onPier = Math.abs(this.z - CITY.pierZ) < 10 && this.x > CITY.limit - 20;
    if (!onPier && this.x > CITY.oceanX - 6) { this.x = CITY.oceanX - 6; this.speed *= -.4; }
    if (this.x < -CITY.limit) { this.x = -CITY.limit; this.speed *= -.4; }
    if (this.z < -CITY.limit) { this.z = -CITY.limit; this.speed *= -.4; }
    if (this.z > CITY.limit) { this.z = -CITY.limit + 5; this.speed *= -.4; }
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
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.disabled = true;
      return true;
    }
    return false;
  }

  removeFrom(scene) {
    scene.remove(this.mesh);
  }
}
