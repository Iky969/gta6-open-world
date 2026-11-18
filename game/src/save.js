// Local save game. Everything is plain JSON in localStorage, so the game stays
// fully offline and a save survives a page reload in the same browser profile.

const KEY = 'vesper-bay-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveGame(state) {
  const data = {
    version: 1,
    savedAt: Date.now(),
    x: state.player.x,
    z: state.player.z,
    health: state.player.health,
    armor: state.player.armor,
    cash: state.cash,
    respect: state.respect,
    missionIndex: state.missionIndex,
    missionStep: state.missionStep,
    completed: state.completed,
    wanted: state.wanted,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage may be disabled */ }
}
