// Title screen, pause modal and mission-result modal. All UI is plain DOM so it
// stays crisp at any resolution and needs no downloaded font or image.
export class Menus {
  constructor(handlers) {
    this.handlers = handlers;
    this.title = document.getElementById('title');
    this.pause = document.getElementById('pause');
    this.result = document.getElementById('result');
    this.controlsCard = document.getElementById('controlsCard');
    this.continueBtn = document.getElementById('btnContinue');
    this.resultBtn = document.getElementById('btnResult');
    this.resultKicker = document.getElementById('resultKicker');
    this.resultTitle = document.getElementById('resultTitle');
    this.resultBody = document.getElementById('resultBody');
    this.resultReward = document.getElementById('resultReward');
    this.onResult = null;

    document.getElementById('btnNew').addEventListener('click', () => handlers.onNew());
    this.continueBtn.addEventListener('click', () => handlers.onContinue());
    document.getElementById('btnControls').addEventListener('click', () => {
      this.controlsCard.classList.toggle('hidden');
      handlers.onSound();
    });
    document.getElementById('btnResume').addEventListener('click', () => handlers.onResume());
    document.getElementById('btnSave').addEventListener('click', () => handlers.onSave());
    document.getElementById('btnRestart').addEventListener('click', () => handlers.onRestart());
    document.getElementById('btnQuit').addEventListener('click', () => handlers.onQuit());
    this.resultBtn.addEventListener('click', () => { if (this.onResult) this.onResult(); });
  }

  showTitle(hasSave) {
    this.title.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.result.classList.add('hidden');
    this.continueBtn.disabled = !hasSave;
    this.controlsCard.classList.add('hidden');
  }

  hideTitle() { this.title.classList.add('hidden'); }

  showPause() { this.pause.classList.remove('hidden'); }
  hidePause() { this.pause.classList.add('hidden'); }

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
