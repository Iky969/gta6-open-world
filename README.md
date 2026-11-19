# Vesper Bay — Golden Hustle

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/gta6-01/Iky969/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Iky969/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game built for [make.fun](https://make.fun)'s `gta6-01` bounty. Nothing from Rockstar Games: the city, characters, cars, story, art direction and sounds are all invented here.

## Visual direction — PS1 retro

The presentation deliberately avoids the generic neon/violet look. It uses the PS1-style technique from the `/low-poly` animation skill:

- the 3D scene renders into a target at 1/3 resolution and is upscaled with nearest-neighbour filtering (`game/src/retro.js`);
- every material gets a vertex-snapping and 15-bit ordered-dither shader patch, copied from that skill's shader;
- all code-drawn textures are switched to nearest filtering;
- signage and night-sky colours are muted to warm amber, teal-grey and slate instead of saturated neon.

`preview/gameplay.mp4` is a real browser recording for visual review; `screenshots/` holds deterministic frames from the game's own `?shot=` modes.

## Requirements and running

- **Node.js 22.18 or newer** is required for `main.ts` and `serve.ts` (Node 24/26 also work). No packages are installed; both use the standard library only.
- A desktop browser with WebGL (Chrome recommended). There is a fallback screen when WebGL is unavailable.

Serve `game/` with any static file server and open `index.html` in Chrome, or run `node serve.ts` and visit `http://localhost:8080`. No build step, no network requests, no downloaded assets: three.js r169 is vendored as `game/vendor/three.module.min.js`, and every texture and sound is generated in the browser.

To hand in locally: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`. This copies `game/` and `screenshots/` to the output directory and writes `dossier.json`.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Walk / drive (gamepad left stick) |
| Mouse | Look around (click the canvas to lock the pointer); gamepad right stick |
| `Shift` / `RT` | Sprint / boost |
| `F` / `B` | Steal a car / exit a car |
| Left click / `A` | Fire the current weapon |
| `R` / `Y` | Reload |
| `E` / `X` | Talk to Oro, start jobs at markers, save at the safehouse |
| `2` / `RB` | Switch between PISTOL and BURST SMG |
| `Space` / `LT` | Handbrake |
| `Q` / `M` | Cycle radio station / mute |
| `N` | Toggle rain |
| `Z` / `X` | Minimap zoom in / out |
| `Esc` / `Start` | Pause, settings, save, restart |

Keys can be rebound in **Pause → Settings**. Settings also expose volume, look sensitivity, FOV, graphics quality and radio station.

## What is in it

- **Vesper Bay**: a 7×7 block golden-hour city with a skyline, waterfront, pier, arena, plaza, palms and neon, explorable on foot and by car, with a full day/night cycle, rain and dusk neon glow.
- **Living traffic**: 22 AI-driven cars follow a right-hand lane graph, brake and swerve around crashes, and can be stolen; 32 pedestrians walk the sidewalks and flee from gunfire.
- **Wanted system**: crimes raise 1–5 stars; cruisers and officers pursue and shoot, 3 stars adds a roadblock, and 4–5 stars brings a search helicopter. Heat cools when you evade them.
- **Jobs with variety**: two story jobs (*Cold Delivery*, *Hot Wheels*) plus four side jobs — *Shadow Run* (chase), *Convoy* (escort), *Last Call* (timed delivery) and *Crossfire* (shootout). Jobs have fail states and checkpoint retries.
- **Combat and progression**: hitscan pistol and SMG with tracers, muzzle flashes, line-of-sight blocking, damage, reloading, vehicle smoke/fire/explosion states, health/armor/ammo pickups and cash/respect rewards that are paid once per job.
- **HUD & menus**: minimap with a route line, zoom and live blips, health/armor/cash/respect, wanted stars, speedometer, weapon and radio readouts, objective panel, title screen, pause/settings, confirm dialogs, and respawn/retry/result screens.
- **Persistence**: validated v2 localStorage saves with v1 migration, auto-save after jobs and at Oro's safehouse, plus deterministic `?shot=start|play|drive|wanted|end&seed=1337` capture modes.
- **Audio**: entirely synthesized WebAudio — engine, sirens, gunfire, screech, impacts, footsteps, UI, mission stingers and four procedural radio stations, each with a visual HUD cue.

## Architecture

`game/src/` splits the game by job:

- `config.js` — tuning constants, vehicle catalogue, weapons, jobs, pickups, story.
- `city.js`, `textures.js`, `sky.js`, `weather.js` — procedural world, canvas textures, sky shader, day/night and rain.
- `vehicles.js`, `traffic.js`, `pedestrians.js` — cars, AI drivers and sidewalk walkers.
- `player.js`, `input.js`, `combat.js`, `police.js`, `wanted.js` — avatar, input (rebindable + gamepad), hitscan combat, police escalation and heat.
- `mission.js`, `rewards.js`, `save.js`, `settings.js` — jobs, idempotent rewards, validated persistence and options.
- `hud.js`, `menus.js`, `audio.js` — HUD/minimap, overlays and synthesized sound.
- `rng.js`, `shots.js`, `main.js` — seeded streams, deterministic capture modes and integration.

`main.ts` is the Node 22 hand-in entrypoint: it verifies the core files, copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the unchanged `vendor/makefun-game.ts`.

## Development

- `tests/unit.mjs` — Node unit tests for save validation/migration and mission reward logic.
- `tests/smoke.mjs` — Playwright smoke test (boot, every `?shot=` mode, fail on console errors). Requires a local Playwright install and `node serve.ts --port 8096`.
- `ci/ci.yml` — GitHub Actions workflow (runs `node main.ts`, the unit tests, the smoke test and dossier size-cap checks). It is kept at `ci/ci.yml` because this repository's push token lacks GitHub's `workflow` scope, which refuses pushes that write to `.github/workflows/`; copy it there with a token that has that scope to enable CI.

Screenshots are real SwiftShader renders of `?shot=` modes; re-capture with the command in the kit rules after any visual change.

## Known limitations

- Geometry is stylised low-poly with canvas textures; there is no physics engine or exterior/interior building access.
- The city is a single fixed 7×7 grid; navigation is an arcade lane graph rather than full pathfinding, and the minimap route is a straight bearing, not a street-by-street path.
- Police cars use simple steering and can occasionally clip scenery; the helicopter is a hovering shooter, not a full flight model.
- Saving is per-browser localStorage only; there is no cloud sync. Audio starts after the first user gesture (browser autoplay policy).
- The four side jobs are replayable but have no branching dialogue or voice acting.
