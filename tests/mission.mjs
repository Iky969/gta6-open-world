// Headless mission tests: drive the real MissionSystem, Vehicle, Player and
// save.js through finish -> save -> continue, convoy escort, hot-wheels fail
// states and the timed last-call run. Node standard library only; the bare
// 'three' import is mapped to the vendored build by three-resolver.mjs.
// Run with `node tests/mission.mjs`.
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./three-resolver.mjs', import.meta.url));

const THREE = await import('three');
const { MissionSystem } = await import('../game/src/mission.js');
const { Vehicle } = await import('../game/src/vehicles.js');
const { Player } = await import('../game/src/player.js');
const { VEHICLE_TYPES, MISSIONS, JOBS } = await import('../game/src/config.js');
const { makeStreams } = await import('../game/src/rng.js');
const { saveGame, loadGame } = await import('../game/src/save.js');

const ALL_JOBS = MISSIONS.concat(JOBS);
const DT = 1 / 60;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// A game shell with the real scene/player/mission/save pieces and stubs for
// the browser-only systems (HUD, sound, police, menus). showResult records the
// result screen instead of drawing it; pressing the button is r.onResult().
function makeGame(store) {
  const scene = new THREE.Scene();
  const sound = { mission() {}, pickup() {}, busted() {}, ui() {} };
  const mission = new MissionSystem(scene, sound);
  const player = new Player(scene, makeStreams(1337).visual);
  player.weapon = 0;
  const game = {
    scene, player, mission, sound,
    city: { colliders: [] },
    police: {
      clearAll() {},
      spawnAmbush() {},
      spawnCar() { return null; },
      spawnOfficer() { return { dead: false, retreat: 0, entity: { down: false, dead: false, removeFrom() {} } }; },
    },
    peds: { alert() {} },
    wanted: { level: 0, setLevel(l) { this.level = l; }, commit() {} },
    hud: { toast() {} },
    input: null,
    mode: 'playing',
    lastStolenName: '',
    results: [],
    showResult(kicker, title, body, reward, buttonLabel, danger = false, onResult = null) {
      this.mode = 'result';
      this.results.push({ kicker, title, body, reward, buttonLabel, danger, onResult });
    },
    save() {
      saveGame({
        player: this.player, cash: this.player.cash, respect: this.player.respect,
        weapon: this.player.weapon ?? 0, ammo: this.player.ammo,
        missionIndex: this.mission.index, missionStep: this.mission.step,
        completed: this.mission.completed, wanted: this.wanted.level,
        safehouse: true,
      }, store);
    },
  };
  mission.attach(game);
  return game;
}

// Continue from the save exactly like main.js continueGame(): fresh systems,
// restored player state, mission.setProgress from the saved index/step.
function continueGame(store) {
  const data = loadGame(store);
  assert.ok(data, 'a save must exist to continue');
  const game = makeGame(store);
  const p = game.player;
  p.x = data.x; p.z = data.z;
  p.health = data.health; p.armor = data.armor;
  p.cash = data.cash; p.respect = data.respect;
  p.weapon = data.weapon || 0; p.ammo = data.ammo;
  p.mesh.position.set(p.x, 0, p.z);
  game.wanted.setLevel(data.wanted || 0);
  game.mission.setProgress(data.missionIndex, data.missionStep, data.completed);
  game.mode = 'playing';
  return game;
}

function pressResult(game) {
  const r = game.results.at(-1);
  assert.ok(r, 'a result screen must be open to press its button');
  r.onResult();
}

// Jump the active mission to its final 'complete' step and let update() finish it.
function completeCurrent(game) {
  const m = game.mission;
  assert.ok(m.active && m.mission, 'a mission must be active to complete it');
  m.step = m.mission.steps.length - 1;
  m.update(DT, game);
}

function spawnCar(game, name, x, z) {
  const def = VEHICLE_TYPES.find((d) => d.name === name);
  const v = new Vehicle(def, 0xd7523f, x, z, 0);
  v.onDestroyed = () => game.mission.onVehicleDestroyed(v, game);
  game.scene.add(v.mesh);
  return v;
}

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('convoy van survives the pickup and the job completes', () => {
  const game = makeGame(memoryStorage());
  const m = game.mission;
  m.start(MISSIONS.length + 1); // CONVOY
  assert.equal(m.currentStep.type, 'escortPickup');
  const van = m.escortVehicle;
  assert.ok(van, 'the van must be spawned at the pickup step');
  assert.equal(van.def.name, 'SOL VAN');

  // Reach the pickup point; advance() into the escort step must keep the van.
  game.player.x = -176; game.player.z = 8;
  m.update(DT, game);
  assert.equal(m.currentStep.type, 'escort');
  assert.ok(m.escortVehicle === van, 'advance() must not delete the convoy van');
  assert.ok(game.scene.children.includes(van.mesh), 'van mesh must stay in the scene');

  // Lead it down the road for a few seconds: the van actually follows.
  const car = spawnCar(game, 'CIVIC SUN', -176, 16);
  game.player.enterVehicle(car);
  for (let f = 0; f < 180; f++) {
    car.update(DT, { throttle: 1, steer: 0 }, []);
    m.update(DT, game);
  }
  assert.ok(van.z > 20, `van must follow the player forward (van.z=${van.z.toFixed(1)})`);
  assert.ok(van.z < car.z, 'van must trail the player');
  assert.ok(car.z - van.z < 60, 'van must keep reasonably close');

  // Arrive at the harbor together; the escort step hands off to complete.
  car.x = 176; car.z = -176; car.speed = 0;
  van.x = 176; van.z = -170; van.speed = 0;
  m.update(DT, game);
  assert.equal(m.currentStep.type, 'complete');
  m.update(DT, game);
  assert.equal(game.results.at(-1).title, 'MISSION COMPLETE');
  assert.equal(game.player.cash, 3600);
  assert.ok(m.completed.includes('convoy'));
});

