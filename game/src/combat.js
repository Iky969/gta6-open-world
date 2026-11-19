// Hitscan shooting, pooled tracers and impact sparks. Targets only need x/z/
// radius and a damage() method, so pedestrians, police and cars share one
// pipeline. Shots are blocked by building AABBs (line-of-sight), and every
// effect mesh/material is pooled so combat never allocates in the frame loop.
import * as THREE from 'three';

const tracerGeo = new THREE.CylinderGeometry(.035, .035, 1, 5);
tracerGeo.rotateX(Math.PI / 2);
const flashGeo = new THREE.SphereGeometry(.22, 8, 6);
const FORWARD = new THREE.Vector3(0, 0, 1);

// 2D slab test: does the horizontal segment a->b pass through an AABB whose
// footprint is (x,z,hw,hd)? Used for line-of-sight against city.colliders.
export function segmentHitsBox(ax, az, bx, bz, box) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (const [origin, delta, centre, half] of [
    [ax, dx, box.x, box.hw], [az, dz, box.z, box.hd],
  ]) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < centre - half || origin > centre + half) return false;
    } else {
      let lo = (centre - half - origin) / delta;
      let hi = (centre + half - origin) / delta;
      if (lo > hi) { const s = lo; lo = hi; hi = s; }
      t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export class CombatSystem {
  constructor(scene, colliders = []) {
    this.scene = scene;
    this.colliders = colliders;
    this.effects = [];
    this.pool = [];
    this._dir = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._point = new THREE.Vector3();
  }

  setColliders(colliders) { this.colliders = colliders; }

  obtain(geo) {
    for (const m of this.pool) {
      if (!m.visible) { m.visible = true; return m; }
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    this.scene.add(m);
    this.pool.push(m);
    return m;
  }

  tracer(from, to, color = 0xffd98a, life = .11) {
    const m = this.obtain(tracerGeo);
    m.geometry = tracerGeo;
    this._delta.subVectors(to, from);
    const length = this._delta.length() || .01;
    m.position.copy(from).addScaledVector(this._delta, .5);
    this._dir.copy(this._delta).normalize();
    m.quaternion.setFromUnitVectors(FORWARD, this._dir);
    m.scale.set(1, 1, length);
    m.material.color.setHex(color);
    m.material.opacity = .95;
    this.effects.push({ mesh: m, life, max: life, kind: 'tracer' });
  }

  flash(at, color = 0xffc66b) {
    const m = this.obtain(flashGeo);
    m.geometry = flashGeo;
    m.position.copy(at);
    m.quaternion.identity();
    m.scale.setScalar(1);
    m.material.color.setHex(color);
    m.material.opacity = .9;
    this.effects.push({ mesh: m, life: .07, max: .07, kind: 'flash' });
  }

  // A target is only hittable when no building wall stands between the muzzle
  // and the target. Skip low props so crates do not block every shot.
  hasLineOfSight(origin, hitPoint) {
    for (const c of this.colliders) {
      if (!c.height || c.height < 1.4) continue;
      if (segmentHitsBox(origin.x, origin.z, hitPoint.x, hitPoint.z, c)) return false;
    }
    return true;
  }

  // Fire one hitscan round. Returns the target that was hit, if any.
  fire(origin, direction, range, targets, damage, color = 0xffd98a) {
    const dir = this._dir.copy(direction).normalize();
    this._point.copy(origin).addScaledVector(dir, range);
    let best = null;
    let bestDist = range;
    for (const target of targets) {
      if (!target || target.dead || target.disabled || target.down) continue;
      const tx = target.x, tz = target.z;
      const ty = target.radius > 1.5 ? 1.0 : 1.35;
      this._to.set(tx - origin.x, ty - origin.y, tz - origin.z);
      const along = this._to.dot(dir);
      if (along <= 0 || along >= bestDist) continue;
      const perp = Math.sqrt(Math.max(0, this._to.lengthSq() - along * along));
      if (perp < (target.radius || .8) + .55 && this.hasLineOfSight(origin, this._to.set(tx, ty, tz))) {
        best = target; bestDist = along;
      }
    }
    if (best) this._point.set(best.x, best.radius > 1.5 ? 1.0 : 1.35, best.z);
    this.tracer(origin, this._point, color);
    this.flash(origin, color);
    if (best) {
      this.flash(this._point, 0xff7b52);
      best.damage(damage);
    }
    return best;
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      e.mesh.material.opacity = Math.max(0, e.life / e.max);
      if (e.kind === 'flash') e.mesh.scale.setScalar(1 + (1 - e.life / e.max) * 1.6);
      if (e.life <= 0) {
        e.mesh.visible = false;
        this.effects.splice(i, 1);
      }
    }
  }
}
