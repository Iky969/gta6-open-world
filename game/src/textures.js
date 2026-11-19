// Every texture in the game is painted into a canvas at boot: no image files,
// no downloads, no font loads. Colour maps are tagged sRGB, data maps stay linear.
// All randomness comes from the injected visual RNG stream so a seed reproduces
// the same facades, asphalt and water in every browser and every capture.
import * as THREE from 'three';
import { chance, randRange } from './rng.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function css(hex, alpha = 1) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function mix(hexA, hexB, t) {
  const a = rgb(hexA), b = rgb(hexB);
  return (Math.round(a[0] + (b[0] - a[0]) * t) << 16) |
    (Math.round(a[1] + (b[1] - a[1]) * t) << 8) |
    Math.round(a[2] + (b[2] - a[2]) * t);
}

// A tiled building facade: shaded wall, floor bands, framed windows and a
// matching emissive map so a few rooms glow warmly at golden hour.
export function makeFacadeTextures(rng, wallHex, style) {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = css(wallHex);
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < 130; i++) {
    const x = rng() * 128, y = rng() * 128;
    ctx.fillStyle = css(mix(wallHex, 0x000000, 0.06 + rng() * 0.12), 0.28);
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 6);
  }

  const cols = style === 1 ? 6 : 4;
  const rows = 4;
  const cw = 128 / cols, ch = 128 / rows;
  const emissiveCanvas = makeCanvas(128, 128);
  const ectx = emissiveCanvas.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 128, 128);

  for (let row = 0; row < rows; row++) {
    ctx.fillStyle = css(mix(wallHex, 0x000000, 0.22), 0.6);
    ctx.fillRect(0, row * ch - 2, 128, 3);
    for (let col = 0; col < cols; col++) {
      const x = col * cw + cw * 0.16;
      const y = row * ch + ch * 0.18;
      const w = cw * 0.68;
      const h = ch * (style === 2 ? 0.60 : 0.56);
      const lit = chance(rng, 0.34);
      ctx.fillStyle = css(mix(wallHex, 0xffffff, 0.5));
      ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
      ctx.fillStyle = lit ? css(mix(0xffd18a, 0xffffff, rng() * 0.4)) : css(mix(0x1b3547, 0x345267, rng()));
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(x + w / 2 - 1, y, 2, h);
      if (lit) {
        ectx.fillStyle = css(mix(0xffb454, 0xfff2c8, rng() * 0.6));
        ectx.fillRect(x, y, w, h);
      }
    }
  }
  return { map: toTexture(c), emissiveMap: toTexture(emissiveCanvas) };
}

export function makeAsphaltTexture(rng) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a5663';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = Math.floor(randRange(rng, 58, 132));
    ctx.fillStyle = `rgba(${v},${v + 5},${v + 9},${randRange(rng, .05, .22)})`;
    ctx.fillRect(rng() * 256, rng() * 256, randRange(rng, 1, 3), randRange(rng, 1, 3));
  }
  return toTexture(c);
}

export function makePavementTexture(rng) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc0a5';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(90,80,66,.24)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(80,72,60,${randRange(rng, .02, .10)})`;
    ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  return toTexture(c);
}

export function makeWaterTexture(rng) {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#2b8f9e');
  grad.addColorStop(0.5, '#42b3b8');
  grad.addColorStop(1, '#247d91');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 340; i++) {
    const x = rng() * 512, y = rng() * 512, w = 10 + rng() * 46;
    ctx.strokeStyle = `rgba(220,255,245,${randRange(rng, .04, .22)})`;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * .5, y - 4, x + w, y);
    ctx.stroke();
  }
  return toTexture(c);
}

export function makeBillboardTexture(title, subtitle, bg, fg) {
  const c = makeCanvas(512, 256);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, css(bg));
  grad.addColorStop(1, css(mix(bg, 0x000000, 0.45)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = css(fg, .55);
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = css(fg);
  ctx.font = 'bold 62px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 116);
  ctx.font = 'bold 25px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(subtitle, 256, 168);
  ctx.fillStyle = css(fg, .5);
  ctx.fillRect(70, 190, 372, 3);
  return toTexture(c, false);
}
