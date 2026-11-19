// Local save game. Plain JSON in localStorage keeps the game fully offline.
// v2 adds a validated schema, a migration from v1, and an injectable storage so
// the same code can be unit-tested in Node without a browser.

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'vesper-bay-save-v2';
const LEGACY_KEYS = ['vesper-bay-save-v1'];

const num = (value, fallback, low, high) =>
  Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;

// Validate every numeric field. A hand-edited or half-written save must never
// poison the simulation with NaN or Infinity (the audit's Number.isFinite fix).
export function validateSaveData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const completed = Array.isArray(raw.completed)
    ? raw.completed.filter((id) => typeof id === 'string') : [];
  return {
    version: SAVE_VERSION,
    savedAt: num(raw.savedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    x: num(raw.x, -88, -400, 400),
    z: num(raw.z, 88, -400, 400),
    health: num(raw.health, 100, 0, 100),
    armor: num(raw.armor, 0, 0, 100),
    cash: num(raw.cash, 0, 0, 10_000_000),
    respect: num(raw.respect, 0, 0, 100_000),
    weapon: Number.isInteger(raw.weapon) ? Math.max(0, Math.min(2, raw.weapon)) : 0,
    ammo: num(raw.ammo, 12, 0, 999),
    missionIndex: Math.floor(num(raw.missionIndex, 0, 0, 1000)),
    missionStep: Math.floor(num(raw.missionStep, 0, 0, 1000)),
    completed,
    wanted: Math.floor(num(raw.wanted, 0, 0, 5)),
    safehouse: raw.safehouse === true,
  };
}

// v1 -> v2: only the fields that existed are carried forward; everything else
// takes a safe default. Old keys are removed once migrated.
export function migrateSaveData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version === SAVE_VERSION) return validateSaveData(raw);
  if (raw.version === 1) {
    const migrated = validateSaveData({ ...raw, version: SAVE_VERSION, weapon: 0, ammo: 12, safehouse: false });
    return migrated;
  }
  return null;
}

function storageOrNull(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function hasSave(storage) {
  const s = storageOrNull(storage);
  if (!s) return false;
  try { return !!s.getItem(SAVE_KEY) || LEGACY_KEYS.some((k) => !!s.getItem(k)); } catch { return false; }
}

export function saveGame(state, storage) {
  const s = storageOrNull(storage);
  if (!s) return false;
  const data = validateSaveData({
    version: SAVE_VERSION,
    savedAt: Date.now(),
    x: state.player.x, z: state.player.z,
    health: state.player.health, armor: state.player.armor,
    cash: state.cash, respect: state.respect,
    weapon: state.weapon ?? 0, ammo: state.ammo ?? state.player.ammo,
    missionIndex: state.missionIndex, missionStep: state.missionStep,
    completed: state.completed, wanted: state.wanted,
    safehouse: state.safehouse ?? false,
  });
  if (!data) return false;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage) {
  const s = storageOrNull(storage);
  if (!s) return null;
  try {
    let raw = s.getItem(SAVE_KEY);
    let legacy = false;
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = s.getItem(key);
        if (raw) { legacy = true; break; }
      }
    }
    if (!raw) return null;
    const data = migrateSaveData(JSON.parse(raw));
    if (!data) return null;
    if (legacy) {
      s.setItem(SAVE_KEY, JSON.stringify(data));
      for (const key of LEGACY_KEYS) s.removeItem(key);
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSave(storage) {
  const s = storageOrNull(storage);
  if (!s) return;
  try {
    s.removeItem(SAVE_KEY);
    for (const key of LEGACY_KEYS) s.removeItem(key);
  } catch { /* storage may be disabled */ }
}
