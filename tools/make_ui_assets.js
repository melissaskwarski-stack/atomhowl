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
  wolffel:  { open: 'portrait_wolffel_open.png',  closed: 'portrait_wolffel_closed.png' }
};
const ROTATIONS = { eterwolf: 'rotation_eterwolf.gif', wolffel: 'rotation_wolffel.gif' };
// Walk cycles for the AI companion. Cut the same way as the turntables so the
// two sets share a floor line and he does not hop when he starts moving.
const WALKS = { wolffel: 'Idle_v3_wolffel_walk_east.gif' };
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

// A cutout render still stores colour underneath its transparent pixels, and
// some carry a wash of near-zero alpha left from the backdrop they were lifted
// off. Neither is visible on its own, but the downscale and the linear filter
// both average across those pixels, which is what puts a coloured halo around
// the figure — and since one render was hand-cleaned and its twin was not, the
// halo would even change colour on a blink.
//
// So: drop the wash, then flood the opaque colour outwards over the
// transparent region. After that there is no foreign colour left to sample.
function cleanCutout(png, floor) {
  const W = png.width, H = png.height, d = png.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] <= floor) d[i] = 0;

  let front = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) front[p] = d[p * 4 + 3] > 0 ? 1 : 0;

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let pass = 0; pass < 12; pass++) {
    const next = front.slice();
    let grew = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (front[p]) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (const [dx, dy] of NB) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (!front[q]) continue;
          n++; r += d[q * 4]; g += d[q * 4 + 1]; b += d[q * 4 + 2];
        }
        if (!n) continue;
        d[p * 4] = (r / n) | 0; d[p * 4 + 1] = (g / n) | 0; d[p * 4 + 2] = (b / n) | 0;
        next[p] = 1; grew++;
      }
    front = next;
    if (!grew) break;
  }
  return png;
}

// The eyes-open and eyes-closed renders are separate generations of the same
// character: hair, shading and pose all differ slightly across the whole
// figure. Swapping the entire texture therefore makes him shimmer from head to
// boot rather than blink. Only the eyes should move, so the closed frame is
// rebuilt here as the OPEN frame with a band across the eyes taken from the
// closed render and feathered in — everything outside that band stays byte-
// identical, which is what makes the swap read as a blink.
//
// The band is found, not hard-coded: mask to pixels that are skin in both
// frames (excluding the hair, which is where the two renders disagree most),
// then take the row whose difference is greatest down the middle of the face.
function blinkFrame(openPng, closedPng) {
  const W = openPng.width, H = openPng.height;
  const O = openPng.data, C = closedPng.data;
  const HEAD = Math.round(H * 0.30);
  const skin = (d, i) => {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    return d[i + 3] > 200 && R > 110 && R > G + 15 && G > B + 3 && B < 180;
  };
  const diff = i => Math.abs(O[i] - C[i]) + Math.abs(O[i + 1] - C[i + 1]) + Math.abs(O[i + 2] - C[i + 2]);

  let mnX = W, mxX = -1;
  for (let y = 0; y < HEAD; y++)
    for (let x = 0; x < W; x++) if (skin(O, (y * W + x) * 4)) { if (x < mnX) mnX = x; if (x > mxX) mxX = x; }
  if (mxX < 0) return null;

  const q = (mxX - mnX) * 0.25;
  const x0 = Math.round(mnX + q), x1 = Math.round(mxX - q);
  let eyeRow = 0, best = -1;
  for (let y = 0; y < HEAD; y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      if (skin(O, i) || skin(C, i)) sum += diff(i);
    }
    if (sum > best) { best = sum; eyeRow = y; }
  }

  const halfH = 52, padX = 34;                       // covers brow to cheekbone
  const bx0 = x0 - padX, bx1 = x1 + padX;
  const by0 = eyeRow - halfH, by1 = eyeRow + halfH;
  const ramp = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  const out = new PNG({ width: W, height: H });
  out.data.set(O);
  for (let y = by0; y < by1; y++) {
    if (y < 0 || y >= H) continue;
    const fy = ramp(Math.min(y - by0, by1 - y) / 26);
    for (let x = bx0; x < bx1; x++) {
      if (x < 0 || x >= W) continue;
      const w = fy * ramp(Math.min(x - bx0, bx1 - x) / 26);
      if (w <= 0) continue;
      const i = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) out.data[i + k] = Math.round(O[i + k] * (1 - w) + C[i + k] * w);
    }
  }
  out._eye = { row: eyeRow, x: [bx0, bx1], y: [by0, by1] };
  return out;
}

const cleanFile = (file, floor) =>
  fs.writeFileSync(file, PNG.sync.write(cleanCutout(PNG.sync.read(fs.readFileSync(file)), floor)));

