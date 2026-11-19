// Story jobs, side jobs and their world markers. Steps are data-driven in
// config.js: travel, pickups, vehicle theft, chase, escort, timed runs and
// shootouts. Rewards are paid once per id, and a failed job retries from the
// checkpoint captured at the start of the current step.
import * as THREE from 'three';
import { MISSIONS, JOBS, VEHICLE_TYPES, STORY, CITY } from './config.js';
import { applyReward, nextMissionIndex } from './rewards.js';
import { Vehicle } from './vehicles.js';

const ALL_JOBS = MISSIONS.concat(JOBS);

// LAST CALL begins at a fixed curbside intersection with a car provided, so the
// 52 s window is the same run no matter where the previous job ended.
const LAST_CALL_START = { x: 88, z: -88 };

export class MissionSystem {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.index = 0;
    this.step = 0;
    this.completed = [];
    this.active = false;
    this.pendingNext = false;
    this.finishing = false;
    this.t = 0;
    this.timeLeft = 0;
    this.checkpoint = null;
    this.chaseTarget = null;
    this.escortVehicle = null;
    this.timedVehicle = null;
    this.hostiles = [];
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

  get mission() { return ALL_JOBS[this.index] || null; }
  get currentStep() { return this.mission ? this.mission.steps[this.step] : null; }
  get title() { return this.mission ? this.mission.name : 'FREE ROAM'; }
  get objective() {
    const s = this.currentStep;
    return s ? s.text : 'Explore Vesper Bay. Steal a car. Cause a scene.';
  }
  get isSideJob() { return this.index >= MISSIONS.length; }

  getTarget() {
    const s = this.currentStep;
    if (!s) return null;
    if (s.point) return { x: s.point[0], z: s.point[1], radius: s.radius || 12 };
    if (s.x !== undefined && s.z !== undefined) return { x: s.x, z: s.z, radius: 14 };
    return null;
  }

  setProgress(index, step, completed) {
    this.index = Math.max(0, Math.min(ALL_JOBS.length - 1, index | 0));
    this.step = Math.max(0, step | 0);
    this.completed = Array.isArray(completed) ? completed.filter((id) => typeof id === 'string') : [];
    this.active = this.index < ALL_JOBS.length;
    // A save written on the 'complete' step of an already-paid job must not
    // re-open the result screen (or pay again) when the player continues.
    if (this.active && this.currentStep?.type === 'complete' && this.completed.includes(this.mission.id)) {
      this.active = false;
    }
    this.pendingNext = false;
    this.finishing = false;
    this.clearEntities();
    if (this.game) this.game.lastStolenName = '';
    this.setupStep(this.game);
  }

  start(index = 0) {
    this.setProgress(index, 0, this.completed);
    this.active = true;
    if (this.game) this.game.lastStolenName = '';
    this.saveCheckpoint(this.game);
    if (this.mission) this.pushToast(`NEW JOB · ${this.mission.name}`, this.mission.brief);
  }

  // Pressing E at Oro's marker begins the next job the player has not cleared.
  startNextAvailable() {
    const next = ALL_JOBS.findIndex((m) => !this.completed.includes(m.id));
    this.start(next === -1 ? 0 : next);
  }

  clearEntities() {
    if (this.chaseTarget) { this.chaseTarget.dead = true; this.chaseTarget.entity.removeFrom(this.scene); this.chaseTarget = null; }
    if (this.escortVehicle) { this.escortVehicle.removeFrom(this.scene); this.escortVehicle = null; }
    if (this.timedVehicle) { this.timedVehicle.removeFrom(this.scene); this.timedVehicle = null; }
    for (const u of this.hostiles) { u.dead = true; u.entity.removeFrom(this.scene); }
    this.hostiles.length = 0;
  }

  pushToast(title, body) {
    if (this.game && this.game.hud) this.game.hud.toast(`${title} — ${body}`);
  }

  attach(game) { this.game = game; }

  saveCheckpoint(game) {
    if (!game) return;
    const p = game.player;
    this.checkpoint = {
      step: this.step,
      cash: p.cash, respect: p.respect,
      x: p.inVehicle ? p.inVehicle.x : p.x,
      z: p.inVehicle ? p.inVehicle.z : p.z,
    };
  }

  spawnVan(x, z, game) {
    const def = VEHICLE_TYPES.find((d) => d.name === 'SOL VAN');
    const v = new Vehicle(def, 0xe8b23c, x, z, 0);
    v.onDestroyed = () => this.onVehicleDestroyed(v, game);
    this.scene.add(v.mesh);
    this.escortVehicle = v;
    return v;
  }

