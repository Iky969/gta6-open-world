// Playwright smoke test: boot the game and every deterministic ?shot= mode,
// wait for the render loop, and fail on any console error or page exception.
// Run `node serve.ts --port 8096` first, or set GAME_URL to your server root.
// Install Playwright in CI with `npx playwright install chromium`.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SMOKE_PORT || 8097);
const BASE = process.env.GAME_URL || `http://127.0.0.1:${PORT}`;
const MODES = ['start', 'play', 'drive', 'wanted', 'end'];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('smoke: Playwright is not installed; skipping browser smoke test.');
  process.exit(0);
}

let server = null;
if (!process.env.GAME_URL) {
  server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 900));
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failures = 0;
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  for (const mode of MODES) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await page.goto(`${BASE}/?shot=${mode}&seed=1337`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => ({
      fallback: !document.getElementById('webglFallback')?.classList.contains('hidden'),
      canvas: (() => {
        const c = document.getElementById('view');
        return c ? c.width > 0 && c.height > 0 : false;
      })(),
      hasGame: !!window.__game,
    }));
    assert.equal(state.fallback, false, `${mode}: WebGL fallback was shown`);
    assert.equal(state.canvas, true, `${mode}: render canvas is empty`);
    assert.equal(state.hasGame, true, `${mode}: shot-mode globals missing`);
    if (errors.length) failures++;
    console.log(errors.length ? `FAIL ${mode}: ${errors.join(' | ')}` : `ok - ${mode}`);
    await page.close();
  }
  await context.close();
} finally {
  await browser.close();
  server?.kill();
}
assert.equal(failures, 0, `${failures} shot mode(s) logged console errors`);
console.log(`smoke: ${MODES.length} modes passed`);
