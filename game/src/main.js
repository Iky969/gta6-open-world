// Vesper Bay — Golden Hustle. Boot, systems integration, camera and main loop.
import * as THREE from 'three';
import { CITY, CAMERA, PALETTE, VEHICLE_TYPES, CAR_COLORS, START_POSITION } from './config.js';
import { makeRng, pick } from './rng.js';
import { buildCity } from './city.js';
import { createSky } from './sky.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { Player } from './player.js';
import { TrafficSystem } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { WantedSystem } from './wanted.js';
import { CombatSystem } from './combat.js';
import { MissionSystem } from './mission.js';
import { Vehicle } from './vehicles.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { createShotController } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number.parseInt(params.get('seed') || '1337', 10) || 1337;
const shotMode = params.get('shot');
const rng = makeRng(seed);

// --- renderer, scene, lighting ------------------------------------------------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.fog, 165, 980);
const sunDir = new THREE.Vector3(-.62, .34, -.72).normalize();
scene.add(createSky(sunDir));
scene.add(new THREE.HemisphereLight(0xd2ebff, 0xb47d4e, 1.5));
const sun = new THREE.DirectionalLight(0xffd7a4, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 480;
sun.shadow.bias = -.0007;
sun.shadow.normalBias = .035;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x8fe6e0, .65);
rim.position.set(180, 90, 220);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, .1, 2600);
camera.position.set(-100, 40, 180);

const city = buildCity(scene, rng);
const input = new Input(canvas);
const sound = new Sound();
const hud = new HUD();
const combat = new CombatSystem(scene);
const police = new PoliceSystem(scene, rng, city, combat, sound);
const peds = new PedestrianSystem(scene, rng, city, 32);
const traffic = new TrafficSystem(scene, rng, city, 22);
const player = new Player(scene, rng);
const wanted = new WantedSystem();
const mission = new MissionSystem(scene, sound);

const game = {
  scene, renderer, camera, city, input, sound, hud, combat, police, peds, traffic,
  player, wanted, mission, seed,
  mode: 'title',
  camYaw: .3,
  camPitch: .22,
  prompt: '',
  shake: 0,
  lastStolenName: '',
  shot: null,
  menus: null,
  save() {
    if (this.mode === 'title') return;
    saveGame({
      player: this.player,
      cash: this.player.cash,
      respect: this.player.respect,
      missionIndex: this.mission.index,
      missionStep: this.mission.step,
      completed: this.mission.completed,
      wanted: this.wanted.level,
    });
  },
  showResult(kicker, title, body, reward, buttonLabel, danger = false, onResult = null) {
    this.mode = 'result';
    this.menus.showResult(kicker, title, body, reward, buttonLabel, danger, () => {
      this.menus.hideResult();
      if (onResult) onResult();
      else { this.mission.afterResult(); this.mode = 'playing'; }
    });
  },
};

function clearPolice() {
  for (const u of police.units) u.entity.removeFrom(scene);
  police.units.length = 0;
  sound.setSiren(false);
}

function beginNewGame() {
  clearSave();
  clearPolice();
  if (player.inVehicle) player.exitVehicle();
  player.respawn(START_POSITION.x, START_POSITION.z);
  player.health = 100; player.armor = 0; player.cash = 0; player.respect = 0;
  player.ammo = player.ammoMax; player.hasCase = false; player.dead = false;
  wanted.setLevel(0);
  mission.start(0);
  game.camYaw = .3; game.camPitch = .22;
  game.mode = 'playing';
  game.menus.hideTitle(); game.menus.hidePause(); game.menus.hideResult();
  game.hud.show(true);
  sound.unlock();
  game.hud.toast('VESPER BAY — get to the Glass Pier. Oro is waiting.');
}

function continueGame() {
  const data = loadGame();
  if (!data) { beginNewGame(); return; }
  clearPolice();
  if (player.inVehicle) player.exitVehicle();
  player.x = data.x; player.z = data.z;
  player.health = data.health; player.armor = data.armor;
  player.cash = data.cash; player.respect = data.respect;
  player.ammo = player.ammoMax; player.hasCase = false; player.dead = false;
  player.mesh.position.set(player.x, 0, player.z);
  wanted.setLevel(data.wanted || 0);
  mission.setProgress(data.missionIndex, data.missionStep, data.completed);
  game.mode = 'playing';
  game.menus.hideTitle(); game.menus.hidePause(); game.menus.hideResult();
  game.hud.show(true);
  sound.unlock();
  game.hud.toast('WELCOME BACK, VEX.');
}

