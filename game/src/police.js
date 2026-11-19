// Police response and rival gang ambushes. Cruisers pursue on roads, officers
// close in on foot, and at high heat a roadblock and a helicopter join in.
// Both police and rivals shoot with distance-scaled accuracy.
import * as THREE from 'three';
import { VEHICLE_TYPES, POLICE_CONFIG } from './config.js';
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
    this.heli = null;
    this.roadblock = null;
    this._tmp = new THREE.Vector3();
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
    const unit = { type: 'car', entity: v, faction, cooldown: randRange(this.rng, .4, 1.6), retreat: 0, dead: false, block: false };
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

  // A stationary pair of cruisers parked across the road ahead of the player.
  setRoadblock(px, pz, wanted) {
    if (this.roadblock && this.roadblock.length) return;
    const node = this.nodeNear(px, pz, 70, 130);
    const dir = Math.atan2(node.x - px, node.z - pz);
    const side = dir + Math.PI / 2;
    this.roadblock = [
      this.spawnCar(node.x + Math.sin(side) * 7, node.z + Math.cos(side) * 7, 'police', side),
      this.spawnCar(node.x - Math.sin(side) * 7, node.z - Math.cos(side) * 7, 'police', side),
    ];
    for (const u of this.roadblock) u.block = true;
  }

  clearRoadblock() {
    if (!this.roadblock) return;
    for (const u of this.roadblock) { u.dead = true; u.entity.removeFrom(this.scene); }
    this.roadblock = null;
  }

  // Search helicopter: a hovering body with a spinning rotor and a searchlight
  // cone. It is a shootable target like any other unit.
  spawnHelicopter() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3b45, roughness: .6, metalness: .3 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), bodyMat);
    body.scale.set(1, .7, 1.7); group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, 5.2), bodyMat);
    tail.position.z = -3.6; group.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, .12, .5), new THREE.MeshBasicMaterial({ color: 0x20282e }));
    rotor.position.y = 1.5; group.add(rotor);
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(3.4, 24, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    lamp.position.y = -12; group.add(lamp);
    this.scene.add(group);
    const entity = {
      x: 0, z: 0, radius: 2.4, health: 60, down: false, disabled: false,
      update: () => {},
      damage: (amount) => {
        entity.health -= amount;
        if (entity.health <= 0) { entity.down = true; return true; }
        return false;
      },
      removeFrom: (scene) => scene.remove(group),
    };
    this.heli = { type: 'heli', entity, faction: 'police', cooldown: 2, retreat: 0, dead: false, group, rotor, lamp };
    return this.heli;
  }

  clearHelicopter() {
    if (!this.heli) return;
    this.heli.dead = true;
    this.scene.remove(this.heli.group);
    this.heli = null;
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
    const from = this._tmp.set(e.x, unit.type === 'car' ? 1.65 : 1.5, e.z).clone();
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

    // High heat brings escalated responses: a roadblock first, then a chopper.
    if (wanted >= POLICE_CONFIG.roadblockStars && !this.roadblock) this.setRoadblock(px, pz, wanted);
    if (wanted < POLICE_CONFIG.roadblockStars) this.clearRoadblock();
    if (wanted >= POLICE_CONFIG.heliStars && !this.heli) this.spawnHelicopter();
    if (wanted < POLICE_CONFIG.heliStars || (this.heli && this.heli.entity.down)) this.clearHelicopter();
    if (this.heli) {
      const h = this.heli;
      h.entity.x += (px - h.entity.x) * Math.min(1, dt * .5);
      h.entity.z += (pz - h.entity.z) * Math.min(1, dt * .5);
      h.group.position.set(h.entity.x, 26 + Math.sin(performance.now() * .001) * .5, h.entity.z);
      h.group.rotation.y = Math.atan2(px - h.entity.x, pz - h.entity.z);
      h.rotor.rotation.y += dt * 28;
      this.visible = true;
      h.cooldown -= dt;
      if (wanted > 0 && h.cooldown <= 0) {
        h.cooldown = 1.6;
        this.combat.tracer(new THREE.Vector3(h.entity.x, 25, h.entity.z), new THREE.Vector3(px, 1.3, pz), 0xffb46b);
        if (this.rng() < .55) player.damage(5 + wanted);
      }
    }

    this.spawnCooldown -= dt;
    const policeCount = this.units.filter((u) => u.faction === 'police' && !u.dead && !u.block).length;
    const targetCount = wanted > 0 ? Math.min(POLICE_CONFIG.maxUnits, 2 + Math.floor(wanted * 1.4)) : 0;
    if (wanted > 0 && policeCount < targetCount && this.spawnCooldown <= 0) {
      const node = this.nodeNear(px, pz);
      if (policeCount % 3 === 2) this.spawnOfficer(node.x, node.z);
      else this.spawnCar(node.x, node.z, 'police', Math.atan2(px - node.x, pz - node.z));
      this.spawnCooldown = 2.4;
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const e = u.entity;
      if (u.dead || e.disabled || e.down) {
        this.units.splice(i, 1);
        continue;
      }
      const dx = px - e.x, dz = pz - e.z;
      const dist = Math.hypot(dx, dz);

      if (wanted === 0 && u.faction === 'police') u.retreat += dt;
      if (u.faction === 'rival') u.retreat += dt;
      if ((u.retreat > 7 && u.faction === 'police' && !u.block) || (u.retreat > 26 && u.faction === 'rival') || dist > 420) {
        e.removeFrom(this.scene);
        this.units.splice(i, 1);
        continue;
      }
      if (dist < 55 && u.faction === 'police') this.visible = true;

      u.cooldown -= dt;
      if (u.block) {
        if (dist < 30 && u.cooldown <= 0) { this.shoot(u, game, dist); u.cooldown = randRange(this.rng, 1.1, 2.1); }
        continue;
      }
      if (u.type === 'car') {
        const want = u.flee ? Math.atan2(e.x - px, e.z - pz) : Math.atan2(dx, dz);
        let diff = want - e.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.6));
        const throttle = u.flee ? 1 : (u.retreat > 0 ? .5 : (dist > 8 ? 1 : -.5));
        e.update(dt, { throttle, steer, boost: !!u.flee || wanted >= 3, handbrake: false }, colliders);
        if (!u.flee && dist < 26 && u.cooldown <= 0 && u.retreat === 0) { this.shoot(u, game, dist); u.cooldown = randRange(this.rng, 1.1, 2.1); }
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

  clearAll() {
    this.clearRoadblock();
    this.clearHelicopter();
    for (const u of this.units) u.entity.removeFrom(this.scene);
    this.units.length = 0;
    this.sound.setSiren(false);
  }
}
