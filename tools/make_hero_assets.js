#!/usr/bin/env node
// Build build/ew_assets.js from the Idle_v3 character GIFs.
//
// The art ships per-direction (east AND west), so the game plays a
// side-specific animation instead of mirroring one side — mirroring would
// flip the character's asymmetric hair and gear.
//
// Only idle-east, walk-east and walk-west exist so far. Run / shoot / sword
// reuse the walk cycle and are listed in EW.pending until the real art lands.
// Image data is emitted once into EW.frames and referenced by key, so the
// placeholder animations cost nothing in file size.
'use strict';
const fs = require('fs');
const path = require('path');
const { GifReader } = require('omggif');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const A = 'public/assets/';
const SRC = {
  idle:  A + 'Idle_v3_idle_breathing_east.gif',
  walk:  A + 'Idle_v3_walking_east.gif',
  walkW: A + 'Idle_v3_walking_west.gif'
};
const OUT = path.join(ROOT, 'build/ew_assets.js');

// ---------- GIF decode (disposal-aware) ----------
function decodeGif(file) {
  const gif = new GifReader(fs.readFileSync(file));
  const W = gif.width, H = gif.height;
  const canvas = new Uint8Array(W * H * 4);
  const frames = [];
  for (let i = 0; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i);
    const before = info.disposal === 3 ? canvas.slice() : null;
    gif.decodeAndBlitFrameRGBA(i, canvas);
    frames.push(canvas.slice());
    if (info.disposal === 2) {
      for (let y = info.y; y < info.y + info.height; y++)
        for (let x = info.x; x < info.x + info.width; x++)
          canvas.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
    } else if (info.disposal === 3 && before) canvas.set(before);
  }
  return { W, H, frames };
}

// Renders sometimes arrive on a flat matte instead of real alpha. Flood-fill
// inward from the border so enclosed same-colour pixels (eyes, buckles) survive.
function stripMatte(rgba, W, H) {
  let clear = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] <= 30) clear++;
  if (clear / (W * H) > 0.02) return 0;

  const at = (x, y) => (y * W + x) * 4;
  const c = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]
    .map(([x, y]) => [rgba[at(x, y)], rgba[at(x, y) + 1], rgba[at(x, y) + 2]]);
  const avg = [0, 1, 2].map(k => c.reduce((s, v) => s + v[k], 0) / c.length);
  const near = i => Math.abs(rgba[i] - avg[0]) <= 26 &&
                    Math.abs(rgba[i + 1] - avg[1]) <= 26 &&
                    Math.abs(rgba[i + 2] - avg[2]) <= 26;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
  let removed = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!near(i)) continue;
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
    (stripped ? '  matte removed' : '  (alpha present)'));
}
if (!clips.idle || !clips.walk) { console.error('need idle + walk east'); process.exit(1); }

// ---------- uniform, feet-anchored canvas ----------
// One canvas for every clip so the sprite never jumps when the animation
// changes, and every frame sits on the same floor line.
let CW = 0, CH = 0;
Object.values(clips).forEach(d => d.boxes.forEach(b => {
  CW = Math.max(CW, b.maxX - b.minX + 1 + 6);
  CH = Math.max(CH, b.maxY - b.minY + 1 + 4);
}));

function cut(d, i, mirror) {
  const b = d.boxes[i];
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  const out = new PNG({ width: CW, height: CH });
  const ox = Math.floor((CW - w) / 2), oy = CH - h - 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((b.minY + y) * d.W + (b.minX + x)) * 4;
      if (d.frames[i][si + 3] <= 30) continue;
      const di = ((oy + y) * CW + (ox + (mirror ? w - 1 - x : x))) * 4;
      out.data[di] = d.frames[i][si];
      out.data[di + 1] = d.frames[i][si + 1];
      out.data[di + 2] = d.frames[i][si + 2];
      out.data[di + 3] = 255;
    }
  return 'data:image/png;base64,' + PNG.sync.write(out).toString('base64');
}

// ---------- unique frame pool ----------
// Pool keys double as texture names ('ew_' + key), so 'ew_idle_0' — the
// texture the game constructs the player sprite with — still resolves.
const frames = {};
const pool = (poolName, clip, mirror) => {
  const keys = clips[clip].frames.map((_, i) => {
    const k = `${poolName}_${i}`;
    frames[k] = cut(clips[clip], i, mirror);
    return k;
  });
  return keys;
};
const K = {
  idle:  pool('idle',  'idle',  false),
  idleW: pool('idleW', 'idle',  true),           // no west idle supplied — mirror east
  walk:  pool('walk',  'walk',  false),
  walkW: pool('walkW', clips.walkW ? 'walkW' : 'walk', !clips.walkW)
};

// ---------- body box + muzzle ----------
const ib = clips.idle.boxes[0];
const iw = ib.maxX - ib.minX + 1, ih = ib.maxY - ib.minY + 1;
const bw = Math.max(8, Math.round(iw * 0.46));
const body = { w: bw, h: ih - 6, x: Math.round((CW - bw) / 2), y: CH - ih + 2 };
// No weapon art yet, so shots leave from chest height just in front of the
// torso. Measured from the feet (the frames are feet-anchored at CH-2) and
// expressed relative to the sprite's centre, which is what the game adds to
// player.y. Chest sits ~0.72 of body height up from the sole.
const FEET_Y = CH - 2;
const muzzle = {
  dx: Math.round(iw * 0.5 + 4),
  dy: Math.round((FEET_Y - ih * 0.72) - CH / 2)
};

const A_ = (keys, fps, repeat) => ({ fps, repeat: repeat === undefined ? -1 : repeat, keys });
const mid = a => [a[Math.min(2, a.length - 1)]];

const mod = {
  charH: ih,
  hiRes: true,             // 3D render, not pixel art — scale fractionally
  directional: true,       // real per-side art — pick the anim, never flipX
  body, muzzle,
  pending: ['idle west (mirrored east)', 'run', 'shoot', 'sword'],
  frames,
  anims: {
    idle:      A_(K.idle,  8),
    idleW:     A_(K.idleW, 8),
    walk:      A_(K.walk,  12),
    walkW:     A_(K.walkW, 12),
    run:       A_(K.walk,  17),
    runW:      A_(K.walkW, 17),
    jump:      A_(mid(K.walk),  10, 0),
    jumpW:     A_(mid(K.walkW), 10, 0),
    // placeholders — same walk cycle until the real art arrives
    shoot:     A_(K.walk,  12),
    shootW:    A_(K.walkW, 12),
    runshoot:  A_(K.walk,  17),
    runshootW: A_(K.walkW, 17),
    sword:     A_(K.walk,  14, 0),
    swordW:    A_(K.walkW, 14, 0)
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'window.EW = ' + JSON.stringify(mod) + ';\n');
console.log(`canvas ${CW}x${CH}  charH ${ih}`);
console.log('body', JSON.stringify(body), 'muzzle', JSON.stringify(muzzle));
console.log(`${Object.keys(frames).length} unique frames, ${Object.keys(mod.anims).length} anims`);
console.log('pending art:', mod.pending.join(', '));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
