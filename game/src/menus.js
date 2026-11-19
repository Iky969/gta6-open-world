// Title screen, pause modal, settings modal and mission-result modal. All UI is
// plain DOM so it stays crisp at any resolution and needs no downloaded font.
// Destructive actions (New Game, Restart Story) ask for confirmation first.
export class Menus {
  constructor(handlers) {
    this.handlers = handlers;
    this.title = document.getElementById('title');
    this.pause = document.getElementById('pause');
    this.result = document.getElementById('result');
    this.confirmBox = document.getElementById('confirm');
    this.settings = document.getElementById('settings');
    this.controlsCard = document.getElementById('controlsCard');
    this.continueBtn = document.getElementById('btnContinue');
    this.resultBtn = document.getElementById('btnResult');
    this.resultKicker = document.getElementById('resultKicker');
    this.resultTitle = document.getElementById('resultTitle');
    this.resultBody = document.getElementById('resultBody');
    this.resultReward = document.getElementById('resultReward');
    this.confirmText = document.getElementById('confirmText');
    this.confirmYes = document.getElementById('confirmYes');
    this.confirmNo = document.getElementById('confirmNo');
    this.settingVolume = document.getElementById('setVolume');
    this.settingSensitivity = document.getElementById('setSensitivity');
    this.settingFov = document.getElementById('setFov');
    this.settingQuality = document.getElementById('setQuality');
    this.settingsStation = document.getElementById('setStation');
    this.onResult = null;
    this.onConfirm = null;
    this.rebinding = null;

    document.getElementById('btnNew').addEventListener('click', () =>
      this.confirm('START NEW GAME?', 'Your current save and story progress will be erased.', () => handlers.onNew()));
    this.continueBtn.addEventListener('click', () => handlers.onContinue());
    document.getElementById('btnControls').addEventListener('click', () => {
      this.controlsCard.classList.toggle('hidden');
      handlers.onSound();
    });
    document.getElementById('btnResume').addEventListener('click', () => handlers.onResume());
    document.getElementById('btnSave').addEventListener('click', () => handlers.onSave());
    document.getElementById('btnRestart').addEventListener('click', () =>
      this.confirm('RESTART STORY?', 'All jobs start over from Cold Delivery. This cannot be undone.', () => handlers.onRestart()));
    document.getElementById('btnSettings').addEventListener('click', () => this.showSettings());
    document.getElementById('btnSettingsClose').addEventListener('click', () => this.hideSettings());
    document.getElementById('btnQuit').addEventListener('click', () => handlers.onQuit());
    this.resultBtn.addEventListener('click', () => { if (this.onResult) this.onResult(); });
    this.confirmNo.addEventListener('click', () => this.hideConfirm());
    this.confirmYes.addEventListener('click', () => {
      const action = this.onConfirm;
      this.hideConfirm();
      if (action) action();
    });

    const change = () => {
      if (!handlers.onSettingsChange) return;
      handlers.onSettingsChange({
        volume: Number(this.settingVolume.value) / 100,
        sensitivity: Number(this.settingSensitivity.value) / 100,
        fov: Number(this.settingFov.value),
        quality: this.settingQuality.value,
        station: Number(this.settingsStation.value),
      });
    };
    for (const el of [this.settingVolume, this.settingSensitivity, this.settingFov, this.settingQuality, this.settingsStation]) {
      el.addEventListener('input', change);
      el.addEventListener('change', change);
    }
    for (const btn of this.settings.querySelectorAll('[data-bind]')) {
      btn.addEventListener('click', () => {
        this.rebinding = btn.dataset.bind;
        btn.textContent = 'PRESS A KEY…';
      });
    }
    window.addEventListener('keydown', (e) => {
      if (!this.rebinding) return;
      e.preventDefault();
      const action = this.rebinding;
      this.rebinding = null;
      if (handlers.onRebind) handlers.onRebind(action, e.code);
      this.refreshBindings(handlers.bindings ?? {});
    });
  }

  showTitle(hasSave) {
    this.title.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.result.classList.add('hidden');
    this.confirmBox.classList.add('hidden');
    this.settings.classList.add('hidden');
    this.continueBtn.disabled = !hasSave;
    this.controlsCard.classList.add('hidden');
  }

  hideTitle() { this.title.classList.add('hidden'); }
  showPause() { this.pause.classList.remove('hidden'); }
  hidePause() { this.pause.classList.add('hidden'); this.settings.classList.add('hidden'); }

  showSettings() {
    const s = this.handlers.settings;
    if (s) {
      this.settingVolume.value = String(Math.round(s.volume * 100));
      this.settingSensitivity.value = String(Math.round(s.sensitivity * 100));
      this.settingFov.value = String(s.fov);
      this.settingQuality.value = s.quality;
      this.settingsStation.value = String(s.station);
      this.refreshBindings(s.bindings);
    }
    this.settings.classList.remove('hidden');
  }
  hideSettings() { this.settings.classList.add('hidden'); }

  refreshBindings(bindings) {
    for (const btn of this.settings.querySelectorAll('[data-bind]')) {
      const code = bindings[btn.dataset.bind];
      btn.textContent = code ? code.replace(/^Key|^Digit/, '') : '—';
    }
  }

  confirm(title, body, onYes) {
    this.confirmText.textContent = `${title} — ${body}`;
    this.onConfirm = onYes;
    this.confirmBox.classList.remove('hidden');
    this.handlers.onSound?.();
  }
  hideConfirm() { this.confirmBox.classList.add('hidden'); this.onConfirm = null; }
  get confirmVisible() { return !this.confirmBox.classList.contains('hidden'); }

  showResult(kicker, title, body, reward, buttonLabel, danger = false, onResult = null) {
    this.resultKicker.textContent = kicker;
    this.resultTitle.textContent = title;
    this.resultBody.textContent = body;
    this.resultReward.textContent = reward;
    this.resultBtn.textContent = buttonLabel;
    this.resultKicker.classList.toggle('danger', danger);
    this.resultTitle.classList.toggle('danger', danger);
    this.onResult = onResult;
    this.result.classList.remove('hidden');
  }

  hideResult() { this.result.classList.add('hidden'); this.onResult = null; }
  get resultVisible() { return !this.result.classList.contains('hidden'); }
}
