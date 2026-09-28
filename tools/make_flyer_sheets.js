#!/usr/bin/env node
// The flying creature of the night street, cut out of its gifs onto grid
// sheets the game slices by frame index, plus its spike shrunk to game size.
//
//   better fly and spit.gif  16 frames, side on, facing east: it glides with
//                            a slow bob (0-4), a red charge fills its mouth
//                            (5-8), the spikes burst out of it (9) and the
//                            spray spreads (10-15). Flying and spitting are
//                            one clip, so they are one sheet with one box:
//                            the body never jumps between the two.
//   death of enemy 2.gif     25 frames: it melts to red (0-16), then its
//                            head drops and splashes (17-24). Only the melt
//                            is kept: the game dissolves the body after it
//                            and leaves a pool of its own.
//
// Every clip keeps ONE box across its frames, so the body never slides inside
// its cell, and both share the gifs' own scale (they are drawn to it).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib/clipcut');
const { PNG } = L;

const ROOT = path.resolve(__dirname, '..');
const A = f => path.join(ROOT, 'public/assets', f);
const CLIPS = [
  { name: 'fly',   src: 'flyer_flyspit.gif', out: 'flyer_flyspit_sheet.png', frames: null, cols: 8 },
  { name: 'death', src: 'flyer_death.gif',   out: 'flyer_death_sheet.png',   frames: [0, 16], cols: 9 },
];
const PAD = 2;

const meta = {};
for (const c of CLIPS) {
  const d = L.decodeGif(A(c.src));
  d.frames.forEach(f => L.stripMatte(f, d.W, d.H));
  const frames = c.frames ? d.frames.slice(c.frames[0], c.frames[1] + 1) : d.frames;
  const boxes = frames.map(f => L.bbox(f, d.W, d.H));
  const x0 = Math.max(0, Math.min(...boxes.map(b => b.minX)) - PAD);
  const x1 = Math.min(d.W - 1, Math.max(...boxes.map(b => b.maxX)) + PAD);
  const y0 = Math.max(0, Math.min(...boxes.map(b => b.minY)) - PAD);
  const y1 = Math.min(d.H - 1, Math.max(...boxes.map(b => b.maxY)) + PAD);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, n = frames.length;
  const cols = Math.min(c.cols, n), rows = Math.ceil(n / cols);
  const sheet = new PNG({ width: cw * cols, height: ch * rows });
  frames.forEach((f, i) => {
    const gx = (i % cols) * cw, gy = Math.floor(i / cols) * ch;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * d.W + x0 + x) * 4;
      if (f[si + 3] <= 30) continue;
      const di = ((gy + y) * sheet.width + gx + x) * 4;
      sheet.data[di] = f[si]; sheet.data[di + 1] = f[si + 1]; sheet.data[di + 2] = f[si + 2]; sheet.data[di + 3] = 255;
    }
  });
  fs.writeFileSync(A(c.out), PNG.sync.write(sheet));
  meta[c.name] = { n, cols, cw, ch, ox: x0, oy: y0, frames };
  console.log(`${c.name}: ${n} frames of ${cw}x${ch} (gif box x${x0}-${x1} y${y0}-${y1}) -> ${c.out} ` +
              `${Math.round(fs.statSync(A(c.out)).size / 1024)}KB`);
}

// Where things are, in each sheet cell's own pixels. The body is the skull
// between the wings, read off a grid crop of frame 0 at gif (128, 125); the
// mouth is where the spray starts in frame 8, the first frame it is out.
{
  const m = meta.fly, f = m.frames[8];
  let x0 = 1e9, y0 = 1e9;
  for (let i = 0; i < f.length; i += 4) {
    if (f[i + 3] > 100 && f[i] > 170 && f[i + 1] < 110 && f[i + 2] < 80) {
      const x = (i / 4) % 256, y = Math.floor(i / 4 / 256);
      if (x < x0) { x0 = x; y0 = y; }
    }
  }
  console.log(`fly body centre (cell px): x ${128 - m.ox}, y ${125 - m.oy}`);
  console.log(`fly mouth (cell px): x ${x0 - m.ox}, y ${y0 - m.oy}`);
}
{
  const m = meta.death, bx = L.bbox(m.frames[0], 256, 256);
  console.log(`death feet (cell px): x ${Math.round((bx.minX + bx.maxX) / 2) - m.ox}, y ${bx.maxY - m.oy}, standing height ${bx.maxY - bx.minY + 1}`);
}

// The spike: trimmed to its drawing and box-filtered down to 300px long.
{
  const src = PNG.sync.read(fs.readFileSync(A('flyer_spike_src.png')));
  const b = L.bbox(src.data, src.width, src.height);
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1, W2 = 300, k = w / W2, H2 = Math.round(h / k);
  const out = new PNG({ width: W2, height: H2 });
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const acc = [0, 0, 0, 0]; let n = 0;
    for (let sy = Math.floor(y * k); sy < Math.floor((y + 1) * k); sy++)
      for (let sx = Math.floor(x * k); sx < Math.floor((x + 1) * k); sx++) {
        const si = ((b.minY + sy) * src.width + b.minX + sx) * 4, a = src.data[si + 3] / 255;
        acc[0] += src.data[si] * a; acc[1] += src.data[si + 1] * a; acc[2] += src.data[si + 2] * a; acc[3] += a; n++;
      }
    const di = (y * W2 + x) * 4;
    if (acc[3] > 0) { out.data[di] = acc[0] / acc[3]; out.data[di + 1] = acc[1] / acc[3]; out.data[di + 2] = acc[2] / acc[3]; }
    out.data[di + 3] = Math.round(255 * acc[3] / Math.max(1, n));
  }
  fs.writeFileSync(A('flyer_spike.png'), PNG.sync.write(out));
  console.log(`spike: ${w}x${h} -> ${W2}x${H2}, points east`);
}
