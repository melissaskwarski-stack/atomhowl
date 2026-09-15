#!/usr/bin/env node
// Build build/ew_assets.js from the Idle_v3 character GIFs.
//
// The art ships per-direction (east AND west), so the game plays a
// side-specific animation instead of mirroring one side — mirroring would
// flip the character's asymmetric hair and gear.
//
// The run clip is an acceleration, not a cycle: it opens standing upright and
// leans further forward on every frame, never settling. Looping the whole
// thing would make him stand up and lean in again several times a second, so
// it is split — the full clip plays once as he sets off, and only the settled
// tail loops after that. LOOP_FROM marks where each tail starts.
//
// Run ships with real east AND west art. Walk and idle are east only, so their
// west is a mirrored copy baked here rather than a runtime flipX — the
// directional player expects a real 'W' animation to exist.
//
// Shoot / sword still reuse the run frames and are listed in EW.pending until
// the real art lands. Image data is emitted once into EW.frames and referenced
// by key, so those placeholders cost nothing in file size.
'use strict';
const fs = require('fs');
const path = require('path');
const { GifReader } = require('omggif');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const A = 'public/assets/';
const SRC = {
  idle:      A + 'Idle_v3_idle_breathing_east.gif',
  // The run is two clips: the lean-in that gets him moving, which has real east
  // and west art, and a true looping sprint behind it. Before the sprint arrived
  // the loop had to be sliced out of the lean-in, which never settles.
  runin:     A + 'Idle_v3_run_east.gif',
  runinW:    A + 'Idle_v3_run_west.gif',
  sprint:    A + 'Idle_v3_sprint_east.gif',
  walk:      A + 'Idle_v3_walk_east.gif',
  guitar:    A + 'Idle_v3_guitar_east.gif',
  pistol:    A + 'Idle_v3_pistol_east.gif',
  dash:      A + 'Idle_v3_dash_east.gif',
  runshootW: A + 'Idle_v3_runshoot_west.gif'   // drawn facing west; east is mirrored
};

// Several clips open with a one-shot action and only then settle into
// something repeatable — the run leans in, the guitar is pulled off his back,
// the pistol is drawn. Each is emitted twice: '<name>in' plays the whole clip
// once, '<name>' loops the settled tail. The index is where that tail starts,
// chosen by comparing the wrap discontinuity against the in-loop motion
// (tools note: run 4 scored 1.12, pistol 7 scored 1.00 — lower is smoother).
const LOOP_FROM = { guitar: 4, pistol: 7, runshoot: 8, runshootW: 8 };

// Playing the guitar is an upper-body action, but the render has him shifting
// his weight foot to foot, which looks wrong once the clip is looping on the
// spot. Everything below this fraction of his height is pinned to the first
// frame of the loop, so only his torso, arms and the instrument move. The seam
// sits at the waist, which the motion profile shows is the quietest band —
// putting it anywhere busier would show as a shear.
const FREEZE_BELOW = { guitar: 0.52 };
const FREEZE_FEATHER = 12;
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
if (!clips.idle || !clips.runin) { console.error('need idle + run east'); process.exit(1); }