  setupStep(game) {
    if (!game) return;
    const s = this.currentStep;
    if (!s) return;
    this.timeLeft = s.type === 'timedGoto' ? s.time : 0;
    const px = game.player.x, pz = game.player.z;
    if (s.type === 'chase' && !this.chaseTarget) {
      const unit = game.police.spawnCar(s.x, s.z, 'rival', s.heading || 0);
      unit.flee = true; unit.retreat = -999;
      this.chaseTarget = unit;
      this.pushToast('TARGET SPOTTED', 'The courier is armed. Ram him until his car dies.');
    } else if (s.type === 'escortPickup' && !this.escortVehicle) {
      this.spawnVan(s.point[0], s.point[1], game);
    } else if (s.type === 'escort' && !this.escortVehicle) {
      // Retry/continue from the escort checkpoint: the van reappears beside the player.
      this.spawnVan(px + 8, pz, game);
    } else if (s.type === 'timedGoto') {
      // Provide a car at a fixed curbside start, facing the drop-off, so the
      // timed run is fair and identical wherever the previous job ended.
      const p = game.player;
      if (p.inVehicle) p.exitVehicle();
      p.x = LAST_CALL_START.x; p.z = LAST_CALL_START.z;
      p.mesh.position.set(p.x, 0, p.z);
      if (this.timedVehicle) this.timedVehicle.removeFrom(this.scene);
      const def = VEHICLE_TYPES.find((d) => d.name === 'NOVA COUPE');
      const heading = Math.atan2(s.point[0] - p.x, s.point[1] - p.z);
      const v = new Vehicle(def, 0xd7523f, p.x, p.z, heading);
      v.onDestroyed = () => this.onVehicleDestroyed(v, game);
      this.scene.add(v.mesh);
      this.timedVehicle = v;
      p.enterVehicle(v);
    } else if (s.type === 'shootout' && !this.hostiles.length) {
      for (let i = 0; i < s.count; i++) {
        const a = (i / s.count) * Math.PI * 2;
        const u = game.police.spawnOfficer(s.point[0] + Math.cos(a) * 12, s.point[1] + Math.sin(a) * 12, 'rival');
        u.retreat = -999;
        this.hostiles.push(u);
      }
    }
  }

  advance() {
    const prev = this.currentStep;
    this.step++;
    const s = this.currentStep;
    // The convoy van carries over from the pickup into the escort step; hide it
    // from clearEntities so its mesh survives. The timed-run car becomes the
    // player's own once the delivery step is cleared, so release it untouched.
    const van = s?.type === 'escort' ? this.escortVehicle : null;
    this.escortVehicle = null;
    if (prev?.type === 'timedGoto') this.timedVehicle = null;
    this.clearEntities();
    this.escortVehicle = van;
    if (s) this.pushToast('OBJECTIVE', s.text);
    this.saveCheckpoint(this.game);
    this.setupStep(this.game);
  }

  finish(game) {
    if (this.finishing || !this.active) return;
    const mission = this.mission;
    if (!mission) return;
    this.finishing = true;
    const step = mission.steps[mission.steps.length - 1];
    const reward = step?.reward || 0;
    // Idempotent: a second finish() for the same id pays nothing and says so.
    const rewardState = { completed: this.completed, cash: game.player.cash, respect: game.player.respect };
    const { paid } = applyReward(rewardState, mission.id, reward);
    game.player.cash = rewardState.cash;
    game.player.respect = rewardState.respect;
    this.completed = rewardState.completed;
    this.sound.mission();
    this.active = false;
    this.marker.visible = false;
    this.clearEntities();
    this.pendingNext = nextMissionIndex(this.index, ALL_JOBS.length) >= 0;
    game.showResult('JOB REPORT', paid ? 'MISSION COMPLETE' : 'ALREADY COMPLETED',
      paid
        ? (this.pendingNext
            ? `The ${STORY.gang} never saw it coming. Oro has another proposition for you.`
            : `Vex is clear. The whole bay knows her name now. Every job is done.`)
        : 'Oro already paid for this one. There is nothing left to collect.',
      paid ? `+ $${reward.toLocaleString()}   ·   +1 RESPECT` : 'REWARD ALREADY PAID',
      this.pendingNext ? 'NEXT JOB' : 'FREE ROAM', false, () => {
        this.afterResult();
        // Persist the reward and the next-job progress after the result closes.
        game.save();
        game.mode = 'playing';
      });
  }

  afterResult() {
    if (this.pendingNext) {
      const next = nextMissionIndex(this.index, ALL_JOBS.length);
      this.index = next;
      this.step = 0;
      this.active = true;
      this.pendingNext = false;
      this.finishing = false;
      this.game.lastStolenName = '';
      this.saveCheckpoint(this.game);
      this.setupStep(this.game);
      this.pushToast('NEW JOB · ' + this.mission.name, this.mission.brief);
    } else {
      this.finishing = false;
    }
  }

