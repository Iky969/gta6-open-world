// Hitscan shooting, tracers and impact sparks. Targets only need x/z/radius and
// a damage() method, so pedestrians, police and cars all share one pipeline.
import * as THREE from 'three';

const tracerGeo = new THREE.CylinderGeometry(.035, .035, 1, 5);
tracerGeo.rotateX(Math.PI / 2);
const flashGeo = new THREE.SphereGeometry(.22, 8, 6);

export class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
  }

  tracer(from, to, color = 0xffd98a, life = .11) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, toneMapped: false, depthWrite: false });
    const m = new THREE.Mesh(tracerGeo, mat);
    const delta = new THREE.Vector3().subVectors(to, from);
    const length = delta.length() || .01;
    m.position.copy(from).addScaledVector(delta, .5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize());
    m.scale.set(1, 1, length);
    this.scene.add(m);
    this.effects.push({ mesh: m, life, max: life, kind: 'tracer' });
  }

  flash(at, color = 0xffc66b) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, toneMapped: false });
    const m = new THREE.Mesh(flashGeo, mat);
    m.position.copy(at);
    this.scene.add(m);
    this.effects.push({ mesh: m, life: .07, max: .07, kind: 'flash' });
  }

  // Fire one hitscan round. Returns the target that was hit, if any.
  fire(origin, direction, range, targets, damage, color = 0xffd98a) {
    const dir = direction.clone().normalize();
    const end = origin.clone().addScaledVector(dir, range);
    let best = null;
    let bestDist = range;
    for (const target of targets) {
      if (!target || target.dead || target.disabled || target.down) continue;
      const tx = target.x, tz = target.z;
      const ty = target.radius > 1.5 ? 1.0 : 1.35;
      const to = new THREE.Vector3(tx - origin.x, ty - origin.y, tz - origin.z);
      const along = to.dot(dir);
      if (along <= 0 || along >= bestDist) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp < (target.radius || .8) + .55) { best = target; bestDist = along; }
    }
    const hitPoint = best ? new THREE.Vector3(best.x, best.radius > 1.5 ? 1.0 : 1.35, best.z) : end;
    this.tracer(origin, hitPoint, color);
    this.flash(origin, color);
    if (best) {
      this.flash(hitPoint, 0xff7b52);
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
        this.scene.remove(e.mesh);
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }
}