for (const [name, frac] of Object.entries(FREEZE_BELOW)) {
  const d = clips[name];
  if (!d) continue;
  const from = LOOP_FROM[name] || 0;
  const b = d.boxes[from];
  const seam = Math.round(b.minY + (b.maxY - b.minY + 1) * frac);
  const base = d.frames[from];
  for (let i = from + 1; i < d.frames.length; i++) {
    const f = d.frames[i];
    for (let y = seam; y < d.H; y++) {
      const w = Math.min(1, (y - seam) / FREEZE_FEATHER);
      for (let x = 0; x < d.W; x++) {
        const k = (y * d.W + x) * 4;
        for (let c = 0; c < 4; c++) f[k + c] = Math.round(f[k + c] * (1 - w) + base[k + c] * w);
      }
    }
  }
  // Every frame is cut against its own bounds and re-centred, so a torso that
  // changes width would slide the pinned legs anyway. The loop frames are
  // given ONE shared box, which is what actually holds them still.
  d.boxes = d.frames.map(fr => bbox(fr, d.W, d.H));   // silhouette changed
  const loop = d.boxes.slice(from);
  const shared = {
    minX: Math.min.apply(null, loop.map(v => v.minX)),
    maxX: Math.max.apply(null, loop.map(v => v.maxX)),
    minY: Math.min.apply(null, loop.map(v => v.minY)),
    maxY: Math.max.apply(null, loop.map(v => v.maxY))
  };
  for (let i = from; i < d.boxes.length; i++) d.boxes[i] = shared;
  console.log(`${name}: legs pinned below y${seam} from frame ${from}, ` +
    `loop shares box ${shared.maxX - shared.minX + 1}x${shared.maxY - shared.minY + 1}`);
}

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
  idle:      pool('idle',      'idle',   false),
  idleW:     pool('idleW',     'idle',   true),   // east only — mirror
  walk:      pool('walk',      'walk',   false),
  walkW:     pool('walkW',     'walk',   true),   // east only — mirror
  runin:     pool('runin',     'runin',  false),  // real east lean-in
  runinW:    pool('runinW',    'runinW', false),  // real west lean-in
  run:       pool('run',       'sprint', false),  // true looping sprint
  runW:      pool('runW',      'sprint', true),   // east only — mirror
  guitarin:  pool('guitarin',  'guitar', false),
  guitarinW: pool('guitarinW', 'guitar', true),   // east only — mirror
  pistolin:  pool('pistolin',  'pistol', false),
  pistolinW: pool('pistolinW', 'pistol', true),   // east only — mirror
  dash:      pool('dash',      'dash',   false),
  dashW:     pool('dashW',     'dash',   true),   // east only — mirror
  runshootinW: pool('runshootinW', 'runshootW', false),  // real west art
  runshootin:  pool('runshootin',  'runshootW', true)    // west only — mirror
};
// Each looping tail reuses frames already emitted for its intro, so splitting
// a clip in two costs no extra image data.
// The run has its own loop art now, so only these still slice a tail out of a
// one-shot clip.
for (const name of ['guitar', 'pistol', 'runshoot']) {
  const from = LOOP_FROM[name] || 0;
  K[name]       = K[name + 'in'].slice(from);
  K[name + 'W'] = K[name + 'inW'].slice(from);
}

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
  pending: ['idle west (mirrored east)', 'walk west (mirrored east)',
            'guitar west (mirrored east)', 'pistol west (mirrored east)',
            'dash west (mirrored east)', 'run-shoot east (mirrored west)', 'sword'],
  frames,
  anims: {
    idle:       A_(K.idle,      5),     // slow breathing
    idleW:      A_(K.idleW,     5),
    walk:       A_(K.walk,      11),
    walkW:      A_(K.walkW,     11),
    // one-shot intros; each is chained into the matching loop below
    runin:      A_(K.runin,     16, 0),
    runinW:     A_(K.runinW,    16, 0),
    guitarin:   A_(K.guitarin,  11, 0),
    guitarinW:  A_(K.guitarinW, 11, 0),
    shootin:    A_(K.pistolin,  14, 0),
    shootinW:   A_(K.pistolinW, 14, 0),
    // settled tails
    run:        A_(K.run,       14),
    runW:       A_(K.runW,      14),
    guitar:     A_(K.guitar,    7),     // idle strumming
    guitarW:    A_(K.guitarW,   7),
    shoot:      A_(K.pistol,    10),    // arm out, recoil
    shootW:     A_(K.pistolW,   10),
    runshootin:  A_(K.runshootin,  15, 0),   // draws the pistol at a run
    runshootinW: A_(K.runshootinW, 15, 0),
    runshoot:   A_(K.runshoot,  15),   // settled run-and-fire cycle
    runshootW:  A_(K.runshootW, 15),
    dash:       A_(K.dash,      16, 0),      // one burst, never loops
    dashW:      A_(K.dashW,     16, 0),
    jump:       A_(mid(K.run),  10, 0),
    jumpW:      A_(mid(K.runW), 10, 0),
    // placeholder — the run cycle until the real art arrives
    sword:      A_(K.run,       14, 0),
    swordW:     A_(K.runW,      14, 0)
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'window.EW = ' + JSON.stringify(mod) + ';\n');
console.log(`canvas ${CW}x${CH}  charH ${ih}`);
console.log('body', JSON.stringify(body), 'muzzle', JSON.stringify(muzzle));
console.log(`${Object.keys(frames).length} unique frames, ${Object.keys(mod.anims).length} anims`);
console.log('pending art:', mod.pending.join(', '));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