  // --- fail states ------------------------------------------------------------
  fail(reason, game, detail = '') {
    if (!this.active) return;
    this.active = false;
    this.marker.visible = false;
    this.clearEntities();
    this.sound.busted();
    game.showResult('JOB FAILED', reason,
      detail || 'The job fell apart. Oro says you get one more shot at it.',
      'CHECKPOINT RETRY', 'RETRY JOB', true, () => {
        this.retry(game);
        game.mode = 'playing';
      });
  }

  retry(game) {
    const cp = this.checkpoint;
    game.player.cash = cp ? cp.cash : game.player.cash;
    game.player.respect = cp ? cp.respect : game.player.respect;
    game.player.health = 100;
    game.player.armor = 0;
    game.player.dead = false;
    if (game.player.inVehicle) game.player.exitVehicle();
    game.player.respawn(cp ? cp.x : -88, cp ? cp.z : 88);
    game.police.clearAll();
    game.wanted.setLevel(0);
    if (game.input) game.input.releasePointerLock?.();
    this.step = cp ? cp.step : 0;
    this.active = true;
    this.finishing = false;
    game.lastStolenName = '';
    this.saveCheckpoint(game);
    this.setupStep(game);
    this.pushToast('RETRY', this.objective);
    game.save();
  }

  onPlayerDeath(game) {
    const reason = this.mission?.id === 'cold-delivery' || this.mission?.id === 'last-call'
      ? 'PACKAGE LOST' : 'WASTED';
    this.fail(reason, game, 'Vex woke up in a alley with the job in ruins. Try the checkpoint again.');
  }

  onVehicleDestroyed(vehicle, game) {
    if (!this.active) return;
    const step = this.currentStep;
    if (vehicle === this.escortVehicle) {
      this.fail('CONVOY LOST', game, 'The van went up in smoke. Oro is not amused.');
    } else if (this.mission?.id === 'hot-wheels' && vehicle.def.name === 'VULCAN GT' &&
        (step?.type === 'stealVehicle' || step?.requiresVehicle)) {
      this.fail('CAR DESTROYED', game, 'The Vulcan is scrap now. Steal another one.');
    } else if (this.chaseTarget && vehicle === this.chaseTarget.entity) {
      this.advance();
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

    if (step.type === 'timedGoto') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.fail('TIME UP', game, 'The window closed. The package is cold.');
        return;
      }
    }
    if (step.type === 'chase' && this.chaseTarget) {
      const e = this.chaseTarget.entity;
      if (e.disabled || e.down || e.health <= 0) { this.advance(); return; }
    }
    if (step.type === 'escort' && this.escortVehicle) {
      const v = this.escortVehicle;
      if (v.disabled) { this.fail('CONVOY LOST', game); return; }
      // Follow behind the vehicle's actual heading, not the stale on-foot yaw.
      const heading = player.inVehicle ? player.inVehicle.heading : (player.yaw || 0);
      const behind = { x: px - Math.sin(heading) * 8, z: pz - Math.cos(heading) * 8 };
      const dx = behind.x - v.x, dz = behind.z - v.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let diff = want - v.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      v.update(dt, { throttle: dist > 9 ? 1 : 0, steer: Math.max(-1, Math.min(1, diff * 1.8)) }, game.city.colliders);
    }
    if (step.type === 'shootout') {
      const alive = this.hostiles.filter((u) => !u.dead && !u.entity.down && !u.entity.dead);
      if (alive.length === 0 && this.hostiles.length) { this.advance(); return; }
    }

    if (step.type === 'goto' || step.type === 'timedGoto' || step.type === 'escort') {
      const point = step.point;
      if (!point) return;
      if (Math.hypot(px - point[0], pz - point[1]) < step.radius) {
        if (step.requiresVehicle && !(player.inVehicle && player.inVehicle.def.name === step.requiresVehicle)) {
          if (!this._vehicleWarn || this.t - this._vehicleWarn > 3) {
            this._vehicleWarn = this.t;
            this.pushToast('WRONG RIDE', `You must be driving the ${step.requiresVehicle}.`);
          }
          return;
        }
        if (step.type === 'escort' && this.escortVehicle &&
            Math.hypot(this.escortVehicle.x - point[0], this.escortVehicle.z - point[1]) > step.radius + 8) return;
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
      if (player.inVehicle && player.inVehicle.def.name === step.vehicle) {
        game.lastStolenName = step.vehicle;
        this.pushToast('NICE RIDE', 'Get it to the harbor chop shop before the heat finds you.');
        this.advance();
      }
    } else if (step.type === 'escortPickup') {
      if (Math.hypot(px - step.point[0], pz - step.point[1]) < step.radius) {
        this.pushToast('CONVOY READY', 'Lead the van to the harbor. Keep it alive.');
        this.advance();
      }
    } else if (step.type === 'complete') {
      this.finish(game);
    }
  }
}
