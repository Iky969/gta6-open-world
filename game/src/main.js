// Vesper Bay — Golden Hustle. Boot, systems integration, camera and main loop.
// Visual randomness (city, traffic, effects) and gameplay randomness (police,
// ambushes, death) are separate seeded streams so a ?shot=&seed= capture is
// reproducible even when a crime roll happens.
import * as THREE from 'three';
import {
  CITY, CAMERA, PALETTE, VEHICLE_TYPES, CAR_COLORS, START_POSITION,
  WEAPONS, PICKUPS, SAFEHOUSE, WEATHER,
} from './config.js';
import { makeStreams, pick } from './rng.js';
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
import { loadSettings, saveSettings } from './settings.js';
import { createShotController } from './shots.js';
import { WeatherSystem } from './weather.js';
import { installRetro } from './retro.js';

function showWebGLFallback(reason) {
  const app = document.getElementById('app');
  const fallback = document.getElementById('webglFallback');
  if (app) app.querySelectorAll('#hud, #title, #pause, #result').forEach((el) => el.classList.add('hidden'));
  if (fallback) fallback.classList.remove('hidden');
  const detail = document.querySelector('#webglFallback p');
  if (detail && reason) detail.textContent += ` (${String(reason.message || reason).slice(0, 90)})`;
}