// Alpha low enough to be invisible alone but numerous enough to haze the
// figure once averaged — backdrop residue rather than drawn edge.
const WASH = 15;
function countWash(png) {
  let n = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 0 && png.data[i] <= WASH) n++;
  return n;
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
  // De-wash both renders BEFORE measuring or scaling: the residue would
  // otherwise be resampled into the edge and be impossible to remove after.
  const cleaned = {};
  for (const state of ['open', 'closed']) {
    const src = A(pair[state]);
    if (!fs.existsSync(src)) { console.log('MISSING', pair[state]); continue; }
    const tmp = path.join(TMP, `clean_${name}_${state}.png`);
    const png = PNG.sync.read(fs.readFileSync(src));
    const before = countWash(png);
    fs.writeFileSync(tmp, PNG.sync.write(cleanCutout(png, WASH)));
    cleaned[state] = tmp;
    if (before) console.log(`  ${name} ${state}: dropped ${before} backdrop px`);
  }
  if (!cleaned.open) continue;

  const ref = PNG.sync.read(fs.readFileSync(cleaned.open));
  const b = alphaBox(ref, 0, ref.height);
  const cx = b.minX, cy = b.minY;
  const cw = b.maxX - b.minX + 1, ch = b.maxY - b.minY + 1;

  // Rebuild the closed frame as the open one plus an eye band, so a blink
  // moves nothing but the eyes.
  if (cleaned.closed) {
    const blink = blinkFrame(PNG.sync.read(fs.readFileSync(cleaned.open)),
                             PNG.sync.read(fs.readFileSync(cleaned.closed)));
    if (blink) {
      fs.writeFileSync(cleaned.closed, PNG.sync.write(blink));
      console.log(`  ${name} blink: eye row ${blink._eye.row}, band x${blink._eye.x} y${blink._eye.y}`);
    } else console.log(`  ${name}: no face found — closed frame left whole`);
  }

  portraits[name] = {};
  for (const state of Object.keys(cleaned)) {
    const dst = path.join(TMP, `fig_${name}_${state}.png`);
    ff(['-i', cleaned[state], '-vf',
        `crop=${cw}:${ch}:${cx}:${cy},scale=-1:${FIG_H}:flags=lanczos`, dst]);
    cleanFile(dst, 0);          // re-flood: the resampler leaves its own edge
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

// One canvas across every frame of a clip, anchored at the feet, so the figure
// turns or strides in place instead of bobbing as its silhouette changes.
function cutClip(file) {
  const d = decodeGif(file);
  const boxes = d.frames.map(f => alphaBox({ width: d.W, height: d.H, data: f }, 0, d.H));
  const cw = Math.max(...boxes.map(b => b.maxX - b.minX + 1)) + 4;
  const ch = Math.max(...boxes.map(b => b.maxY - b.minY + 1)) + 4;
  const out = d.frames.map((f, i) => {
    const b = boxes[i];
    const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
    const png = new PNG({ width: cw, height: ch });
    const ox = Math.floor((cw - w) / 2), oy = ch - h - 2;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const si = ((b.minY + y) * d.W + (b.minX + x)) * 4;
        if (f[si + 3] <= 30) continue;
        const di = ((oy + y) * cw + (ox + x)) * 4;
        png.data[di] = f[si]; png.data[di + 1] = f[si + 1];
        png.data[di + 2] = f[si + 2]; png.data[di + 3] = f[si + 3];
      }
    // These are shown larger than they are drawn, so the same flood is needed
    // here or the linear upscale would drag black out of the empty pixels.
    return 'data:image/png;base64,' +
      PNG.sync.write(cleanCutout(png, 0)).toString('base64');
  });
  // The figure height, not the canvas: two clips cut to different canvases
  // scale to different on-screen sizes if the canvas is used as the divisor.
  const figH = Math.max.apply(null, boxes.map(b => b.maxY - b.minY + 1));
  return { frames: out, cw, ch, figH };
}

const rotations = {};
for (const [name, file] of Object.entries(ROTATIONS)) {
  if (!fs.existsSync(A(file))) { console.log('MISSING', file); continue; }
  const c = cutClip(A(file));
  rotations[name] = c.frames;
  console.log(`turntable ${name}: ${c.frames.length} frames @ ${c.cw}x${c.ch}`);
}

const walks = {}, walkMeta = {};
for (const [name, file] of Object.entries(WALKS)) {
  if (!fs.existsSync(A(file))) { console.log('MISSING', file); continue; }
  const c = cutClip(A(file));
  walks[name] = c.frames;
  walkMeta[name] = { figH: c.figH, canvasH: c.ch };
  console.log(`walk ${name}: ${c.frames.length} frames @ ${c.cw}x${c.ch}, figure ${c.figH}px`);
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
  JSON.stringify({ panels, portraits, rotations, walks, walkMeta }) + ';\n');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
