// Story jobs and their world markers. Steps are data-driven in config.js:
// travel, pick up a case, steal a named car, deliver, get paid.
import * as THREE from 'three';
import { MISSIONS, STORY, CITY } from './config.js';

export class MissionSystem {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.index = 0;
    this.step = 0;
    this.completed = [];
    this.active = false;
    this.pendingNext = false;
    this.t = 0;
    this.marker = this.makeMarker();
    scene.add(this.marker);
  }

  makeMarker() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf7c873, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    beam.position.y = 17;
    group.add(beam);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.7),
      new THREE.MeshBasicMaterial({ color: 0xffd77e, toneMapped: false }));
    diamond.position.y = 5.5;
    group.add(diamond);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, .16, 6, 36),
      new THREE.MeshBasicMaterial({ color: 0x5ce0d0, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .3;
    group.add(ring);
    group.userData = { diamond, ring, beam };
    group.visible = false;
    return group;
  }

  get mission() { return MISSIONS[this.index] || null; }
  get currentStep() { return this.mission ? this.mission.steps[this.step] : null; }
  get title() { return this.mission ? this.mission.name : 'FREE ROAM'; }
  get objective() {
    const s = this.currentStep;
    return s ? s.text : 'Explore Vesper Bay. Steal a car. Cause a scene.';
  }

  getTarget() {
    const s = this.currentStep;
    if (!s || !s.point) return null;
    return { x: s.point[0], z: s.point[1], radius: s.radius || 12 };
  }

  setProgress(index, step, completed) {
    this.index = Math.max(0, Math.min(MISSIONS.length, index | 0));
    this.step = Math.max(0, step | 0);
    this.completed = Array.isArray(completed) ? completed.slice() : [];
    this.active = this.index < MISSIONS.length;
    this.pendingNext = false;
  }

  start(index = 0) {
    this.setProgress(index, 0, []);
    this.active = true;
    if (this.mission) this.pushToast(`NEW JOB · ${this.mission.name}`, this.mission.brief);
  }

  pushToast(title, body) {
    if (this.game && this.game.hud) this.game.hud.toast(`${title} — ${body}`);
  }

  attach(game) { this.game = game; }

  advance() {
    this.step++;
    const s = this.currentStep;
    if (s) this.pushToast('OBJECTIVE', s.text);
    if (s && s.type === 'goto' && this.mission.ambushAtStep === this.step - 1) {
      // Ambush is fired when the case is actually grabbed (see pickup below).
    }
  }

  finish(game) {
    const mission = this.mission;
    const reward = mission.steps[mission.steps.length - 1].reward || 0;
    game.player.cash += reward;
    game.player.respect += 1;
    if (!this.completed.includes(mission.id)) this.completed.push(mission.id);
    this.sound.mission();
    this.active = false;
    this.marker.visible = false;
    this.pendingNext = this.index + 1 < MISSIONS.length;
    game.save();
    game.showResult(
      'JOB REPORT',
      'MISSION COMPLETE',
      this.pendingNext
        ? `The ${STORY.gang} never saw it coming. Oro has another proposition for you.`
        : `Vex is clear. The whole bay knows her name now. Story jobs complete.`,
      `+ $${reward.toLocaleString()}   ·   +1 RESPECT`,
      this.pendingNext ? 'NEXT JOB' : 'FREE ROAM',
    );
  }

  afterResult() {
    if (this.pendingNext) {
      this.index++;
      this.step = 0;
      this.active = true;
      this.pendingNext = false;
      this.pushToast('NEW JOB · ' + this.mission.name, this.mission.brief);
    }
  }

  update(dt, game) {
    this.t += dt;
    const target = this.getTarget();
    this.marker.visible = !!target && this.active;
    if (target) {
      this.marker.position.set(target.x, 0, target.z);
      this.marker.userData.diamond.rotation.y += dt * 1.6;
      this.marker.userData.diamond.position.y = 5.5 + Math.sin(this.t * 2.2) * .45;
      this.marker.userData.ring.rotation.z += dt * .5;
      this.marker.userData.ring.scale.setScalar(1 + Math.sin(this.t * 3) * .05);
    }
    if (!this.active || !this.mission) return;
    const step = this.currentStep;
    if (!step) return;
    const player = game.player;
    const px = player.inVehicle ? player.inVehicle.x : player.x;
    const pz = player.inVehicle ? player.inVehicle.z : player.z;

    if (step.type === 'goto') {
      if (Math.hypot(px - step.point[0], pz - step.point[1]) < step.radius) {
        this.sound.pickup();
        this.advance();
      }
    } else if (step.type === 'pickup') {
      player.hasCase = true;
      game.peds.alert(px, pz, 26);
      game.police.spawnAmbush(px, pz, 3);
      game.wanted.commit(2);
      this.pushToast('PACKAGE SECURED', `${STORY.gang} are moving in. Get the case to The Lantern Room.`);
      this.sound.pickup();
      this.advance();
    } else if (step.type === 'stealVehicle') {
      if (game.lastStolenName === step.vehicle || (player.inVehicle && player.inVehicle.def.name === step.vehicle)) {
        this.pushToast('NICE RIDE', 'Get it to the harbor chop shop before the heat finds you.');
        this.advance();
      }
    } else if (step.type === 'complete') {
      this.finish(game);
    }
  }
}
