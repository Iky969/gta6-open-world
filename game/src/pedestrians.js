// Sidewalk pedestrians: small animated originals with simple patrol loops and
// a flee response to gunfire, sirens and collisions.
import * as THREE from 'three';
import { PED_COLORS } from './config.js';
import { randRange, randInt, pick, chance } from './rng.js';

const skinMaterials = [0xe0b08a, 0xc98d63, 0x9d6b4b, 0xf0c7a5, 0x7a5038].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: .9 }),
);
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x22282e, roughness: .95 });

export function createPedMesh(color, rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: .85 });
  const trousers = new THREE.MeshStandardMaterial({ color: chance(rng, .5) ? 0x35404f : 0x5b5147, roughness: .9 });
  const skin = pick(rng, skinMaterials);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.31, .36, 1.05, 8), shirt);
  torso.position.y = 1.3; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.27, 10, 8), skin);
  head.position.y = 2.05; head.castShadow = true; group.add(head);
  if (chance(rng, .45)) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.285, 10, 6, 0, Math.PI * 2, 0, Math.PI * .52), new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 1 }));
    hair.position.y = 2.07; group.add(hair);
  }
  const limbs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.22, .88, .26), trousers);
    leg.position.set(side * .17, .44, 0); leg.castShadow = true; group.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.24, .14, .36), shoeMat);
    shoe.position.set(side * .17, .07, .07); group.add(shoe);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.18, .82, .2), shirt);
    arm.position.set(side * .44, 1.35, 0); arm.castShadow = true; group.add(arm);
    limbs.push({ leg, arm, side });
  }
  group.userData.limbs = limbs;
  return group;
}

export class Pedestrian {
  constructor(scene, rng, city, isPolice = false, colorOverride = null) {
    this.rng = rng;
    this.city = city;
    this.isPolice = isPolice;
    const color = colorOverride ?? (isPolice ? 0x2b5d9e : pick(rng, PED_COLORS));
    this.mesh = createPedMesh(color, rng);
    scene.add(this.mesh);
    this.loop = randInt(rng, 0, city.sidewalkLoops.length - 1);
    const points = city.sidewalkLoops[this.loop];
    this.target = randInt(rng, 0, 3);
    this.x = points[this.target].x;
    this.z = points[this.target].z;
    this.mesh.position.set(this.x, 0, this.z);
    this.speed = randRange(rng, 1.2, 2.1);
    this.yaw = 0;
    this.anim = rng() * 10;
    this.fleeTimer = 0;
    this.fleeFrom = null;
    this.health = isPolice ? 40 : 20;
    this.down = false;
    this.downTimer = 0;
    this.dead = false;
    this.targetOverride = null;
  }

  alert(x, z, duration = 4) {
    if (this.down || this.isPolice) return;
    this.fleeFrom = { x, z };
    this.fleeTimer = Math.max(this.fleeTimer, duration);
  }

  setDestination(x, z) { this.targetOverride = { x, z }; }

  update(dt) {
    if (this.down) {
      this.downTimer -= dt;
      this.mesh.rotation.x += (Math.PI / 2 - this.mesh.rotation.x) * Math.min(1, dt * 8);
      if (this.downTimer <= 0) { this.dead = true; this.mesh.visible = false; }
      return;
    }
    const rng = this.rng;
    let tx, tz;
    if (this.fleeTimer > 0 && this.fleeFrom) {
      this.fleeTimer -= dt;
      const dx = this.x - this.fleeFrom.x, dz = this.z - this.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      tx = this.x + dx / len * 20;
      tz = this.z + dz / len * 20;
    } else if (this.targetOverride) {
      tx = this.targetOverride.x; tz = this.targetOverride.z;
      if (Math.hypot(tx - this.x, tz - this.z) < 2) this.targetOverride = null;
    } else {
      const points = this.city.sidewalkLoops[this.loop];
      const p = points[this.target];
      tx = p.x; tz = p.z;
      if (Math.hypot(tx - this.x, tz - this.z) < 1.4) {
        this.target = (this.target + (chance(rng, .15) ? -1 : 1) + 4) % 4;
        if (chance(rng, .04)) this.loop = randInt(rng, 0, this.city.sidewalkLoops.length - 1);
      }
    }
    const dx = tx - this.x, dz = tz - this.z;
    const len = Math.hypot(dx, dz);
    if (len > .1) {
      const v = (this.fleeTimer > 0 ? 5.2 : this.speed) * dt;
      this.x += dx / len * v;
      this.z += dz / len * v;
      const want = Math.atan2(dx, dz);
      let diff = want - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 10);
      this.anim += dt * (this.fleeTimer > 0 ? 13 : 7);
    }
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.anim)) * .045, this.z);
    this.mesh.rotation.y = this.yaw;
    const swing = Math.sin(this.anim) * .5;
    for (const limb of this.mesh.userData.limbs) {
      limb.leg.rotation.x = swing * limb.side;
      limb.arm.rotation.x = -swing * limb.side;
    }
  }

  damage(amount, scene) {
    if (this.down) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.down = true;
      this.downTimer = 6;
      return true;
    }
    return false;
  }

  removeFrom(scene) { scene.remove(this.mesh); }
}

export class PedestrianSystem {
  constructor(scene, rng, city, count = 34) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.peds = [];
    for (let i = 0; i < count; i++) this.peds.push(new Pedestrian(scene, rng, city));
  }

  alert(x, z, radius) {
    for (const p of this.peds) {
      if (Math.hypot(p.x - x, p.z - z) < radius) p.alert(x, z);
    }
  }

  update(dt) {
    for (const p of this.peds) p.update(dt);
    for (let i = this.peds.length - 1; i >= 0; i--) {
      if (this.peds[i].dead) {
        this.peds[i].removeFrom(this.scene);
        this.peds.splice(i, 1);
      }
    }
    // Keep the sidewalks busy.
    if (this.peds.length < 30 && chance(this.rng, .01)) {
      this.peds.push(new Pedestrian(this.scene, this.rng, this.city));
    }
  }
}