function quitToTitle() {
  game.mode = 'title';
  clearPolice();
  if (player.inVehicle) player.exitVehicle();
  game.menus.hidePause(); game.menus.hideResult();
  game.menus.showTitle(hasSave());
  game.hud.show(false);
  sound.setSiren(false);
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  game.menus.showPause();
  sound.ui();
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  game.menus.hidePause();
  sound.ui();
}

function giveVehicle(name, x, z, heading, color) {
  const def = VEHICLE_TYPES.find((d) => d.name === name) || VEHICLE_TYPES[4];
  const v = new Vehicle(def, color ?? pick(rng, CAR_COLORS), x, z, heading);
  scene.add(v.mesh);
  if (player.inVehicle) player.exitVehicle();
  player.enterVehicle(v);
  game.lastStolenName = def.name;
  return v;
}

function handleDeath() {
  const busted = wanted.level > 0 && rng() < .55;
  const fine = Math.min(player.cash, 500);
  player.cash -= fine;
  sound.busted();
  sound.setSiren(false);
  game.showResult(
    busted ? 'POLICE REPORT' : 'MEDICAL REPORT',
    busted ? 'BUSTED' : 'WASTED',
    busted ? 'The cruisers boxed you in. Vex bailed out with a fine and a new grudge.'
      : 'Vesper Bay patched you up. The street forgets nothing, though.',
    fine > 0 ? `- $${fine}` : 'NO CASH ON HAND',
    'RESPAWN', true, () => {
      clearPolice();
      player.respawn(START_POSITION.x, START_POSITION.z);
      wanted.setLevel(0);
      game.mode = 'playing';
      game.save();
    },
  );
}

const menus = new Menus({
  onNew: () => { beginNewGame(); sound.ui(); },
  onContinue: () => { continueGame(); sound.ui(); },
  onResume: resumeGame,
  onSave: () => { game.save(); hud.toast('GAME SAVED'); sound.ui(); },
  onRestart: () => beginNewGame(),
  onQuit: quitToTitle,
  onSound: () => sound.unlock(),
});
game.menus = menus;
game.beginNewGame = beginNewGame;
game.giveVehicle = giveVehicle;
game.continueGame = continueGame;
game.quitToTitle = quitToTitle;
mission.attach(game);

// --- shot controller ----------------------------------------------------------
const shot = shotMode ? createShotController(shotMode, game) : null;
game.shot = shot;
if (shot) shot.setup();
else { game.mode = 'title'; menus.showTitle(hasSave()); hud.show(false); }

// --- input handling -----------------------------------------------------------
function handleActions() {
  if (input.justPressed('Escape')) {
    if (game.mode === 'playing') pauseGame();
    else if (game.mode === 'paused') resumeGame();
  }
  if (game.mode !== 'playing') return;

  if (input.justPressed('KeyF')) {
    if (player.inVehicle) {
      if (Math.abs(player.inVehicle.speed) < 3) { player.exitVehicle(); sound.ui(); }
      else hud.toast('SLOW DOWN BEFORE BAILING OUT');
    } else {
      const all = traffic.vehicles.concat(police.units.map((u) => u.entity).filter((e) => e instanceof Vehicle));
      let best = null, bd = 4.8;
      for (const v of all) {
        const d = Math.hypot(v.x - player.x, v.z - player.z);
        if (d < bd) { best = v; bd = d; }
      }
      if (best) {
        if (best.isPolice) { wanted.commit(2); hud.toast('POLICE CRUISER STOLEN'); }
        else { wanted.commit(1); hud.toast(`STOLE A ${best.def.name}`); }
        police.releaseEntity(best);
        traffic.remove(best);
        player.enterVehicle(best);
        game.lastStolenName = best.def.name;
        sound.screech();
      }
    }
  }
  if (input.justPressed('KeyE')) {
    const target = mission.getTarget();
    if (target && !player.inVehicle && Math.hypot(player.x - target.x, player.z - target.z) < 20) {
      hud.toast(mission.objective);
    }
  }
  if (input.justPressed('KeyR') && !player.inVehicle && player.ammo < player.ammoMax && player.reloadTimer <= 0) {
    player.reloadTimer = 1.1;
    sound.ui();
  }
}

function fireWeapon() {
  if (player.inVehicle || player.fireCooldown > 0 || player.reloadTimer > 0) return;
  if (player.ammo <= 0) { player.reloadTimer = 1.1; return; }
  player.ammo--;
  player.fireCooldown = .16;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3(player.x, 1.45, player.z).addScaledVector(dir, .7);
  const targets = peds.peds.concat(police.targets(), traffic.vehicles);
  const hit = combat.fire(origin, dir, 78, targets, 34, 0xffe09a);
  sound.shot();
  game.shake = Math.min(1, game.shake + .12);
  if (hit) {
    if (hit.isPolice || hit.unit?.faction === 'police') wanted.commit(2);
    else wanted.commit(1);
    peds.alert(player.x, player.z, 34);
    sound.hit();
  }
}

