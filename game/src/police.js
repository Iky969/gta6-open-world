// Police response and rival gang ambushes. Cruisers pursue on roads, officers
// close in on foot, and both shoot with distance-scaled accuracy.
import * as THREE from 'three';
import { VEHICLE_TYPES } from './config.js';
import { pick, randRange } from './rng.js';
import { Vehicle } from './vehicles.js';
import { Pedestrian } from './pedestrians.js';

const cruiserDef = VEHICLE_TYPES.find((v) => v.name === 'CRUISER');
const rivalDef = VEHICLE_TYPES.find((v) => v.name === 'NOVA COUPE');

export class PoliceSystem {
  constructor(scene, rng, city, combat, sound) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.combat = combat;
    this.sound = sound;
    this.units = [];
    this.spawnCooldown = 0;
    this.visible = false;
  }

  nodeNear(x, z, minDist = 55, maxDist = 160) {
    const candidates = this.city.nodes.filter((n) => {
      const d = Math.hypot(n.x - x, n.z - z);
      return d > minDist && d < maxDist;
    });
    if (!candidates.length) return this.city.nodes[Math.floor(this.rng() * this.city.nodes.length)];
    return pick(this.rng, candidates);
  }

  spawnCar(x, z, faction = 'police', heading = 0) {
    const rival = faction === 'rival';
    const v = new Vehicle(rival ? rivalDef : cruiserDef, rival ? 0x6b2233 : 0xe8ecea,
      x, z, heading, !rival, rival ? 55 : 95);
    v.radius = 2.1;
    this.scene.add(v.mesh);
    const unit = { type: 'car', entity: v, faction, cooldown: randRange(this.rng, .4, 1.6), retreat: 0, dead: false };
    v.unit = unit;
    this.units.push(unit);
    return unit;
  }

  spawnOfficer(x, z, faction = 'police') {
    const p = new Pedestrian(this.scene, this.rng, this.city, faction === 'police',
      faction === 'rival' ? 0x8c2638 : null);
    p.x = x; p.z = z; p.speed = faction === 'rival' ? 4.4 : 4.9;
    p.mesh.position.set(x, 0, z);
    const unit = { type: 'foot', entity: p, faction, cooldown: randRange(this.rng, .5, 2), retreat: 0, dead: false };
    p.unit = unit;
    this.units.push(unit);
    return unit;
  }

  // Mission ambush: a pack of red Chrome Kings cars and shooters.
  spawnAmbush(x, z, count = 3) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng() * .5;
      const px = x + Math.cos(a) * 42;
      const pz = z + Math.sin(a) * 42;
      this.spawnCar(px, pz, 'rival', Math.atan2(x - px, z - pz));
      if (i === 0) this.spawnOfficer(px + 4, pz + 4, 'rival');
    }
  }

  releaseEntity(entity) {
    const unit = entity.unit;
    if (!unit) return;
    unit.dead = true;
    entity.unit = null;
  }

  shoot(unit, game, distance) {
    const e = unit.entity;
    const from = new THREE.Vector3(e.x, unit.type === 'car' ? 1.65 : 1.5, e.z);
    const player = game.player;
    const px = player.inVehicle ? player.inVehicle.x : player.x;
    const pz = player.inVehicle ? player.inVehicle.z : player.z;
    const target = new THREE.Vector3(px, 1.3, pz);
    const accuracy = Math.max(.08, Math.min(.78, .7 - distance * .012 + game.wanted.level * .035 +
      (unit.faction === 'rival' ? -.1 : 0)));
    const hit = this.rng() < accuracy;
    const to = hit ? target.clone() : target.clone().add(new THREE.Vector3(
      randRange(this.rng, -4, 4), randRange(this.rng, -1, 2), randRange(this.rng, -4, 4)));
    this.combat.tracer(from, to, unit.faction === 'rival' ? 0xff8a4a : 0xffd27a);
    this.sound.enemyShot();
    if (hit) {
      player.damage(4 + game.wanted.level * 1.6 + (unit.faction === 'rival' ? 2 : 0));
      this.sound.hit();
      game.shake = Math.min(1, (game.shake || 0) + .22);
    }
  }

  update(dt, game, colliders) {
    const player = game.player;
    const px = player.inVehicle ? player.inVehicle.x : player.x;
    const pz = player.inVehicle ? player.inVehicle.z : player.z;
    const wanted = game.wanted.level;
    this.visible = false;

    this.spawnCooldown -= dt;
    const policeCount = this.units.filter((u) => u.faction === 'police' && !u.dead).length;
    const targetCount = wanted > 0 ? Math.min(9, 2 + Math.floor(wanted * 1.4)) : 0;
    if (wanted > 0 && policeCount < targetCount && this.spawnCooldown <= 0) {
      const node = this.nodeNear(px, pz);
      if (policeCount % 3 === 2) this.spawnOfficer(node.x, node.z);
      else this.spawnCar(node.x, node.z, 'police', Math.atan2(px - node.x, pz - node.z));
      this.spawnCooldown = 2.4;
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const e = u.entity;
      if (u.dead || e.disabled || e.down) { this.units.splice(i, 1); continue; }
      const dx = px - e.x, dz = pz - e.z;
      const dist = Math.hypot(dx, dz);

      if (wanted === 0 && u.faction === 'police') u.retreat += dt;
      if (u.faction === 'rival') u.retreat += dt;
      if ((u.retreat > 7 && u.faction === 'police') || (u.retreat > 26 && u.faction === 'rival') || dist > 420) {
        e.removeFrom(this.scene);
        this.units.splice(i, 1);
        continue;
      }
      if (dist < 55 && u.faction === 'police') this.visible = true;

      u.cooldown -= dt;
      if (u.type === 'car') {
        const want = Math.atan2(dx, dz);
        let diff = want - e.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.6));
        const throttle = u.retreat > 0 ? .5 : (dist > 8 ? 1 : -.5);
        e.update(dt, { throttle, steer, boost: wanted >= 3, handbrake: false }, colliders);
        if (dist < 26 && u.cooldown <= 0 && u.retreat === 0) { this.shoot(u, game, dist); u.cooldown = randRange(this.rng, 1.1, 2.1); }
      } else {
        if (u.retreat <= 0) e.setDestination(px, pz);
        e.update(dt);
        if (dist < 24 && u.cooldown <= 0 && u.retreat === 0) { this.shoot(u, game, dist); u.cooldown = randRange(this.rng, 1.3, 2.4); }
      }
    }
    this.sound.setSiren(wanted > 0 && this.units.some((u) => u.faction === 'police' && !u.dead));
  }

  targets() {
    const list = [];
    for (const u of this.units) {
      if (!u.dead) list.push(u.entity);
    }
    return list;
  }
}
