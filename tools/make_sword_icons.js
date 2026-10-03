'use strict';
// signal sword.png (the one blade, single player) and sword asset both
// swords.png (the crossed pair, multiplayer), kept in public/assets as
// signal_sword_src.png and both_swords_src.png: trimmed to what is painted and
// brought down to the size the game shows them at, alpha kept. Area-averaged
// with premultiplied colour, so the dark edge does not bleed a halo.
//   node tools/make_sword_icons.js
const fs = require('fs'), path = require('path'), { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const JOBS = [
  { src: 'public/assets/signal_sword_src.png', out: 'public/assets/sword_single.png', w: 560 },
  { src: 'public/assets/both_swords_src.png',  out: 'public/assets/sword_pair.png',   w: 440 },
  // pistol bullet.png: the round in flight, and the magazine in the item box
  { src: 'public/assets/pistol_bullet_src.png', out: 'public/assets/pistol_bullet.png', w: 128 }
];

function trim(p) {
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function shrink(p, b, W) {
  const k = b.w / W, H = Math.max(1, Math.round(b.h / k));
  const out = new PNG({ width: W, height: H });
  for (let oy = 0; oy < H; oy++) for (let ox = 0; ox < W; ox++) {
    const sx0 = b.x0 + ox * k, sx1 = sx0 + k, sy0 = b.y0 + oy * k, sy1 = sy0 + k;
    let r = 0, g = 0, bl = 0, a = 0, wsum = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
      const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
      for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
        const wx = Math.min(x + 1, sx1) - Math.max(x, sx0), w = wx * wy;
        const i = (y * p.width + x) * 4, al = p.data[i + 3] / 255;
        r += p.data[i] * al * w; g += p.data[i + 1] * al * w; bl += p.data[i + 2] * al * w; a += al * w; wsum += w;
      }
    }
    const o = (oy * W + ox) * 4;
    out.data[o] = a ? r / a : 0; out.data[o + 1] = a ? g / a : 0; out.data[o + 2] = a ? bl / a : 0;
    out.data[o + 3] = Math.round(255 * a / wsum);
  }
  return out;
}

for (const j of JOBS) {
  const p = PNG.sync.read(fs.readFileSync(path.join(ROOT, j.src)));
  const b = trim(p);
  const out = shrink(p, b, j.w);
  fs.writeFileSync(path.join(ROOT, j.out), PNG.sync.write(out));
  console.log(j.out, out.width + 'x' + out.height);
}
