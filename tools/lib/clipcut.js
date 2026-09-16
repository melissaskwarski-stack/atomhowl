'use strict';
// Shared sprite-clip plumbing for the character tools.
//
// Every playable character is built the same way: decode a set of GIFs, drop
// whatever matte the renderer baked in behind the figure, and cut all of them
// against ONE canvas with the feet on a fixed line. That last part is what
// stops the sprite hopping when the animation changes — a per-frame crop would
// re-centre a raised arm or a lifted knee and move the whole body with it.
//
// make_hero_assets.js and make_wolffel_assets.js both sit on this; anything
// character-specific (which clip loops where, which clips pin their legs) stays
// in the tool, not here.
const fs = require('fs');
const { GifReader } = require('omggif');
const { PNG } = require('pngjs');

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

// Decode every clip in `src` ({ name: absolute path }), strip its matte and
// measure each frame. Missing files are reported and skipped so a half-finished
// character still builds.
function loadClips(src, log) {
  const clips = {};
  for (const [name, file] of Object.entries(src)) {
    if (!fs.existsSync(file)) { (log || console.log)('MISSING ' + file); continue; }
    const d = decodeGif(file);
    let stripped = 0;
    d.frames.forEach(f => { stripped += stripMatte(f, d.W, d.H); });
    d.boxes = d.frames.map(f => bbox(f, d.W, d.H));
    clips[name] = d;
    (log || console.log)(`${name}: ${d.W}x${d.H} ${d.frames.length}f` +
      (stripped ? '  matte removed' : '  (alpha present)'));
  }
  return clips;
}

// Give every frame of a clip the same horizontal extent. A clip that throws its
// arms out swings its own bounding box, and centring each frame on that box
// shimmies the torso side to side; the feet still anchor per frame.
function shareX(clips, names, log) {
  for (const name of names) {
    const d = clips[name];
    if (!d) continue;
    const minX = Math.min.apply(null, d.boxes.map(b => b.minX));
    const maxX = Math.max.apply(null, d.boxes.map(b => b.maxX));
    d.boxes = d.boxes.map(b => ({ minX, maxX, minY: b.minY, maxY: b.maxY }));
    (log || console.log)(`${name}: frames share x${minX}-${maxX}, feet anchored per frame`);
  }
}

// The canvas every frame of every clip is cut onto.
//
// Height is not just the tallest silhouette. A frame sits `groundRow - maxY`
// higher than the floor line (that is the whole point of anchoring per clip),
// so the room it needs is its own height PLUS that lift — which comes out as
// the distance from the clip's floor up to this frame's head. Sizing on height
// alone would push a jump's apex off the top of the canvas and cut his head
// off.
function canvasFor(clips) {
  let CW = 0, CH = 0;
  Object.values(clips).forEach(d => {
    const groundRow = Math.max.apply(null, d.boxes.map(v => v.maxY));
    d._groundRow = groundRow;
    d.boxes.forEach(b => {
      CW = Math.max(CW, b.maxX - b.minX + 1 + 6);
      CH = Math.max(CH, groundRow - b.minY + 1 + 4);
    });
  });
  return { CW, CH };
}

// How many frames at the head of a clip are still the standing pose.
//
// The renders open on the character at rest and take two or three frames to
// commit to the action. On screen the physics has already launched him, so
// those frames read as sliding upright before the animation catches up. This
// finds where the silhouette actually departs from frame 0 — measured, so it
// still holds if the art is regenerated with a different lead-in.
function leadIn(d, frac) {
  const f0 = d.frames[0];
  const diff = f => {
    let s = 0;
    for (let i = 3; i < f.length; i += 4) if (f[i] > 30 !== f0[i] > 30) s++;
    return s;
  };
  const d0 = d.frames.map(diff);
  const peak = Math.max.apply(null, d0);
  if (!peak) return 0;
  const gate = peak * (frac || 0.25);
  for (let i = 0; i < d0.length; i++) if (d0[i] >= gate) return i;
  return 0;
}

