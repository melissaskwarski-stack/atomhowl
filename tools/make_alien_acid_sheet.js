#!/usr/bin/env node
// enemy acid attack.gif -> public/assets/alien_acid_sheet.png
//
// The berserker's attack: 9 frames — it rears back with its claws (0-5),
// then acid bursts in a swirl round its body (6-8). Cut onto the alien walk's
// own 247x247 box with its feet on the walk's floor row (245) and its soles on
// the walk's soles column, every frame by the same shift, so the clip plays on
// the walking sprite itself without the body jumping.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib/clipcut');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public/assets/alien_acid_attack.gif');
const OUT = path.join(ROOT, 'public/assets/alien_acid_sheet.png');
const CELL = 247, FOOT = 245, SOLES = 127.6;    // the walk frame's

const d = L.decodeGif(SRC);
d.frames.forEach(f => L.stripMatte(f, d.W, d.H));
const b0 = L.bbox(d.frames[0], d.W, d.H);
const dx = Math.round(SOLES - L.solesX(d, 0)), dy = FOOT - b0.maxY;
const n = d.frames.length;
const out = new PNG({ width: CELL * n, height: CELL });
d.frames.forEach((f, i) => {
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) {
    const si = (y * d.W + x) * 4;
    if (f[si + 3] <= 30) continue;
    const tx = x + dx, ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= CELL || ty >= CELL) continue;
    const di = (ty * out.width + i * CELL + tx) * 4;
    out.data[di] = f[si]; out.data[di + 1] = f[si + 1]; out.data[di + 2] = f[si + 2]; out.data[di + 3] = 255;
  }
});
fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`${n} frames, shift ${dx},${dy} -> ${path.relative(ROOT, OUT)} (${out.width}x${out.height})`);
