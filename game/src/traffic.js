// Ambient traffic driving a right-hand lane graph between intersections. Cars
// brake for whatever is in front of them and can be stolen by the player.
import * as THREE from 'three';
import { VEHICLE_TYPES, CAR_COLORS, CITY } from './config.js';
import { pick, randRange, chance } from './rng.js';
import { Vehicle } from './vehicles.js';

const LANE = 3.7;

function rightOf(dx, dz) { return { x: dz, z: -dx }; }

export class TrafficSystem {
  constructor(scene, rng, city, count = 22) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.vehicles = [];
    for (let i = 0; i < count; i++) this.spawn();
  }

  spawn(nearIndex = -1) {
    const rng = this.rng;
    const nodes = this.city.nodes;
    let from = nearIndex >= 0 ? nearIndex : Math.floor(rng() * nodes.length);
    if (from < 0 || from >= nodes.length) from = 0;
    const options = nodes[from].neighbors;
    if (!options.length) return null;
    const to = pick(rng, options);
    const a = nodes[from], b = nodes[to];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const right = rightOf(ux, uz);
    const pool = VEHICLE_TYPES.filter((v) => v.name !== 'VULCAN GT' && v.name !== 'CRUISER');
    const def = pick(rng, pool);
    const v = new Vehicle(def, pick(rng, CAR_COLORS),
      a.x + right.x * LANE, a.z + right.z * LANE, Math.atan2(ux, uz));
    v.traffic = { from, to, target: { x: b.x + right.x * LANE, z: b.z + right.z * LANE } };
    v.speed = randRange(rng, 8, 15);
    this.scene.add(v.mesh);
    this.vehicles.push(v);
    return v;
  }

  remove(vehicle) {
    const i = this.vehicles.indexOf(vehicle);
    if (i >= 0) this.vehicles.splice(i, 1);
    vehicle.traffic = null;
  }

  update(dt, otherVehicles, colliders) {
    const nodes = this.city.nodes;
    for (const v of this.vehicles) {
      const t = v.traffic;
      if (!t) continue;
      const dx = t.target.x - v.x, dz = t.target.z - v.z;
      const dist = Math.hypot(dx, dz);
      let steer = 0;
      if (dist > .1) {
        const want = Math.atan2(dx, dz);
        let diff = want - v.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        steer = Math.max(-1, Math.min(1, diff * 1.9));
      } else {
        const here = nodes[t.to];
        const candidates = here.neighbors.filter((n) => n !== t.from);
        const next = candidates.length && chance(this.rng, .82) ? pick(this.rng, candidates) : pick(this.rng, here.neighbors);
        const a = here, b = nodes[next];
        const ux = (b.x - a.x) / CITY.spacing, uz = (b.z - a.z) / CITY.spacing;
        const right = rightOf(ux, uz);
        t.from = t.to; t.to = next;
        t.target = { x: b.x + right.x * LANE, z: b.z + right.z * LANE };
      }

      // Slow for cars and the player ahead in roughly the same direction.
      let closest = 999;
      const fwd = v.forward;
      const all = this.vehicles.concat(otherVehicles);
      for (const o of all) {
        if (o === v) continue;
        const ox = o.x - v.x, oz = o.z - v.z;
        const ahead = ox * fwd.x + oz * fwd.z;
        const across = Math.abs(ox * fwd.z - oz * fwd.x);
        if (ahead > 0 && ahead < 16 && across < 2.6) closest = Math.min(closest, ahead);
      }
      const desired = Math.min(v.def.speed * .62, closest < 12 ? Math.max(0, (closest - 5) * 1.6) : v.def.speed * .62);
      const throttle = v.speed < desired - .5 ? 1 : v.speed > desired + 1 ? -1 : 0;
      v.update(dt, { throttle, steer, handbrake: false, boost: false }, colliders);
    }
  }
}
