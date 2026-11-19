// Vesper Bay — Golden Hustle, a gta6-01 entry (Node 22, standard library only): the game is
// this directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, three.js vendored under game/vendor/, no network
// request). This program hands it in: it checks that every file the page loads is present,
// copies game/, screenshots/ and the preview recording to /output, and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDossier, classifyGamePath, htmlFacts, importMapOf, isRelativeRef,
  isRelativeSpecifier, mappedSpecifier, resolveGamePath, sourceImports,
} from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Vesper Bay entry: refuse to hand in a half-built game. The required set is derived from
// the page itself — index.html, the stylesheets and media it references, and the full
// static-import closure of its module scripts (relative specifiers and import-map entries
// alike, walked with the dossier library's own resolver) — so the hand-in can never omit a
// module the game imports.
function collectRequiredGameFiles(gameDir: string): string[] {
  const indexPath = join(gameDir, 'index.html');
  if (!existsSync(indexPath)) throw new Error('Vesper Bay hand-in is missing game/index.html');
  const facts = htmlFacts(readFileSync(indexPath, 'utf8'));
  const { map, error } = importMapOf(facts);
  if (error !== null) throw new Error(`Vesper Bay hand-in: game/index.html's import map is unusable: ${error}`);
  const required = new Set<string>(['index.html']);
  const queue: string[] = [];
  const need = (path: string | null, from: string, what: string): void => {
    if (path === null) throw new Error(`Vesper Bay hand-in: game/${from}: ${what} names no file under game/`);
    if (!required.has(path)) { required.add(path); queue.push(path); }
  };
  const targetOf = (specifier: string, from: string): string | null => {
    if (isRelativeSpecifier(specifier)) return resolveGamePath(specifier, from);
    const value = mappedSpecifier(map, specifier, from);
    return value !== null && isRelativeRef(value) ? resolveGamePath(value, 'index.html') : null;
  };
  for (const link of facts.links) {
    if (link.rel === 'stylesheet' || link.rel === 'modulepreload') {
      need(resolveGamePath(link.href, 'index.html'), 'index.html', `<link rel="${link.rel}" href="${link.href}">`);
    }
  }
  for (const resource of facts.resources) {
    if (isRelativeRef(resource.src)) {
      need(resolveGamePath(resource.src, 'index.html'), 'index.html', `<${resource.tag} src="${resource.src}">`);
    }
  }
  for (const script of facts.scripts) {
    if (script.type === 'module') {
      if (script.src !== null) {
        const path = isRelativeRef(script.src) ? resolveGamePath(script.src, 'index.html') : targetOf(script.src, 'index.html');
        need(path, 'index.html', `<script type="module" src="${script.src}">`);
      } else {
        for (const specifier of sourceImports(script.text)) need(targetOf(specifier, 'index.html'), 'index.html', `import '${specifier}'`);
      }
    } else if (script.src !== null && isRelativeRef(script.src)) {
      need(resolveGamePath(script.src, 'index.html'), 'index.html', `<script src="${script.src}">`);
    }
  }
  while (queue.length > 0) {
    const path = queue.shift()!;
    const file = join(gameDir, path);
    if (!existsSync(file)) throw new Error(`Vesper Bay hand-in is missing game/${path}`);
    // Walk the game's own modules only; a vendored build is handed in as it stands.
    if (!/\.(js|mjs)$/i.test(path) || classifyGamePath(path) !== 'source') continue;
    for (const specifier of sourceImports(readFileSync(file, 'utf8'))) {
      need(targetOf(specifier, path), path, `import '${specifier}'`);
    }
  }
  return [...required].sort();
}

const requiredGameFiles = collectRequiredGameFiles(join(here, 'game'));

// The cover plus three gameplay frames are part of the hand-in as well.
const requiredScreens = ['1-title.jpg', '2-play.jpg', '3-drive.jpg', '4-wanted.jpg'];
for (const name of requiredScreens) {
  if (!existsSync(join(here, 'screenshots', name))) {
    throw new Error(`Vesper Bay hand-in is missing screenshots/${name}`);
  }
}
// The gameplay recording the judge watches beside the screenshots.
const previewFile = join(here, 'preview', 'gameplay.mp4');
if (!existsSync(previewFile)) throw new Error('Vesper Bay hand-in is missing preview/gameplay.mp4');
console.log(`Vesper Bay: handing in ${requiredGameFiles.length} core files, ${requiredScreens.length} screenshots and preview/gameplay.mp4.`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
// The recording goes to preview/ for the judge to play, and under game/ as an asset so the
// dossier's Game block lists it: buildDossier reads only game/ and screenshots/, and
// dossier.json must equal what it writes byte for byte (the dossier_matches gate).
mkdirSync(join(out, 'preview'), { recursive: true });
cpSync(previewFile, join(out, 'preview', 'gameplay.mp4'));
mkdirSync(join(out, 'game', 'preview'), { recursive: true });
cpSync(previewFile, join(out, 'game', 'preview', 'gameplay.mp4'));

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json). The dossier itself is capped at 1.5 MiB (RULES.txt, dossier_matches).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
if (dossier.length > 1572864) {
  throw new Error(`Vesper Bay hand-in: dossier.json is ${dossier.length} bytes, over the 1572864 (1.5 MiB) the scorer allows`);
}
writeFileSync(join(out, 'dossier.json'), dossier);
