// Node-only unit tests for the audit's correctness fixes. Run with `node tests/unit.mjs`.
import assert from 'node:assert/strict';
import {
  SAVE_VERSION, validateSaveData, migrateSaveData, saveGame, loadGame, clearSave, hasSave,
} from '../game/src/save.js';
import { canAward, applyReward, nextMissionIndex } from '../game/src/rewards.js';
import { validateSettings } from '../game/src/settings.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('save v2 validates finite numbers and clamps out-of-range values', () => {
  const data = validateSaveData({
    x: NaN, z: '12', health: 45, cash: Infinity, respect: -4,
    wanted: 99, missionIndex: 3.7, completed: ['a', 4, null],
  });
  assert.equal(data.version, SAVE_VERSION);
  assert.equal(data.x, -88);           // NaN -> default
  assert.equal(data.z, 88);            // non-number -> default
  assert.equal(data.health, 45);
  assert.equal(data.cash, 0);          // Infinity -> default
  assert.equal(data.respect, 0);
  assert.equal(data.wanted, 5);
  assert.equal(data.missionIndex, 3);
  assert.deepEqual(data.completed, ['a']);
});

test('v1 save migrates to v2 with safe defaults', () => {
  const migrated = migrateSaveData({ version: 1, x: 10, z: 20, cash: 500, completed: ['cold-delivery'] });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.x, 10);
  assert.equal(migrated.cash, 500);
  assert.equal(migrated.weapon, 0);
  assert.equal(migrated.ammo, 12);
  assert.deepEqual(migrated.completed, ['cold-delivery']);
  assert.equal(migrateSaveData({ version: 99 }), null);
});

test('save/continue round-trips and legacy key is upgraded', () => {
  const store = memoryStorage();
  const state = {
    player: { x: 12, z: -7, health: 80, armor: 20 },
    cash: 1234, respect: 3, weapon: 1, ammo: 21,
    missionIndex: 2, missionStep: 1, completed: ['cold-delivery'], wanted: 4,
  };
  assert.equal(saveGame(state, store), true);
  let loaded = loadGame(store);
  assert.equal(loaded.cash, 1234);
  assert.equal(loaded.weapon, 1);
  assert.equal(loaded.ammo, 21);
  assert.equal(loaded.wanted, 4);
  assert.equal(hasSave(store), true);

  // Simulate an old v1 record: load migrates it and removes the old key.
  store.removeItem('vesper-bay-save-v2');
  store.setItem('vesper-bay-save-v1', JSON.stringify({ version: 1, x: 5, z: 6, health: 90, armor: 0, cash: 99, respect: 0, missionIndex: 0, missionStep: 0, completed: [], wanted: 0 }));
  loaded = loadGame(store);
  assert.equal(loaded.version, 2);
  assert.equal(store.getItem('vesper-bay-save-v1'), null);
  clearSave(store);
  assert.equal(hasSave(store), false);
});

test('Save -> Continue x3 keeps progress and never duplicates rewards', () => {
  const store = memoryStorage();
  const completed = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    const state = {
      player: { x: 10 + cycle, z: 20, health: 90, armor: 0 },
      cash: 1000 * cycle, respect: cycle,
      weapon: cycle % 2, ammo: 12,
      missionIndex: cycle, missionStep: 1, completed: completed.slice(), wanted: 0,
    };
    saveGame(state, store);
    const data = loadGame(store);
    assert.equal(data.cash, 1000 * cycle);
    assert.equal(data.missionIndex, cycle);
    assert.equal(data.weapon, cycle % 2);
    // A completed id carried through each continue stays in the save.
    assert.deepEqual(data.completed, completed);
    completed.push(`job-${cycle}`);
  }
  assert.equal(loadGame(store).missionIndex, 2);
});

test('rewards are idempotent per mission id', () => {
  const state = { completed: [], cash: 0, respect: 0 };
  assert.equal(canAward(state.completed, 'cold-delivery'), true);
  let r = applyReward(state, 'cold-delivery', 2500);
  assert.equal(r.paid, true);
  assert.equal(state.cash, 2500);
  assert.equal(state.respect, 1);
  r = applyReward(state, 'cold-delivery', 2500);
  assert.equal(r.paid, false);
  assert.equal(state.cash, 2500, 'second payout must not double cash');
  assert.equal(state.respect, 1);
  applyReward(state, 'hot-wheels', 1800);
  assert.equal(state.cash, 4300);
});

test('next mission index terminates at the end', () => {
  assert.equal(nextMissionIndex(0, 6), 1);
  assert.equal(nextMissionIndex(5, 6), -1);
});

test('settings clamp invalid values and bind keys', () => {
  const s = validateSettings({ volume: 9, sensitivity: -2, fov: 400, quality: 'ultra', bindings: { interact: 'KeyT' } });
  assert.equal(s.volume, 1);
  assert.equal(s.sensitivity, .25);
  assert.equal(s.fov, 90);
  assert.equal(s.quality, 'high');
  assert.equal(s.bindings.interact, 'KeyT');
  assert.equal(s.bindings.enter, 'KeyF');
});

console.log(`unit: ${passed} tests passed`);
