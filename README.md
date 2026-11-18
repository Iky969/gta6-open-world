# Vesper Bay — Golden Hustle

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/gta6-01/Iky969/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Iky969/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

An original, complete open-world crime game built for [make.fun](https://make.fun)'s `gta6-01` bounty. Nothing from Rockstar Games: the city, characters, cars, story, art direction and sounds are all invented here.

## Play

Serve `game/` with any static file server and open `index.html` in desktop Chrome, or run `node serve.ts` and visit `http://localhost:8080`. No build step, no network requests, no downloaded assets: three.js r169 is vendored, and every texture and sound is generated in the browser.

| Key | Action |
| --- | --- |
| `W A S D` | Walk / drive |
| Mouse | Look around (click the canvas to lock the pointer) |
| `Shift` | Sprint / boost |
| `F` | Steal a car / exit a car |
| Left click | Fire the pistol |
| `R` | Reload |
| `E` | Interact at a job location |
| `Space` | Handbrake |
| `Esc` | Pause, save, restart |

## What is in it

- **Vesper Bay**: a 7×7 block golden-hour city with a skyline, waterfront, pier, arena, plaza, palms and neon signs, explorable on foot and by car.
- **Living traffic**: 22 AI-driven cars follow a right-hand lane graph, brake for each other, and can be stolen; 32 pedestrians walk the sidewalks and flee from gunfire.
- **Wanted system**: crimes raise 1–5 stars; cruisers and officers respond, pursue, ram and shoot. Heat cools when you evade them.
- **Story jobs**: *Cold Delivery* and *Hot Wheels* — travel, pickups, ambushes, named vehicle theft, delivery, cash and respect, with clear job reports.
- **Combat**: hitscan pistol with tracers, muzzle flashes, damage, reloading, vehicle damage and a camera-shake feedback loop.
- **HUD & menus**: minimap with live blips, health/armor/cash/respect, wanted stars, speedometer, objective panel, title screen, pause/save/restart, respawn and mission-complete screens.
- **Audio**: entirely synthesized WebAudio — engine, sirens, gunfire, screech, impacts, footsteps, UI and mission stingers.
- **Persistence**: localStorage save/continue, plus deterministic `?shot=start|play|drive|wanted|end&seed=1337` capture modes.

## Structure

`game/src/` splits the game by job: `city.js` (world), `traffic.js`, `pedestrians.js`, `vehicles.js`, `player.js`, `police.js`, `wanted.js`, `combat.js`, `mission.js`, `hud.js`, `menus.js`, `audio.js`, `textures.js`, `sky.js`, `save.js`, `shots.js`, `input.js`, `config.js`, `rng.js` and `main.js` (integration).

`main.ts` is the Node 22 hand-in entrypoint: it copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