// Cut one frame onto the shared canvas: centred horizontally, and vertically
// placed so the clip's own lowest point — its deepest ground contact — sits on
// CH-2. `mirror` bakes a west-facing copy, for characters with east-only art.
//
// The vertical rule matters more than it looks. Pinning EVERY FRAME's lowest
// pixel to that line, which is the obvious reading of "feet on the floor",
// silently destroys any pose where the feet are not on the floor. A run has a
// flight phase with both feet up; pinning the trailing boot to the ground
// hauls the whole body down on those frames, and the head ends up bobbing 17px
// frame to frame — a sewing machine, not a gait. A jump is worse: this art
// draws it as a TUCK, the head holding still while the knees come up forty
// pixels, and pinning the feet turns that into a mid-air squat.
//
// So the anchor is per CLIP, not per frame: one offset, taken from the frame
// that reaches deepest, applied to all of them. Inside a clip the drawing keeps
// exactly the vertical relationships the artist gave it — bob, tuck, lunge —
// and between clips every ground contact still lands on the same line.
function makeCutter(CW, CH) {
  return function cut(d, i, mirror) {
    const b = d.boxes[i];
    const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
    if (d._groundRow === undefined) {
      d._groundRow = Math.max.apply(null, d.boxes.map(v => v.maxY));
    }
    const out = new PNG({ width: CW, height: CH });
    const ox = Math.floor((CW - w) / 2);
    const oy = (CH - h - 2) - (d._groundRow - b.maxY);
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
  };
}

// Where the barrel ends, in the coordinates of the cut canvas.
//
// Bullets used to leave from an offset guessed off the idle silhouette, which
// put them somewhere around his chest. Aiming a weapon puts its barrel further
// forward than any part of the body, so the tip is the forward-most column
// above the waist — but only a column that is part of the gun. Two things
// masquerade as one otherwise: single specks of ejected brass or spark drifting
// ahead of the barrel, and, if you go looking for a bright warm muzzle flash,
// the character's own skin, which in these renders is exactly that bright and
// that warm. So no colour test at all; just continuity. A real barrel is
// several columns deep, a speck is not.
// `mirror` says the frame the game will DRAW is the mirror of this source —
// which is how a west-drawn clip supplies the east-facing pose. It flips the
// search: the barrel is the forward-most column, and forward is the other way
// round in the source. Measuring a west clip without it walks in from the right
// and finds his back, which is how the run-and-shoot muzzle ended up level with
// his hip instead of at the end of the gun.
function muzzleTip(d, i, CW, CH, mirror) {
  const b = d.boxes[i], f = d.frames[i], W = d.W;
  const waist = Math.round(b.minY + (b.maxY - b.minY) * 0.6);

  // opaque pixels per column, above the waist only (legs stride further
  // forward than the gun on a walk cycle)
  const col = new Int32Array(W);
  for (let y = b.minY; y < waist; y++)
    for (let x = 0; x < W; x++)
      if (f[(y * W + x) * 4 + 3] > 30) col[x]++;

  // the forward-most column that is the END OF SOMETHING SOLID: it and the
  // three behind it all carry pixels
  const solid = x => col[x] >= 2;
  let mx = -1;
  if (mirror) {
    for (let x = 0; x <= W - 4; x++)
      if (solid(x) && solid(x + 1) && solid(x + 2) && solid(x + 3)) { mx = x; break; }
  } else {
    for (let x = W - 1; x >= 3; x--)
      if (solid(x) && solid(x - 1) && solid(x - 2) && solid(x - 3)) { mx = x; break; }
  }
  if (mx < 0) return null;

  // the bore is the middle of what the barrel draws in its last few columns
  const x0 = mirror ? mx : Math.max(0, mx - 4);
  const x1 = mirror ? Math.min(W - 1, mx + 4) : mx;
  let lo = 1e9, hi = -1;
  for (let y = b.minY; y < waist; y++)
    for (let x = x0; x <= x1; x++)
      if (f[(y * W + x) * 4 + 3] > 30) { if (y < lo) lo = y; if (y > hi) hi = y; }
  const my = Math.round((lo + hi) / 2);

  // through the same placement cut() uses, so it lands on the drawn frame
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  const ground = d._groundRow !== undefined ? d._groundRow
               : Math.max.apply(null, d.boxes.map(v => v.maxY));
  const ox = Math.floor((CW - w) / 2);
  const oy = (CH - h - 2) - (ground - b.maxY);
  const lx = mirror ? (w - 1 - (mx - b.minX)) : (mx - b.minX);
  return { x: ox + lx, y: oy + (my - b.minY) };
}

module.exports = { decodeGif, stripMatte, bbox, loadClips, shareX, canvasFor, makeCutter, leadIn, muzzleTip, PNG };
