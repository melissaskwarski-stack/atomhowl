#!/usr/bin/env node
// The embankment's props, trimmed to what is painted and shrunk to the size
// the game draws them at (the uploads are 1-2k px for a thing a few dozen px
// on screen):
//   first granade.png     -> grenade.png       the grenade: pickup, HUD, thrown
//   granade explosion.png -> grenade_boom.png  the blast
//   wall granade.png      -> girder_wall.png   the fallen girder across the way
'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const L = require('./lib/clipcut');
const A = f => path.join(path.resolve(__dirname, '..'), 'public/assets', f);

function shrink(src, dst, maxW, maxH) {
  const im = PNG.sync.read(fs.readFileSync(A(src)));
  const b = L.bbox(im.data, im.width, im.height);
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  const k = Math.max(w / maxW, h / maxH, 1);
  const W = Math.round(w / k), H = Math.round(h / k);
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0, 0]; let n = 0;
    for (let sy = Math.floor(y * k); sy < Math.min(h, Math.floor((y + 1) * k)); sy++)
      for (let sx = Math.floor(x * k); sx < Math.min(w, Math.floor((x + 1) * k)); sx++) {
        const i = ((b.minY + sy) * im.width + b.minX + sx) * 4, a = im.data[i + 3] / 255;
        acc[0] += im.data[i] * a; acc[1] += im.data[i + 1] * a; acc[2] += im.data[i + 2] * a; acc[3] += a; n++;
      }
    const i = (y * W + x) * 4;
    if (acc[3] > 0) { out.data[i] = acc[0] / acc[3]; out.data[i + 1] = acc[1] / acc[3]; out.data[i + 2] = acc[2] / acc[3]; }
    out.data[i + 3] = Math.round(255 * acc[3] / Math.max(1, n));
  }
  fs.writeFileSync(A(dst), PNG.sync.write(out));
  console.log(`${src}: painted ${w}x${h} -> ${dst} ${W}x${H} ${Math.round(fs.statSync(A(dst)).size / 1024)}KB`);
}
shrink('grenade_src.png', 'grenade.png', 96, 96);
shrink('grenade_boom_src.png', 'grenade_boom.png', 520, 520);
shrink('girder_wall_src.png', 'girder_wall.png', 300, 440);
