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

// The canvas every frame of every clip is cut onto: wide and tall enough for
// the largest silhouette, with a little margin.
function canvasFor(clips) {
  let CW = 0, CH = 0;
  Object.values(clips).forEach(d => d.boxes.forEach(b => {
    CW = Math.max(CW, b.maxX - b.minX + 1 + 6);
    CH = Math.max(CH, b.maxY - b.minY + 1 + 4);
  }));
  return { CW, CH };
}

// Cut one frame onto the shared canvas: centred horizontally, feet on CH-2.
// `mirror` bakes a west-facing copy, for characters with east-only art.
function makeCutter(CW, CH) {
  return function cut(d, i, mirror) {
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
  };
}

module.exports = { decodeGif, stripMatte, bbox, loadClips, shareX, canvasFor, makeCutter, PNG };
