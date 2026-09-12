#!/usr/bin/env node
// Build build/ui_assets.js — the dialogue frame, the character busts and the
// 8-direction turntables used by the front end.
//
// Busts: the eyes-open and eyes-closed renders of a character are separate
// files, so both are cut with ONE crop rectangle measured from the open image.
// Sharing the rectangle is what keeps the blink from jolting when the texture
// swaps — cropping each to its own bounds would shift the head between frames.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { GifReader } = require('omggif');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const A = rel => path.join(ROOT, 'public/assets', rel);
const TMP = path.join(ROOT, 'build/.uitmp');
const OUT = path.join(ROOT, 'build/ui_assets.js');
const FFMPEG = require('ffmpeg-static');

const PORTRAITS = {
  eterwolf: { open: 'portrait_eterwolf_open.png', closed: 'portrait_eterwolf_closed.png' },
  feli:     { open: 'portrait_feli_open.png',     closed: 'portrait_feli_closed.png' }
};
const ROTATIONS = { eterwolf: 'rotation_eterwolf.gif', wolffel: 'rotation_wolffel.gif' };
// Two frames of the same bar: the name plate sits left on one and right on the
// other, so the speaker can take the one whose plate is clear of them.
const PANELS = { l: 'dialogue_panel.png', r: 'dialogue_panel_r.png' };

// Characters stand at the screen edges at full height and run off the bottom
// of the frame, so they are trimmed to their own bounds and never cropped
// through the body. Emitted at roughly the on-screen height.
const FIG_H = 600;

fs.mkdirSync(TMP, { recursive: true });
const ff = args => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const uri = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

// The crop slices straight through the shoulders, which reads as a hard
// rectangular cut once the bust sits over a scene. Ramping alpha off the
// bottom and sides lets it dissolve instead. Purely geometric, so the
// eyes-open and eyes-closed twins get an identical edge.
function feather(file, botFrac, sideFrac) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const W = png.width, H = png.height;
  const bot = Math.max(1, Math.round(H * botFrac));
  const side = Math.max(1, Math.round(W * sideFrac));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!png.data[i + 3]) continue;
      let f = 1;
      if (y > H - bot) f = Math.min(f, (H - y) / bot);
      if (x < side) f = Math.min(f, x / side);
      if (x > W - side) f = Math.min(f, (W - x) / side);
      if (f < 1) {
        f = Math.max(0, f);
        png.data[i + 3] = Math.round(png.data[i + 3] * f * f * (3 - 2 * f));   // smoothstep
      }
    }
  fs.writeFileSync(file, PNG.sync.write(png));
}

function alphaBox(png, y0, y1) {
  let minX = png.width, maxX = -1, minY = png.height, maxY = -1;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3] > 40) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, maxX, minY, maxY };
}

// ---------- full-height figures ----------
// Both states of a character are trimmed with ONE rectangle measured from the
// open render. Sharing it is what keeps the blink from jolting when the
// texture swaps — trimming each to its own bounds would shift the head.
const portraits = {};
for (const [name, pair] of Object.entries(PORTRAITS)) {
  if (!fs.existsSync(A(pair.open))) { console.log('MISSING', pair.open); continue; }
  const png = PNG.sync.read(fs.readFileSync(A(pair.open)));
  const b = alphaBox(png, 0, png.height);
  const cx = b.minX, cy = b.minY;
  const cw = b.maxX - b.minX + 1, ch = b.maxY - b.minY + 1;

  portraits[name] = {};
  for (const state of ['open', 'closed']) {
    const src = A(pair[state]);
    if (!fs.existsSync(src)) { console.log('MISSING', pair[state]); continue; }
    const dst = path.join(TMP, `fig_${name}_${state}.png`);
    ff(['-i', src, '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=-1:${FIG_H}:flags=lanczos`, dst]);
    portraits[name][state] = uri(dst);
  }
  console.log(`figure ${name}: trim ${cw}x${ch} @${cx},${cy} -> ${FIG_H}px tall`);
}

// ---------- 8-direction turntables ----------
function decodeGif(file) {
  const gif = new GifReader(fs.readFileSync(file));
  const W = gif.width, H = gif.height;
  const canvas = new Uint8Array(W * H * 4);
  const frames = [];
  for (let i = 0; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i);
    const keep = info.disposal === 3 ? canvas.slice() : null;
    gif.decodeAndBlitFrameRGBA(i, canvas);
    frames.push(canvas.slice());
    if (info.disposal === 2) {
      for (let y = info.y; y < info.y + info.height; y++)
        for (let x = info.x; x < info.x + info.width; x++)
          canvas.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
    } else if (info.disposal === 3 && keep) canvas.set(keep);
  }
  return { W, H, frames };
}

const rotations = {};
for (const [name, file] of Object.entries(ROTATIONS)) {
  if (!fs.existsSync(A(file))) { console.log('MISSING', file); continue; }
  const d = decodeGif(A(file));

  // One canvas across every angle, anchored at the feet, so the character
  // turns in place instead of bobbing as the silhouette width changes.
  const boxes = d.frames.map(f => {
    const png = { width: d.W, height: d.H, data: f };
    return alphaBox(png, 0, d.H);
  });
  const cw = Math.max(...boxes.map(b => b.maxX - b.minX + 1)) + 4;
  const ch = Math.max(...boxes.map(b => b.maxY - b.minY + 1)) + 4;

  rotations[name] = d.frames.map((f, i) => {
    const b = boxes[i];
    const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
    const out = new PNG({ width: cw, height: ch });
    const ox = Math.floor((cw - w) / 2), oy = ch - h - 2;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const si = ((b.minY + y) * d.W + (b.minX + x)) * 4;
        if (f[si + 3] <= 30) continue;
        const di = ((oy + y) * cw + (ox + x)) * 4;
        out.data[di] = f[si]; out.data[di + 1] = f[si + 1];
        out.data[di + 2] = f[si + 2]; out.data[di + 3] = f[si + 3];
      }
    return 'data:image/png;base64,' + PNG.sync.write(out).toString('base64');
  });
  console.log(`turntable ${name}: ${d.frames.length} frames @ ${cw}x${ch}`);
}

// ---------- dialogue frames ----------
const panels = {};
for (const [side, file] of Object.entries(PANELS)) {
  if (!fs.existsSync(A(file))) { console.log('MISSING', file); continue; }
  const dst = path.join(TMP, `panel_${side}.png`);
  ff(['-i', A(file), '-vf', 'scale=880:-1:flags=lanczos', dst]);
  panels[side] = uri(dst);
  console.log(`panel ${side}: -> 880px (${Math.round(panels[side].length / 1024)}KB)`);
}

fs.writeFileSync(OUT, '/* UI art */ window.UIART = ' +
  JSON.stringify({ panels, portraits, rotations }) + ';\n');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
