// Deterministic URL modes used to capture real rendered frames of the running
// simulation: ?shot=start|play|drive|wanted|end&seed=1337. Weather is pinned to
// golden hour by main.js in shot mode, and every scripted action reads the same
// virtual input path a real player uses.
import * as THREE from 'three';
import { VEHICLE_TYPES } from './config.js';
import { randRange } from './rng.js';

export function createShotController(mode, game) {
  const virtual = { keys: new Set(), pressed: new Set(), mouseDown: false, mouseClicked: false, lookX: 0, lookY: 0 };
  game.input.setVirtual(virtual);
  const shot = { mode, virtual, camera: null };

  function placeTraffic(indices, placements) {
    const cars = game.traffic.vehicles;
    placements.forEach((p, i) => {
      const v = cars[indices[i] % cars.length];
      if (!v) return;
      v.x = p[0]; v.z = p[1]; v.heading = p[2]; v.speed = p[3] ?? 12;
      v.traffic.target = { x: v.x + Math.sin(v.heading) * 120, z: v.z + Math.cos(v.heading) * 120 };
      v.sync(0);
    });
  }

  shot.setup = function setup() {
    if (mode === 'start') {
      game.mode = 'title';
      game.menus.showTitle(false);
      game.hud.show(false);
      shot.camera = {
        position: new THREE.Vector3(-178, 54, 214),
        look: new THREE.Vector3(40, 42, 44),
      };
      return;
    }
    game.beginNewGame();
    game.hud.toasts.replaceChildren(); // clean deterministic captures, no startup toasts
    game.menus.hideTitle();
    game.hud.show(true);
    game.mode = mode === 'end' ? 'result' : 'playing';

    if (mode === 'play') {
      game.player.x = -88; game.player.z = 88;
      game.camYaw = .18; game.camPitch = .11;
      placeTraffic([0, 1, 2, 3], [
        [-93, 88, Math.PI / 2, 4],
        [-88, 20, 0, 13],
        [-30, 88, Math.PI / 2, 11],
        [-150, 88, -Math.PI / 2, 12],
      ]);
      const walkers = [
        [-80, 92], [-96, 84], [-72, 104],
      ];
      walkers.forEach((p, i) => {
        const ped = game.peds.peds[i];
        if (ped) { ped.x = p[0]; ped.z = p[1]; ped.mesh.position.set(p[0], 0, p[1]); }
      });
    } else if (mode === 'drive') {
      game.giveVehicle('VULCAN GT', 88, 156, Math.PI, 0xcf4438);
      game.player.cash = 3200;
      game.player.respect = 1;
      game.mission.setProgress(0, 2, []);
      game.camYaw = Math.PI; game.camPitch = .18;
      placeTraffic([0, 1, 2, 3], [
        [88, 70, Math.PI, 16],
        [92, -20, Math.PI, 15],
        [80, -110, Math.PI, 14],
        [104, 168, 0, 10],
      ]);
    } else if (mode === 'wanted') {
      game.giveVehicle('VULCAN GT', 0, 0, Math.PI, 0xe0b23c);
      game.wanted.setLevel(4);
      game.wanted.lastCrime = game.wanted.time;
      game.mission.setProgress(0, 2, []);
      game.camYaw = Math.PI; game.camPitch = .13;
      game.police.spawnCar(0, 18, 'police', Math.PI);
      game.police.spawnCar(0, -30, 'police', Math.PI);
      game.police.spawnCar(9, -48, 'police', Math.PI);
      game.police.spawnOfficer(6, 10, 'police');
      placeTraffic([0, 1, 2], [
        [0, -78, Math.PI, 15],
        [-3, -130, Math.PI, 13],
        [4, 70, 0, 12],
      ]);
    } else if (mode === 'end') {
      game.player.x = -176; game.player.z = 176;
      game.player.cash = 2500; game.player.respect = 1;
      game.camYaw = -.6; game.camPitch = .24;
      game.showResult('JOB REPORT', 'MISSION COMPLETE',
        'The case is Oro’s now. Vex walks away richer and hotter than before.',
        '+ $2,500   ·   +1 RESPECT', 'CONTINUE');
    }
  };

  shot.update = function update(dt, t) {
    if (mode === 'play') {
      game.camYaw += dt * .045;
      virtual.keys.clear();
    } else if (mode === 'drive') {
      virtual.keys.clear();
      virtual.keys.add('KeyW');
      if (Math.sin(t * .42) > .78) virtual.keys.add('KeyA');
      if (Math.sin(t * .42) < -.78) virtual.keys.add('KeyD');
    } else if (mode === 'wanted') {
      virtual.keys.clear();
      virtual.keys.add('KeyW');
      virtual.keys.add('ShiftLeft');
      if (Math.sin(t * .7) > .55) virtual.keys.add('KeyD');
    } else {
      virtual.keys.clear();
    }
    game.prompt = '';
  };

  return shot;
}
