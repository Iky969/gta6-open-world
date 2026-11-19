// Player settings: audio volume, look sensitivity, field of view, render
// quality, radio preference and rebindable keys. Stored separately from the
// save so changing an option never invalidates a story save.

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', interact: 'KeyE', enter: 'KeyF', reload: 'KeyR',
  weapon: 'Digit2', radio: 'KeyQ', mute: 'KeyM', weather: 'KeyN',
  mapIn: 'KeyZ', mapOut: 'KeyX', pause: 'Escape', handbrake: 'Space',
};

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  sensitivity: 1.0,
  fov: 62,
  quality: 'high',
  station: 0,
  bindings: { ...DEFAULT_BINDINGS },
};

const KEY = 'vesper-bay-settings-v1';
const clamp = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

export function validateSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } };
  const bindings = { ...DEFAULT_BINDINGS };
  if (raw.bindings && typeof raw.bindings === 'object') {
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
      if (typeof raw.bindings[action] === 'string' && raw.bindings[action].length < 24) {
        bindings[action] = raw.bindings[action];
      }
    }
  }
  return {
    volume: clamp(raw.volume, 0, 1, DEFAULT_SETTINGS.volume),
    sensitivity: clamp(raw.sensitivity, 0.25, 3, DEFAULT_SETTINGS.sensitivity),
    fov: clamp(raw.fov, 50, 90, DEFAULT_SETTINGS.fov),
    quality: ['low', 'medium', 'high'].includes(raw.quality) ? raw.quality : 'high',
    station: Math.floor(clamp(raw.station, 0, 3, 0)),
    bindings,
  };
}

export function loadSettings(storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    const raw = s?.getItem(KEY);
    return validateSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return validateSettings(null);
  }
}

export function saveSettings(settings, storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    s?.setItem(KEY, JSON.stringify(validateSettings(settings)));
  } catch { /* storage may be disabled */ }
}