function boot() {
  const params = new URLSearchParams(location.search);
  const seed = Number.parseInt(params.get('seed') || '1337', 10) || 1337;
  const shotMode = params.get('shot');
  const useRetro = params.get('retro') !== 'off';
  const { visual: visualRng, gameplay: gameplayRng } = makeStreams(seed);
  const settings = loadSettings();

  // --- renderer, scene, lighting ----------------------------------------------
  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    showWebGLFallback(err);
    return;
  }
  let qualityCap = settings.quality === 'low' ? .7 : settings.quality === 'medium' ? 1 : 1.35;
  let adaptiveScale = 1;
  renderer.setPixelRatio(useRetro ? 1 : Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = settings.quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 165, 980);
  const sunDir = new THREE.Vector3(-.62, .34, -.72).normalize();
  const sky = createSky(sunDir);
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xd2ebff, 0xb47d4e, 1.5);
  scene.add(hemi);
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

  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, .1, 2600);
  camera.position.set(-100, 40, 180);

  const city = buildCity(scene, visualRng);
  const sound = new Sound();
  const hud = new HUD();
  const combat = new CombatSystem(scene, city.colliders);
  const police = new PoliceSystem(scene, gameplayRng, city, combat, sound);
  const peds = new PedestrianSystem(scene, visualRng, city, 32);
  const traffic = new TrafficSystem(scene, visualRng, city, 22);
  const player = new Player(scene, visualRng);
  const wanted = new WantedSystem();
  const mission = new MissionSystem(scene, sound);
  const weather = new WeatherSystem(scene, city, sky, sun, hemi, rim, scene.fog, visualRng,
    shotMode ? WEATHER.goldenHour : null);

  // World pickups: health, armor and ammo, respawning on a timer.
  const pickups = PICKUPS.map((def) => {
    const color = def.type === 'health' ? 0x69e0a0 : def.type === 'armor' ? 0x6cb8ff : 0xffd27a;
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.85),
      new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    mesh.position.set(def.x, 1.4, def.z);
    scene.add(mesh);
    return { ...def, mesh, active: true, timer: 0 };
  });
  // PS1-style presentation from the /low-poly skill: coarse render target,
  // vertex snapping, 15-bit dithering and nearest-neighbour textures.
  const retro = useRetro ? installRetro(scene, renderer, camera, { scale: 3 }) : null;

  player.weapon = 0;
  player.ammoByWeapon = [WEAPONS[0].ammo, WEAPONS[1].ammo];

  const game = {
    scene, renderer, camera, city, combat, police, peds, traffic,
    player, wanted, mission, sound, hud, weather, pickups, input: null,
    weapons: WEAPONS, settings, seed,
    shot: null, menus: null,
    camYaw: .3, camPitch: .22, prompt: '', shake: 0,
    lastStolenName: '',
    mode: 'title',
    save() {
      if (this.mode === 'title') return;
      saveGame({
        player: this.player, cash: this.player.cash, respect: this.player.respect,
        weapon: this.player.weapon, ammo: this.player.ammo,
        missionIndex: this.mission.index, missionStep: this.mission.step,
        completed: this.mission.completed, wanted: this.wanted.level,
        safehouse: true,
      });
    },
    showResult(kicker, title, body, reward, buttonLabel, danger = false, onResult = null) {
      this.mode = 'result';
      this.input?.releasePointerLock?.();
      this.menus.showResult(kicker, title, body, reward, buttonLabel, danger, () => {
        this.menus.hideResult();
        if (onResult) onResult();
        else { this.mission.afterResult(); this.save(); this.mode = 'playing'; }
      });
    },
  };

  const input = new Input(canvas, {
    onAutoPause: () => { if (game.mode === 'playing') pauseGame(); },
  });
  game.input = input;
  applySettings();

  function applySettings() {
    sound.setVolume(settings.volume);
    sound.setStation(settings.station);
    input.sensitivity = settings.sensitivity;
    input.setBindings(settings.bindings);
    qualityCap = settings.quality === 'low' ? .7 : settings.quality === 'medium' ? 1 : 1.35;
    renderer.shadowMap.enabled = settings.quality !== 'low';
    renderer.setPixelRatio(useRetro ? 1 : Math.min(window.devicePixelRatio || 1, 1.35));
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    saveSettings(settings);
  }

  function clearPolice() { police.clearAll(); }

  function beginNewGame() {
    clearSave();
    clearPolice();
    if (player.inVehicle) player.exitVehicle();
    player.respawn(START_POSITION.x, START_POSITION.z);
    player.health = 100; player.armor = 0; player.cash = 0; player.respect = 0;
    player.weapon = 0;
    player.ammoByWeapon = [WEAPONS[0].ammo, WEAPONS[1].ammo];
    player.ammo = WEAPONS[0].ammo;
    player.hasCase = false; player.dead = false;
    player.reloadTimer = 0; player.fireCooldown = 0;
    wanted.setLevel(0);
    game.lastStolenName = '';
    mission.setProgress(0, 0, []);
    mission.start(0);
    game.camYaw = .3; game.camPitch = .22;
    game.mode = 'playing';
    game.menus.hideTitle(); game.menus.hidePause(); game.menus.hideResult();
    game.hud.show(true);
    if (!shotMode) sound.unlock();
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
    player.weapon = data.weapon || 0;
    player.ammoByWeapon = [WEAPONS[0].ammo, WEAPONS[1].ammo];
    player.ammoByWeapon[player.weapon] = data.ammo;
    player.ammo = data.ammo;
    player.hasCase = false; player.dead = false;
    player.reloadTimer = 0; player.fireCooldown = 0;
    player.mesh.position.set(player.x, 0, player.z);
    wanted.setLevel(data.wanted || 0);
    game.lastStolenName = '';
    mission.setProgress(data.missionIndex, data.missionStep, data.completed);
    game.mode = 'playing';
    game.menus.hideTitle(); game.menus.hidePause(); game.menus.hideResult();
    game.hud.show(true);
    if (!shotMode) sound.unlock();
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
    input.releasePointerLock();
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
    const v = new Vehicle(def, color ?? pick(visualRng, CAR_COLORS), x, z, heading);
    v.onDestroyed = () => mission.onVehicleDestroyed(v, game);
    scene.add(v.mesh);
    if (player.inVehicle) player.exitVehicle();
    player.enterVehicle(v);
    game.lastStolenName = def.name;
    return v;
  }

  function handleDeath() {
    const busted = wanted.level > 0 && gameplayRng() < .55;
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
    settings,
    bindings: settings.bindings,
    onSettingsChange: (next) => { Object.assign(settings, next); applySettings(); },
    onRebind: (action, code) => {
      settings.bindings[action] = code;
      input.setBindings(settings.bindings);
      saveSettings(settings);
      hud.toast(`${action.toUpperCase()} → ${code}`);
    },
  });
  game.menus = menus;
  game.beginNewGame = beginNewGame;
  game.giveVehicle = giveVehicle;
  game.continueGame = continueGame;
  game.quitToTitle = quitToTitle;
  mission.attach(game);

  // --- shot controller --------------------------------------------------------
  const shot = shotMode ? createShotController(shotMode, game) : null;
  game.shot = shot;
  if (shot) shot.setup();
  else { game.mode = 'title'; menus.showTitle(hasSave()); hud.show(false); }

  // Expose internals to the capture harness only in deterministic shot mode.
  if (shot) {
    window.__game = game;
    window.renderer = renderer;
    window.scene = scene;
  }

  // --- input handling ---------------------------------------------------------
  function handleE() {
    if (player.inVehicle) { hud.toast('EXIT THE CAR TO INTERACT'); return; }
    const px = player.x, pz = player.z;
    if (Math.hypot(px - SAFEHOUSE.x, pz - SAFEHOUSE.z) < 14) {
      game.save(); hud.toast('SAVED AT ORO’S SAFEHOUSE'); sound.ui(); return;
    }
    const target = mission.getTarget();
    if (target && Math.hypot(px - target.x, pz - target.z) < 22) {
      hud.toast(mission.objective);
      if (!mission.active) mission.startNextAvailable();
      return;
    }
    if (Math.hypot(px + 176, pz - 176) < 24) {
      hud.toast('ORO: “There is work if you want it.”');
      if (!mission.active) mission.startNextAvailable();
      return;
    }
    hud.toast('NOBODY HERE TO TALK TO');
  }

  function handleActions() {
    // Input maps physical keys to canonical action names, so checks use the
    // action names rather than the currently configured physical code.
    if (input.justPressed('pause') || input.padPressed(9)) {
      if (game.mode === 'playing') pauseGame();
      else if (game.mode === 'paused') resumeGame();
    }
    if (game.mode !== 'playing') return;

    if (input.justPressed('interact') || input.padPressed(2)) handleE();
    if (input.justPressed('weapon') || input.padPressed(5)) switchWeapon();
    if (input.justPressed('radio') || input.padPressed(4)) { sound.setStation(sound.station + 1); sound.radioClick(); hud.toast(sound.stationName); }
    if (input.justPressed('mute') || input.padPressed(8)) { sound.toggleMute(); hud.toast(sound.muted ? 'RADIO MUTED' : 'RADIO ON'); }
    if (input.justPressed('weather')) { weather.toggleRain(); hud.toast(weather.manualRain ? 'RAIN FRONT INBOUND' : 'SKIES CLEARING'); }
    if (input.justPressed('mapIn')) hud.mapZoom(1);
    if (input.justPressed('mapOut')) hud.mapZoom(-1);

    if (input.justPressed('enter') || input.padPressed(1)) {
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
          best.onDestroyed = () => mission.onVehicleDestroyed(best, game);
          game.lastStolenName = best.def.name;
          sound.screech();
        }
      }
    }
    if ((input.justPressed('reload') || input.padPressed(3)) && !player.inVehicle &&
        player.ammo < WEAPONS[player.weapon].ammo && player.reloadTimer <= 0) {
      player.reloadTimer = 1.1;
      sound.ui();
    }
  }

  function switchWeapon() {
    if (player.inVehicle) return;
    player.ammoByWeapon[player.weapon] = player.ammo;
    player.weapon = player.weapon === 0 ? 1 : 0;
    player.ammo = player.ammoByWeapon[player.weapon];
    player.reloadTimer = 0;
    hud.toast(WEAPONS[player.weapon].name);
    sound.ui();
  }

  function fireWeapon() {
    const weapon = WEAPONS[player.weapon];
    if (player.inVehicle || player.fireCooldown > 0 || player.reloadTimer > 0) return;
    if (player.ammo <= 0) { player.reloadTimer = 1.1; return; }
    player.ammo--;
    player.fireCooldown = weapon.cooldown;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = new THREE.Vector3(player.x, 1.45, player.z).addScaledVector(dir, .7);
    const targets = peds.peds.concat(police.targets(), traffic.vehicles);
    const hit = combat.fire(origin, dir, weapon.range, targets, weapon.damage, weapon.color);
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
    if (Math.hypot(player.x - SAFEHOUSE.x, player.z - SAFEHOUSE.z) < 14) {
      game.prompt = 'E — SAVE AT SAFEHOUSE'; return;
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

  function updatePickups(dt) {
    for (const item of pickups) {
      if (!item.active) {
        item.timer -= dt;
        if (item.timer <= 0) { item.active = true; item.mesh.visible = true; }
        continue;
      }
      item.mesh.rotation.y += dt * 1.8;
      item.mesh.position.y = 1.4 + Math.sin(performance.now() * .003 + item.x) * .16;
      if (Math.hypot(player.x - item.x, player.z - item.z) < 3.2) {
        if (item.type === 'health') player.health = Math.min(100, player.health + item.amount);
        else if (item.type === 'armor') player.armor = Math.min(100, player.armor + item.amount);
        else {
          for (let i = 0; i < WEAPONS.length; i++) player.ammoByWeapon[i] += item.amount;
          player.ammo = player.ammoByWeapon[player.weapon];
        }
        item.active = false; item.mesh.visible = false; item.timer = 38;
        sound.pickup();
        hud.toast(`PICKED UP ${item.type.toUpperCase()}`);
      }
    }
  }

  function updateGameplay(dt, time) {
    const gp = input.pollGamepad();
    const controls = {
      forward: (input.down('forward') || input.down('ArrowUp') ? 1 : 0) -
        (input.down('back') || input.down('ArrowDown') ? 1 : 0),
      strafe: (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0),
      sprint: input.down('sprint'),
      aim: input.firing,
      handbrake: input.down('handbrake'),
    };
    if (gp) {
      controls.forward = Math.max(-1, Math.min(1, controls.forward + gp.forward));
      controls.strafe = Math.max(-1, Math.min(1, controls.strafe + gp.strafe));
      controls.sprint = controls.sprint || gp.sprint;
      controls.handbrake = controls.handbrake || gp.handbrake;
    }
    if (player.inVehicle) {
      player.inVehicle.update(dt, {
        throttle: controls.forward, steer: controls.strafe,
        boost: controls.sprint, handbrake: controls.handbrake,
      }, city.colliders);
    } else {
      player.update(dt, controls, game.camYaw, city.colliders);
      if (player.speed > .1) sound.footstep(time);
    }
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) { player.ammo = WEAPONS[player.weapon].ammo; sound.ui(); }
    }
    if (input.firing || input.firePressed || gp?.fire) fireWeapon();

    traffic.update(dt, player.inVehicle ? [player.inVehicle] : [], city.colliders);
    peds.update(dt);
    police.update(dt, game, city.colliders);
    wanted.update(dt, police.visible);
    mission.update(dt, game);
    updatePickups(dt);
    city.update(dt);
    const focus = { x: player.inVehicle ? player.inVehicle.x : player.x, z: player.inVehicle ? player.inVehicle.z : player.z };
    weather.update(dt, focus);
    hud.setWeather(weather.rain, 1 - Math.max(0, -Math.cos(weather.phase * Math.PI * 2)));
    sound.updateRadio(dt, !!player.inVehicle);
    updatePrompt();
    sound.setEngine(player.inVehicle ? player.inVehicle.speed : 0, controls.forward, !!player.inVehicle);
    if (player.dead) {
      if (mission.active) mission.onPlayerDeath(game);
      else handleDeath();
    }
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
      camera.position.x += (visualRng() - .5) * game.shake * .7;
      camera.position.y += (visualRng() - .5) * game.shake * .5;
      game.shake *= Math.exp(-dt * 5);
    }
    const targetY = v ? 1.6 : 1.5;
    camera.lookAt(px, targetY, pz);
    const fov = settings.fov + (v ? Math.min(13, Math.abs(v.speed) * .3) : 0);
    if (Math.abs(camera.fov - fov) > .15) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }

    sun.target.position.set(px, 0, pz);
    sun.position.set(px + sunDir.x * 190, sunDir.y * 190, pz + sunDir.z * 190);
    sun.target.updateMatrixWorld();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    retro?.resize(window.innerWidth, window.innerHeight);
  });

  // --- main loop --------------------------------------------------------------
  window.__ready = false;
  let last = performance.now();
  let elapsed = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let shotFrames = 0;
  const SHOT_FRAMES = 100;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    // In shot mode advance a fixed 60 Hz step and freeze after SHOT_FRAMES,
    // so a capture depends on the seed alone, never on wall-clock jitter or on
    // how long the screenshot tool waits before grabbing the frame.
    const dt = shot ? 1 / 60 : Math.min(.05, Math.max(.001, (now - last) / 1000));
    last = now;
    const active = !shot || shotFrames < SHOT_FRAMES;
    if (active) {
      if (shot) { shotFrames++; game.shotFrames = shotFrames; }
      elapsed += dt;
      if (shot) shot.update(dt, elapsed);
      handleActions();
      if (game.mode === 'playing') {
        updateGameplay(dt, elapsed);
      } else if (game.mode === 'title') {
        city.update(dt);
        traffic.update(dt, [], city.colliders);
        peds.update(dt);
        weather.update(dt, { x: 0, z: 0 });
      }
      updateCamera(dt);
      combat.update(dt);
      if (!game.hud.root.classList.contains('hidden')) hud.update(game);
    }
    if (retro) retro.render(); else renderer.render(scene, camera);
    if (!window.__ready) window.__ready = true;

    // Adaptive pixel ratio: shed resolution when frames are slow, restore it
    // when there is headroom. Shots stay fixed so captures are reproducible.
    if (!shot && game.mode === 'playing') {
      fpsAccum += dt; fpsFrames++;
      if (fpsAccum > 1.6) {
        const fps = fpsFrames / fpsAccum;
        if (fps < 45) adaptiveScale = Math.max(.6, adaptiveScale - .08);
        else if (fps > 57) adaptiveScale = Math.min(1, adaptiveScale + .05);
        renderer.setPixelRatio(useRetro ? 1 : Math.min(window.devicePixelRatio || 1, 1.35));
        fpsAccum = 0; fpsFrames = 0;
      }
    }
    input.endFrame();
  });
}

try {
  boot();
} catch (err) {
  showWebGLFallback(err);
}