test('escort follow uses the vehicle heading, not player.yaw', () => {
  const game = makeGame(memoryStorage());
  const m = game.mission;
  m.start(MISSIONS.length + 1);
  game.player.x = -176; game.player.z = 8;
  m.update(DT, game); // -> escort
  const van = m.escortVehicle;
  assert.ok(van);

  // Car faces +x (heading pi/2); the stale on-foot yaw still points +z.
  const car = spawnCar(game, 'CIVIC SUN', -100, 0);
  car.heading = Math.PI / 2;
  game.player.enterVehicle(car);
  game.player.yaw = 0;

  // Van parked exactly 8 m behind the car along its heading: it must hold station.
  van.x = car.x - 8; van.z = car.z; van.heading = Math.PI / 2; van.speed = 0;
  for (let f = 0; f < 60; f++) m.update(DT, game);
  assert.ok(Math.hypot(van.x - (car.x - 8), van.z - car.z) < .1,
    `van must hold station behind the vehicle heading (moved to ${van.x.toFixed(2)}, ${van.z.toFixed(2)})`);

  // A van left far away drives toward the heading-based follow point.
  van.x = car.x; van.z = car.z + 25; van.speed = 0;
  for (let f = 0; f < 240; f++) m.update(DT, game);
  const dist = Math.hypot(van.x - (car.x - 8), van.z - car.z);
  assert.ok(dist < 20, `van must close on the follow point (dist=${dist.toFixed(1)})`);
});

test('hot wheels fails only when a VULCAN GT is destroyed', () => {
  const game = makeGame(memoryStorage());
  const m = game.mission;
  m.start(1); // HOT WHEELS, step 0: stealVehicle
  assert.equal(m.currentStep.type, 'stealVehicle');

  // The sedan stolen on the way to the Vulcan must not fail the job.
  const sedan = spawnCar(game, 'CIVIC SUN', -80, 80);
  sedan.damage(999);
  assert.equal(m.active, true, 'destroying a non-Vulcan must not fail HOT WHEELS');
  assert.equal(game.results.length, 0);

  // Stealing the Vulcan advances the step; wrecking it then fails the job.
  const vulcan = spawnCar(game, 'VULCAN GT', -88, 88);
  game.player.enterVehicle(vulcan);
  m.update(DT, game);
  assert.equal(m.currentStep.type, 'goto');
  vulcan.damage(999);
  assert.equal(m.active, false);
  assert.equal(game.results.at(-1).title, 'CAR DESTROYED');

  // Retry restores the checkpoint step; another sedan dies, job stays alive.
  pressResult(game);
  assert.equal(m.active, true);
  assert.equal(m.step, 1);
  const sedan2 = spawnCar(game, 'CASA 4', -60, 60);
  sedan2.damage(999);
  assert.equal(m.active, true, 'a destroyed sedan must not fail the delivery step either');
  assert.equal(game.results.length, 1);

  // A Vulcan wrecked before it is stolen still fails the steal step.
  const game2 = makeGame(memoryStorage());
  game2.mission.start(1);
  const vulcan2 = spawnCar(game2, 'VULCAN GT', 0, 0);
  vulcan2.damage(999);
  assert.equal(game2.mission.active, false);
  assert.equal(game2.results.at(-1).title, 'CAR DESTROYED');
});

