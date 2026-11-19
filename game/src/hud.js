// DOM HUD plus a live 2D minimap. The minimap reads directly from game state
// (roads are on a fixed 88 m grid) so it needs no additional 3D render. It now
// draws a route line to the objective, supports zoom, shows the radio station
// and weapon, and flashes a cue whenever an audio event fires.
import { CITY } from './config.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.stars = document.getElementById('wantedStars');
    this.wantedLabel = document.getElementById('wantedLabel');
    this.healthFill = document.getElementById('healthFill');
    this.healthText = document.getElementById('healthText');
    this.armorFill = document.getElementById('armorFill');
    this.armorText = document.getElementById('armorText');
    this.cash = document.getElementById('cashText');
    this.respect = document.getElementById('respectText');
    this.missionTitle = document.getElementById('missionTitle');
    this.missionObjective = document.getElementById('missionObjective');
    this.missionDistance = document.getElementById('missionDistance');
    this.vehicleName = document.getElementById('vehicleName');
    this.speed = document.getElementById('speedText');
    this.gear = document.getElementById('gearText');
    this.ammo = document.getElementById('ammoText');
    this.radio = document.getElementById('radioText');
    this.prompt = document.getElementById('promptText');
    this.toasts = document.getElementById('toasts');
    this.cue = document.getElementById('audioCue');
    this.tint = document.getElementById('weatherTint');
    this.map = document.getElementById('minimap');
    this.ctx = this.map.getContext('2d');
    this.zoom = 1;
    this.show(true);
    window.addEventListener('vesper-sfx', (e) => this.audioCue(e.detail));
  }

  show(visible) { this.root.classList.toggle('hidden', !visible); }
  mapZoom(direction) { this.zoom = Math.max(.65, Math.min(2.2, this.zoom + direction * .2)); }

  audioCue(name) {
    if (!this.cue) return;
    const color = name === 'hit' || name === 'enemy' ? 'var(--red)'
      : name === 'pickup' || name === 'mission' ? 'var(--teal)' : 'var(--gold)';
    this.cue.style.boxShadow = `0 0 18px 5px ${color}`;
    this.cue.classList.add('flash');
    clearTimeout(this._cueTimer);
    this._cueTimer = setTimeout(() => {
      this.cue.classList.remove('flash');
      this.cue.style.boxShadow = '';
    }, 170);
  }

  setWeather(rain, darkness) {
    if (this.tint) this.tint.style.opacity = String(Math.min(.42, rain * .34 + darkness * .12));
  }

  toast(text) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.toasts.appendChild(div);
    while (this.toasts.children.length > 3) this.toasts.removeChild(this.toasts.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 4200);
  }

  update(game) {
    const p = game.player;
    const wanted = game.wanted.level;
    this.stars.innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < wanted ? 'on' : ''}">${i < wanted ? '★' : '☆'}</span>`).join('');
    this.wantedLabel.textContent = wanted === 0 ? 'CLEAN' : wanted >= 4 ? 'LETHAL' : 'WANTED';
    this.wantedLabel.style.color = wanted >= 4 ? '#ff6b57' : '#f7c873';
    this.healthFill.style.width = `${Math.max(0, p.health)}%`;
    this.armorFill.style.width = `${Math.max(0, p.armor)}%`;
    this.healthText.textContent = Math.ceil(p.health);
    this.armorText.textContent = Math.ceil(p.armor);
    this.cash.textContent = `$${p.cash.toLocaleString()}`;
    this.respect.textContent = `RESPECT ${p.respect}`;

    this.missionTitle.textContent = game.mission.title;
    this.missionObjective.textContent = game.mission.objective;
    const target = game.mission.getTarget();
    const px = p.inVehicle ? p.inVehicle.x : p.x;
    const pz = p.inVehicle ? p.inVehicle.z : p.z;
    if (target) {
      const d = Math.hypot(px - target.x, pz - target.z);
      const timer = game.mission.timeLeft > 0 ? ` · ${Math.ceil(game.mission.timeLeft)}s` : '';
      this.missionDistance.textContent = `▸ ${Math.round(d)} m TO DROP${timer}`;
    } else {
      this.missionDistance.textContent = '▸ FREE ROAM';
    }

    const v = p.inVehicle;
    this.vehicleName.textContent = v ? v.def.name : 'ON FOOT';
    this.speed.textContent = v ? Math.round(Math.abs(v.speed) * 2.237) : 0;
    this.gear.textContent = v ? (v.speed < -.4 ? 'R' : v.speed > .4 ? 'D' : 'N') : '·';
    const weapon = game.weapons?.[p.weapon] || { name: 'PISTOL', ammo: p.ammoMax };
    this.ammo.textContent = v ? (v.isPolice ? 'POLICE CRUISER' : 'VEHICLE') :
      (p.reloadTimer > 0 ? 'RELOADING…' : `${weapon.name} · ${p.ammo}/${weapon.ammo}`);
    if (this.radio) {
      this.radio.textContent = game.sound.muted ? 'RADIO OFF' :
        (v ? game.sound.stationName : 'RADIO · DRIVE TO LISTEN');
    }
    this.prompt.textContent = game.prompt || '';
    this.drawMap(game);
  }

  drawMap(game) {
    const ctx = this.ctx;
    const size = this.map.width;
    const mid = size / 2;
    const scale = (mid / 122) * this.zoom;
    const p = game.player;
    const px = p.inVehicle ? p.inVehicle.x : p.x;
    const pz = p.inVehicle ? p.inVehicle.z : p.z;
    const heading = p.inVehicle ? p.inVehicle.heading : p.yaw;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#102a36';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.clip();

    ctx.fillStyle = 'rgba(56,156,168,.5)';
    ctx.fillRect(mid + (CITY.oceanX - px) * scale - 3, 0, size, size);
    ctx.fillStyle = 'rgba(216,190,142,.35)';
    for (let k = -5; k <= 5; k++) {
      const z = k * CITY.spacing;
      const sy = mid + (z - pz) * scale;
      ctx.fillRect(mid + (CITY.limit - 24 - px) * scale, sy - 8 * scale, (CITY.oceanX - CITY.limit + 24) * scale, 16 * scale);
    }

    ctx.fillStyle = 'rgba(126,145,151,.42)';
    for (const c of game.city.colliders) {
      const x = mid + (c.x - px) * scale;
      const y = mid + (c.z - pz) * scale;
      const w = c.hw * 2 * scale, h = c.hd * 2 * scale;
      if (x + w < 0 || x - w > size || y + h < 0 || y - h > size) continue;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    }

    const bx = Math.round(px / CITY.spacing) * CITY.spacing;
    const bz = Math.round(pz / CITY.spacing) * CITY.spacing;
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(39,48,57,.95)';
    for (let k = -4; k <= 4; k++) {
      const x = mid + (bx + k * CITY.spacing - px) * scale;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      const y = mid + (bz + k * CITY.spacing - pz) * scale;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(247,200,115,.35)';
    ctx.setLineDash([5, 7]);
    for (let k = -4; k <= 4; k++) {
      const x = mid + (bx + k * CITY.spacing - px) * scale;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      const y = mid + (bz + k * CITY.spacing - pz) * scale;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Route line: a dashed bearing from the player to the current objective,
    // clipped to the map edge when the target is far away.
    const target = game.mission.getTarget();
    if (target && game.mission.active) {
      let tx = mid + (target.x - px) * scale;
      let ty = mid + (target.z - pz) * scale;
      const dx = tx - mid, dy = ty - mid;
      const len = Math.hypot(dx, dy) || 1;
      if (len > mid - 10) { const f = (mid - 10) / len; tx = mid + dx * f; ty = mid + dy * f; }
      ctx.strokeStyle = 'rgba(92,224,208,.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(mid, mid); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#5ce0d0';
      ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = 'rgba(235,240,240,.8)';
    for (const v of game.traffic.vehicles) {
      const x = mid + (v.x - px) * scale, y = mid + (v.z - pz) * scale;
      if (x < 0 || x > size || y < 0 || y > size) continue;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const u of game.police.units) {
      const e = u.entity;
      const x = mid + (e.x - px) * scale, y = mid + (e.z - pz) * scale;
      if (x < 0 || x > size || y < 0 || y > size) continue;
      ctx.fillStyle = u.faction === 'rival' ? '#ff8a4a' : '#5aa9ff';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (game.pickups) {
      for (const item of game.pickups) {
        if (!item.active) continue;
        const x = mid + (item.x - px) * scale, y = mid + (item.z - pz) * scale;
        if (x < 0 || x > size || y < 0 || y > size) continue;
        ctx.fillStyle = item.type === 'health' ? '#69e0a0' : item.type === 'armor' ? '#6cb8ff' : '#ffd27a';
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
    }
    if (target) {
      const x = mid + (target.x - px) * scale, y = mid + (target.z - pz) * scale;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd77e'; ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(mid, mid);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b1c26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(247,200,115,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f7c873';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', mid, 14);
    ctx.fillText(`${Math.round(this.zoom * 100)}%`, mid, size - 6);
  }
}
