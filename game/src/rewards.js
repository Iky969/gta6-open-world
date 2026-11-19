// Pure mission-reward helpers, shared by the live game and the Node unit tests.
// Keeping the idempotence rule here means a reward can only ever be paid once
// per mission id, no matter how many times a result screen is dismissed.

export function canAward(completed, id) {
  return Array.isArray(completed) && typeof id === 'string' && !completed.includes(id);
}

export function applyReward(state, id, reward) {
  if (!canAward(state.completed, id)) {
    return { paid: false, completed: state.completed.slice() };
  }
  const completed = state.completed.slice();
  completed.push(id);
  state.completed = completed;
  state.cash += Number.isFinite(reward) ? Math.max(0, reward) : 0;
  state.respect += 1;
  return { paid: true, completed };
}

export function nextMissionIndex(index, total) {
  return index + 1 < total ? index + 1 : -1;
}
