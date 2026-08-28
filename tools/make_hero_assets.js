#!/usr/bin/env node
// Build build/hero_assets.js from the Idle_v3 character GIFs.
//
// These are 3D-rendered sprites supplied per-direction (east AND west), so the
// game plays a direction-specific animation instead of mirroring one side —
// mirroring would flip the character's asymmetric details.
//
// Missing animations (run / shoot / sword) fall back to walk or idle and are
// listed in module.pending so it's obvious what still needs real art.
'use strict';
const fs = require('fs');
const path = require('path');
const { GifReader } = require('omggif');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const A = 'public/assets/';
const SRC = {
  idleE: A + 'Idle_v3_idle_breathing_east.gif',
  walkE: A + 'Idle_v3_walking_east.gif',
  walkW: A + 'Idle_v3_walking_west.gif'
};
const OUT = path.join(ROOT, 'build/hero_assets.js');

// ---------- GIF decode (disposal-aware) ----------
function decodeGif(file) {
  const gif = new GifReader(fs.readFileSync(file));
  const W = gif.width, H = gif.height;
  const canvas = new Uint8Array(W * H * 4);
  const frames = [], delays = [];
  for (let i = 0; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i);
    const before = info.disposal === 3 ? canvas.slice() : null;
    gif.decodeAndBlitFrameRGBA(i, canvas);
    frames.push(canvas.slice());
    delays.push(info.delay);
    if (info.disposal === 2) {
      for (let y = info.y; y < info.y + info.height; y++)
        for (let x = info.x; x < info.x + info.width; x++)
          canvas.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
    } else if (info.disposal === 3 && before) canvas.set(before);
  }
  return { W, H, frames, delays };
}

// ---------- background removal ----------
// Renders often arrive on a flat matte instead of real alpha. Flood-fill the
// matte inward from the border so enclosed same-colour pixels (eyes, buckles)
// survive.
function stripMatte(rgba, W, H) {
  let clear = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] <= 30) clear++;
  if (clear / (W * H) > 0.02) return 0;          // already has real alpha

  const at = (x, y) => (y * W + x) * 4;
  const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
  const c = corners.map(([x, y]) => [rgba[at(x, y)], rgba[at(x, y) + 1], rgba[at(x, y) + 2]]);
  const avg = [0, 1, 2].map(k => c.reduce((s, v) => s + v[k], 0) / c.length);
  const near = (i, tol) =>
    Math.abs(rgba[i] - avg[0]) <= tol && Math.abs(rgba[i + 1] - avg[1]) <= tol &&
    Math.abs(rgba[i + 2] - avg[2]) <= tol;

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push([x, 0], [x, H - 1]); }
  for (let y = 0; y < H; y++) { stack.push([0, y], [W - 1, y]); }
  let removed = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!near(i, 26)) continue;
    seen[p] = 1; rgba[i + 3] = 0; removed++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return removed;
}

function bbox(rgba, W, H) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (rgba[(y * W + x) * 4 + 3] > 30) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, maxX, minY, maxY };
}

// ---------- load ----------
const clips = {};
for (const [name, rel] of Object.entries(SRC)) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('MISSING', rel); continue; }
  const d = decodeGif(p);
  let stripped = 0;
  d.frames.forEach(f => { stripped += stripMatte(f, d.W, d.H); });
  d.boxes = d.frames.map(f => bbox(f, d.W, d.H));
  clips[name] = d;
  console.log(`${name}: ${d.W}x${d.H} ${d.frames.length}f` +
    (stripped ? `  matte removed (${Math.round(stripped / d.frames.length)} px/frame)` : '  (alpha present)'));
}
if (!clips.idleE || !clips.walkE) { console.error('need at least idle+walk east'); process.exit(1); }

// ---------- uniform canvas, feet-anchored ----------
// One canvas size for every clip so the sprite never jumps when the animation
// changes; each frame is centred horizontally and pinned to the same floor line.
let CW = 0, CH = 0;
Object.values(clips).forEach(d => d.boxes.forEach(b => {
  CW = Math.max(CW, b.maxX - b.minX + 1 + 6);
  CH = Math.max(CH, b.maxY - b.minY + 1 + 4);
}));
console.log('canvas', CW + 'x' + CH);

function cut(d, i, mirror) {
  const b = d.boxes[i];
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  const out = new PNG({ width: CW, height: CH });
  const ox = Math.floor((CW - w) / 2), oy = CH - h - 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((b.minY + y) * d.W + (b.minX + x)) * 4;
      if (d.frames[i][si + 3] <= 30) continue;
      const dx = mirror ? (w - 1 - x) : x;
      const di = ((oy + y) * CW + (ox + dx)) * 4;
      out.data[di] = d.frames[i][si];
      out.data[di + 1] = d.frames[i][si + 1];
      out.data[di + 2] = d.frames[i][si + 2];
      out.data[di + 3] = 255;
    }
  return 'data:image/png;base64,' + PNG.sync.write(out).toString('base64');
}
const strip = (name, mirror) => clips[name].frames.map((_, i) => cut(clips[name], i, mirror));

// ---------- body box (from idle frame 0) ----------
const ib = clips.idleE.boxes[0];
const iw = ib.maxX - ib.minX + 1, ih = ib.maxY - ib.minY + 1;
const body = {
  w: Math.max(8, Math.round(iw * 0.46)),
  h: ih - 4,
  x: Math.round((CW - Math.max(8, Math.round(iw * 0.46))) / 2),
  y: CH - ih
};

// muzzle: no gun art yet — chest height, just in front of the torso
const muzzle = { dx: Math.round(iw * 0.42), dy: -Math.round(ih * 0.18) };

const walkWest = clips.walkW ? strip('walkW', false) : strip('walkE', true);
const pending = [];
if (!clips.walkW) pending.push('walk west (mirrored east for now)');
pending.push('idle west (mirrored east)', 'run', 'shoot', 'sword');

const mod = {
  charH: ih,
  directional: true,          // real per-side art: play dir anims, never flipX
  body, muzzle, pending,
  anims: {
    idleE:  { fps: 8,  repeat: -1, frames: strip('idleE', false) },
    idleW:  { fps: 8,  repeat: -1, frames: strip('idleE', true) },
    walkE:  { fps: 12, repeat: -1, frames: strip('walkE', false) },
    walkW:  { fps: 12, repeat: -1, frames: walkWest },
    // placeholders until the real art lands — walk, run harder
    runE:   { fps: 17, repeat: -1, frames: strip('walkE', false) },
    runW:   { fps: 17, repeat: -1, frames: walkWest }
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'window.HERO = ' + JSON.stringify(mod) + ';\n');
console.log('body', JSON.stringify(body), 'charH', ih);
console.log('pending art:', pending.join(', '));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
