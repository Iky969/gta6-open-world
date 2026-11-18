// The playable character: on-foot movement, stealing and driving cars, damage,
// cash/respect and the little case carried during the opening job.
import * as THREE from 'three';
import { createPedMesh } from './pedestrians.js';
import { CITY } from './config.js';

export class Player {
  constructor(scene, rng) {
    this.scene = scene;
    this.mesh = createPedMesh(0xe8b363, rng);
    scene.add(this.mesh);
    this.x = -88; this.z = 88;
    this.yaw = 0;
    this.health = 100;
    this.armor = 0;
    this.cash = 0;
    this.respect = 0;
    this.ammo = 12;
    this.ammoMax = 12;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.inVehicle = null;
    this.hasCase = false;
    this.dead = false;
    this.anim = 0;
    this.speed = 0;

    const caseGeo = new THREE.BoxGeometry(.5, .38, .22);
    this.caseMesh = new THREE.Mesh(caseGeo, new THREE.MeshStandardMaterial({ color: 0xf2c46b, metalness: .7, roughness: .3, emissive: 0x6b440c, emissiveIntensity: .5 }));
    this.caseMesh.position.set(-.55, 1.1, .12);
    this.caseMesh.visible = false;
    this.mesh.add(this.caseMesh);
  }

  update(dt, controls, cameraYaw, colliders) {
    if (this.inVehicle) return;
    const forward = (controls.forward || 0);
    const strafe = (controls.strafe || 0);
    const camForward = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
    const camRight = { x: Math.cos(cameraYaw), z: -Math.sin(cameraYaw) };
    let mx = camForward.x * forward + camRight.x * strafe;
    let mz = camForward.z * forward + camRight.z * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) { mx /= len; mz /= len; }
    const sprint = controls.sprint ? 10.6 : 6.4;
    this.speed = len > .01 ? sprint : 0;
    this.x += mx * this.speed * dt;
    this.z += mz * this.speed * dt;

    // Simple circle-versus-box push-out against the city's building AABBs.
    const r = .62;
    for (const c of colliders) {
      const dx = this.x - c.x, dz = this.z - c.z;
      const ox = c.hw + r - Math.abs(dx);
      const oz = c.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) this.x += Math.sign(dx || 1) * ox;
        else this.z += Math.sign(dz || 1) * oz;
      }
    }
    const onPier = Math.abs(this.z - CITY.pierZ) < 11 && this.x > CITY.limit - 24;
    if (!onPier && this.x > CITY.oceanX - 3) this.x = CITY.oceanX - 3;
    if (onPier && this.x > 368) this.x = 368;
    if (this.x < -CITY.limit) this.x = -CITY.limit;
    if (this.z < -CITY.limit) this.z = -CITY.limit;
    if (this.z > CITY.limit) this.z = CITY.limit;

    const face = controls.aiming ? cameraYaw : (len > .01 ? Math.atan2(mx, mz) : this.yaw);
    let diff = face - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 12);
    if (len > .01) this.anim += dt * (controls.sprint ? 12 : 8);
    const swing = Math.sin(this.anim) * .55 * (len > .01 ? 1 : 0);
    for (const limb of this.mesh.userData.limbs) {
      limb.leg.rotation.x = swing * limb.side;
      limb.arm.rotation.x = -swing * limb.side;
    }
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.anim)) * .05, this.z);
    this.mesh.rotation.y = this.yaw;
    this.caseMesh.visible = this.hasCase;
  }

  enterVehicle(vehicle) {
    if (this.inVehicle) return;
    this.inVehicle = vehicle;
    vehicle.driver = this;
    vehicle.traffic = null;
    this.mesh.visible = false;
    this.caseMesh.visible = false;
  }

  exitVehicle() {
    const v = this.inVehicle;
    if (!v) return;
    this.inVehicle = null;
    v.driver = null;
    const fwd = v.forward;
    this.x = v.x - fwd.x * 3.2;
    this.z = v.z - fwd.z * 3.2;
    this.yaw = v.heading;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
  }

  damage(amount) {
    if (this.dead) return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * .65);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  respawn(x, z) {
    if (this.inVehicle) {
      this.inVehicle.driver = null;
      this.inVehicle = null;
    }
    this.x = x; this.z = z;
    this.health = 100;
    this.dead = false;
    this.mesh.visible = true;
    this.mesh.rotation.x = 0;
    this.mesh.position.set(x, 0, z);
  }
}