test('finish pays once; a replay shows ALREADY COMPLETED without paying', () => {
  const game = makeGame(memoryStorage());
  const m = game.mission;
  m.start(0); // COLD DELIVERY
  completeCurrent(game);
  let r = game.results.at(-1);
  assert.equal(r.title, 'MISSION COMPLETE');
  assert.ok(r.reward.includes('2,500'), 'first clear shows the reward');
  assert.equal(game.player.cash, 2500);
  assert.equal(game.player.respect, 1);
  pressResult(game);

  // Replay the same job: no second payout, no "+$2,500" promise.
  m.start(0);
  completeCurrent(game);
  r = game.results.at(-1);
  assert.equal(r.title, 'ALREADY COMPLETED');
  assert.ok(!r.reward.includes('2,500'), 'replay must not advertise the reward again');
  assert.ok(!r.reward.includes('+'), 'replay must not show a payout');
  assert.equal(game.player.cash, 2500, 'replay must not pay twice');
  assert.equal(game.player.respect, 1);
});

test('finish -> save -> continue x3 keeps progress and pays each reward once', () => {
  const store = memoryStorage();
  let game = makeGame(store);
  game.mission.start(0);
  const rewards = [2500, 1800, 3200]; // COLD DELIVERY, HOT WHEELS, SHADOW RUN
  let cash = 0;
  const ids = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    const m = game.mission;
    const id = m.mission.id;
    completeCurrent(game);
    cash += rewards[cycle];
    ids.push(id);
    const r = game.results.at(-1);
    assert.equal(r.title, 'MISSION COMPLETE', `cycle ${cycle}: ${id}`);
    assert.equal(game.player.cash, cash, `cycle ${cycle}: reward paid exactly once`);
    assert.equal(game.player.respect, cycle + 1);
    pressResult(game); // afterResult() + game.save(), like the real button
    assert.equal(game.mode, 'playing');

    // Continue into fresh systems from the save.
    game = continueGame(store);
    const data = loadGame(store);
    assert.deepEqual(data.completed, ids);
    assert.equal(data.cash, cash);
    assert.equal(game.mission.index, cycle + 1, 'continue lands on the next job');
    assert.equal(game.mission.step, 0);
    for (let f = 0; f < 10; f++) game.mission.update(DT, game);
    assert.equal(game.results.length, 0, 'continue must not re-open a result screen');
    assert.equal(game.player.cash, cash, 'continue must not pay again');
  }
  assert.equal(game.player.cash, 7500);
});

test('continue after the last job does not re-trigger the complete step', () => {
  const store = memoryStorage();
  const game = makeGame(store);
  game.mission.start(0);
  let cash = 0;
  for (let i = 0; i < ALL_JOBS.length; i++) {
    cash += game.mission.mission.steps.at(-1).reward;
    completeCurrent(game);
    pressResult(game);
  }
  assert.equal(game.player.cash, 18100);
  assert.equal(game.mission.completed.length, ALL_JOBS.length);
  const data = loadGame(store);
  assert.equal(data.missionIndex, ALL_JOBS.length - 1);
  assert.equal(data.missionStep, game.mission.mission.steps.length - 1); // saved on 'complete'

  // Loading that save must not fire finish() again.
  const cont = continueGame(store);
  for (let f = 0; f < 10; f++) cont.mission.update(DT, cont);
  assert.equal(cont.results.length, 0, 'no result screen on load');
  assert.equal(cont.player.cash, 18100, 'no phantom payout on load');
  assert.equal(cont.mission.active, false, 'the finished job must not stay active');

  // Oro still offers a replay, and it is clearly marked as already paid.
  cont.mission.startNextAvailable();
  assert.equal(cont.mission.index, 0);
  completeCurrent(cont);
  assert.equal(cont.results.at(-1).title, 'ALREADY COMPLETED');
  assert.equal(cont.player.cash, 18100);
});

test('last call provides a car and starts the clock from a fixed spot', () => {
  const game = makeGame(memoryStorage());
  const m = game.mission;
  m.start(MISSIONS.length + 2); // LAST CALL
  assert.equal(m.currentStep.type, 'timedGoto');
  assert.equal(m.timeLeft, 52);
  assert.ok(game.player.inVehicle, 'a car must be provided for the timed run');
  const start = { x: game.player.x, z: game.player.z };
  assert.ok(Number.isInteger(start.x / 88) && Number.isInteger(start.z / 88),
    'the run must start on a road intersection');

  // The start spot is the same wherever the previous job ended.
  const game2 = makeGame(memoryStorage());
  game2.player.x = 200; game2.player.z = -200;
  game2.mission.start(MISSIONS.length + 2);
  assert.equal(game2.player.x, start.x);
  assert.equal(game2.player.z, start.z);
  assert.ok(game2.player.inVehicle);

  // Without driving, the 52 s window closes and the job fails cleanly.
  for (let f = 0; f < 53 * 60; f++) {
    m.update(DT, game);
    if (!m.active) break;
  }
  assert.equal(m.active, false);
  assert.equal(game.results.at(-1).title, 'TIME UP');

  // Retry re-provides the car and resets the clock.
  pressResult(game);
  assert.equal(m.active, true);
  assert.equal(m.timeLeft, 52);
  assert.ok(game.player.inVehicle, 'retry must provide a car again');
});

console.log(`mission: ${passed} tests passed`);