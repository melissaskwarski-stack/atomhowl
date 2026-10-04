'use strict';
// fallen soldier.png -> the embankment's dead soldier, at game size, twice:
// with his rifle across his lap (soldier.png), and after the brothers have
// taken it (soldier_norifle.png): the rifle's dark steel and its tan furniture
// cleared from a band along it and filled from the uniform around it.
//   node tools/make_soldier.js
const fs = require('fs'), path = require('path'), { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public/assets/fallen_soldier_src.png');
const W = 560;
// the rifle in the source picture: stock end to muzzle, and how wide a band
// around that line it fills (the magazine hangs below it)
const RIFLE = { a: [345, 420], b: [1052, 765], half: 46, mag: [[575, 560], [665, 735]], guard: [[690, 555], [850, 645]], grip: [[690, 640], [780, 735]] };

const src = PNG.sync.read(fs.readFileSync(SRC));
function inBand(x, y) {
  const [ax, ay] = RIFLE.a, [bx, by] = RIFLE.b, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
  const px = ax + t * dx, py = ay + t * dy;
  const inBox = b => x >= b[0][0] && x <= b[1][0] && y >= b[0][1] && y <= b[1][1];
  return Math.hypot(x - px, y - py) <= RIFLE.half || inBox(RIFLE.mag) || inBox(RIFLE.guard) || inBox(RIFLE.grip);
}
// what reads as rifle: dark, near-grey steel; and the tan of its grips
function isRifle(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const steel = mx < 150 && mx - mn < 30;
  const tan = r > 120 && r < 215 && g > 90 && g < 170 && b < 110 && r - b > 50 && Math.abs(r - g) < 50;
  return steel || tan;
}
function noRifle(img) {
  const out = new PNG({ width: img.width, height: img.height });
  img.data.copy(out.data);
  const Wd = img.width, Hd = img.height, hole = new Uint8Array(Wd * Hd);
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const i = (y * Wd + x) * 4;
    if (out.data[i + 3] < 30 || !inBand(x, y)) continue;
    if (isRifle(out.data[i], out.data[i + 1], out.data[i + 2])) hole[y * Wd + x] = 1;
  }
  // grow the hole a little so the rifle's outline goes with it
  const grown = new Uint8Array(hole);
  for (let y = 2; y < Hd - 2; y++) for (let x = 2; x < Wd - 2; x++) if (hole[y * Wd + x])
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inBand(x + dx, y + dy)) grown[(y + dy) * Wd + x + dx] = 1;
  // fill by carrying the uniform across: each pixel of the rifle takes the
  // one a band-width beside it (above it first, the chest and arm; else below
  // it, the legs), so the camouflage continues instead of smearing
  const [ax, ay] = RIFLE.a, [bx, by] = RIFLE.b, L = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / L, ny = (bx - ax) / L, off = RIFLE.half + 18;
  const okAt = (x, y) => { x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= Wd || y >= Hd) return -1;
    const k = y * Wd + x; return (!grown[k] && out.data[k * 4 + 3] > 200) ? k : -1; };
  const fills = [];
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const k = y * Wd + x; if (!grown[k]) continue;
    let q = -1;
    for (const d of [off, -off, off * 1.5, -off * 1.5, off * 2, -off * 2]) { q = okAt(x - nx * d, y - ny * d); if (q >= 0) break; }
    fills.push([k, q]);
  }
  fills.forEach(([k, q]) => { const j = k * 4;
    if (q < 0) { out.data[j + 3] = 0; return; }
    for (let c = 0; c < 4; c++) out.data[j + c] = img.data[q * 4 + c]; });
  // a little texture back in, so the patch is not a smear
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) if (hole[y * Wd + x]) {
    const j = (y * Wd + x) * 4, n = ((x * 7 + y * 13) % 9) - 4;
    out.data[j] = Math.max(0, Math.min(255, out.data[j] + n * 2)); out.data[j + 1] = Math.max(0, Math.min(255, out.data[j + 1] + n * 2));
  }
  return out;
}
function shrink(p, Wout) {
  const k = p.width / Wout, Hout = Math.round(p.height / k), out = new PNG({ width: Wout, height: Hout });
  for (let oy = 0; oy < Hout; oy++) for (let ox = 0; ox < Wout; ox++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = Math.floor(oy * k); y < Math.floor((oy + 1) * k); y++) for (let x = Math.floor(ox * k); x < Math.floor((ox + 1) * k); x++) {
      const i = (y * p.width + x) * 4, al = p.data[i + 3] / 255;
      r += p.data[i] * al; g += p.data[i + 1] * al; b += p.data[i + 2] * al; a += al; n++;
    }
    const o = (oy * Wout + ox) * 4;
    if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
    out.data[o + 3] = Math.round(255 * a / n);
  }
  return out;
}
fs.writeFileSync(path.join(ROOT, 'public/assets/soldier.png'), PNG.sync.write(shrink(src, W)));
fs.writeFileSync(path.join(ROOT, 'public/assets/soldier_norifle.png'), PNG.sync.write(shrink(noRifle(src), W)));
console.log('soldier.png and soldier_norifle.png', W + 'px wide');