function updatePrompt() {
  if (player.inVehicle) {
    game.prompt = Math.abs(player.inVehicle.speed) < 3 ? 'F — EXIT VEHICLE' : '';
    return;
  }
  let nearest = null, bd = 4.8;
  const all = traffic.vehicles.concat(police.units.map((u) => u.entity).filter((e) => e instanceof Vehicle));
  for (const v of all) {
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bd) { nearest = v; bd = d; }
  }
  if (nearest) game.prompt = `F — STEAL ${nearest.def.name}`;
  else {
    const target = mission.getTarget();
    if (target && Math.hypot(player.x - target.x, player.z - target.z) < 22) game.prompt = 'E — JOB LOCATION';
  }
}

function updateGameplay(dt, time) {
  const controls = {
    forward: (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0),
    strafe: (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0),
    sprint: input.down('ShiftLeft') || input.down('ShiftRight'),
    aim: input.firing,
    handbrake: input.down('Space'),
  };
  if (player.inVehicle) {
    player.inVehicle.update(dt, {
      throttle: controls.forward,
      steer: controls.strafe,
      boost: controls.sprint,
      handbrake: controls.handbrake,
    }, city.colliders);
  } else {
    player.update(dt, controls, game.camYaw, city.colliders);
    if (player.speed > .1) sound.footstep(time);
  }
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) { player.ammo = player.ammoMax; sound.ui(); }
  }
  if (input.firing || input.firePressed) fireWeapon();

  traffic.update(dt, player.inVehicle ? [player.inVehicle] : [], city.colliders);
  peds.update(dt);
  police.update(dt, game, city.colliders);
  wanted.update(dt, police.visible);
  mission.update(dt, game);
  city.update(dt);
  updatePrompt();
  sound.setEngine(player.inVehicle ? player.inVehicle.speed : 0, controls.forward, !!player.inVehicle);
  if (player.dead) handleDeath();
}

function updateCamera(dt) {
  if (shot && shot.camera) {
    camera.position.copy(shot.camera.position);
    camera.lookAt(shot.camera.look);
    return;
  }
  const look = input.look;
  if (game.mode === 'playing' || game.mode === 'title') {
    game.camYaw -= look.x * .0026;
    game.camPitch = Math.max(-.22, Math.min(.92, game.camPitch - look.y * .0021));
  }
  input.clearLook();
  const v = player.inVehicle;
  const px = v ? v.x : player.x;
  const pz = v ? v.z : player.z;
  const distance = (v ? CAMERA.carDistance : CAMERA.footDistance) + (v ? Math.abs(v.speed) * .09 : 0);
  const pitch = Math.max(-.15, game.camPitch);
  const height = (v ? CAMERA.carHeight : CAMERA.footHeight) + Math.sin(pitch) * distance;
  const flat = Math.cos(pitch) * distance;
  const desired = new THREE.Vector3(
    px - Math.sin(game.camYaw) * flat,
    Math.max(1.4, height),
    pz - Math.cos(game.camYaw) * flat,
  );
  camera.position.lerp(desired, 1 - Math.exp(-dt * 7.5));
  if (game.shake > .001) {
    camera.position.x += (rng() - .5) * game.shake * .7;
    camera.position.y += (rng() - .5) * game.shake * .5;
    game.shake *= Math.exp(-dt * 5);
  }
  const targetY = v ? 1.6 : 1.5;
  camera.lookAt(px, targetY, pz);
  const fov = CAMERA.fov + (v ? Math.min(13, Math.abs(v.speed) * .3) : 0);
  if (Math.abs(camera.fov - fov) > .15) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }

  sun.target.position.set(px, 0, pz);
  sun.position.set(px + sunDir.x * 190, sunDir.y * 190, pz + sunDir.z * 190);
  sun.target.updateMatrixWorld();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- main loop ----------------------------------------------------------------
window.__ready = false;
window.__game = game;
window.renderer = renderer;
window.scene = scene;

let last = performance.now();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(.05, Math.max(.001, (now - last) / 1000));
  last = now;
  elapsed += dt;
  if (shot) shot.update(dt, elapsed);
  handleActions();
  if (game.mode === 'playing') {
    updateGameplay(dt, elapsed);
  } else if (game.mode === 'title') {
    city.update(dt);
    traffic.update(dt, [], city.colliders);
    peds.update(dt);
  }
  updateCamera(dt);
  combat.update(dt);
  if (!game.hud.root.classList.contains('hidden')) hud.update(game);
  renderer.render(scene, camera);
  if (!window.__ready) window.__ready = true;
  input.endFrame();
});
