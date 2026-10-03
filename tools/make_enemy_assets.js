#!/usr/bin/env node
// Build build/enemy_assets.js — the creature sprites and their animations.
//
// Every frame of every clip is cut with ONE shared rectangle rather than its
// own bounds. Two reasons: a raised leg changes a frame's bounding box, so
// per-frame cropping would bob the creature as it walks; and the attacks throw
// out effects (a blood spray, an energy swirl) that are far wider than the
// body, which would otherwise rescale it mid-swing. Sharing the box keeps the
// feet on one line and the body one size across walk and attacks alike.
'use strict';
const fs = require('fs');
const path = require('path');
const { GifReader } = require('omggif');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const A = rel => path.join(ROOT, 'public/assets', rel);
const OUT = path.join(ROOT, 'build/enemy_assets.js');

// The art is drawn facing west, which is the direction an enemy walks when it
// is closing on a player to its left; the game flips it to face east.
const ENEMIES = {
  alien: {
    // The clip that loops with no drift is the walk; the two that resolve are
    // the attacks. Measured, not assumed — see the tools notes in the commit.
    clips: {
      walk:   'alien_walk_west.gif',
      lungeA: 'alien_lunge_a_west.gif',
      lungeB: 'alien_lunge_b_west.gif'
    },
    fps: { walk: 9, lungeA: 14, lungeB: 13 },
    loop: { walk: true, lungeA: false, lungeB: false }
  },

  // A thorny thing that lives on walls. It does not walk anywhere — it clings,
  // creeps along the brick and spits. The crawl is a true cycle (wrap 1.13);
  // the spit is one shot, the spray leaving its mouth over frames 2-6.
  crawler: {
    clips: {
      walk: 'crawler_crawl.gif',     // 'walk' is what the builder keys off
      spit: 'crawler_spit.gif'
    },
    fps: { walk: 10, spit: 12 },
    loop: { walk: true, spit: false }
  }
};

function decodeGif(file) {
  const gif = new GifReader(fs.readFileSync(file));
  const W = gif.width, H = gif.height;
  const canvas = new Uint8Array(W * H * 4);
  const frames = [];
  for (let i = 0; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i);
    const keep = info.disposal === 3 ? canvas.slice() : null;
    gif.decodeAndBlitFrameRGBA(i, canvas);
    frames.push(canvas.slice());
    if (info.disposal === 2) {
      for (let y = info.y; y < info.y + info.height; y++)
        for (let x = info.x; x < info.x + info.width; x++)
          canvas.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
    } else if (info.disposal === 3 && keep) canvas.set(keep);
  }
  return { W, H, frames };
}

function box(rgba, W, H) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (rgba[(y * W + x) * 4 + 3] > 40) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, maxX, minY, maxY };
}

const out = {};
for (const [name, cfg] of Object.entries(ENEMIES)) {
  const clips = {};
  for (const [key, file] of Object.entries(cfg.clips)) {
    if (!fs.existsSync(A(file))) { console.log('MISSING', file); continue; }
    const d = decodeGif(A(file));
    d.boxes = d.frames.map(f => box(f, d.W, d.H));
    clips[key] = d;
    console.log(`${name}.${key}: ${d.W}x${d.H} ${d.frames.length}f`);
  }
  if (!clips.walk) { console.log(`${name}: no walk clip, skipped`); continue; }

  // one rectangle enclosing every frame of every clip
  const all = Object.values(clips).flatMap(d => d.boxes);
  const S = {
    minX: Math.min.apply(null, all.map(b => b.minX)),
    maxX: Math.max.apply(null, all.map(b => b.maxX)),
    minY: Math.min.apply(null, all.map(b => b.minY)),
    maxY: Math.max.apply(null, all.map(b => b.maxY))
  };
  const CW = S.maxX - S.minX + 1, CH = S.maxY - S.minY + 1;

  // The body is measured off the walk, where nothing is throwing effects, so
  // the hitbox matches the creature and not its blood spray.
  const wb = clips.walk.boxes[0];
  const charH = wb.maxY - wb.minY + 1;
  const bw = Math.max(10, Math.round((wb.maxX - wb.minX + 1) * 0.5));
  const body = {
    w: bw,
    h: charH - 8,
    x: Math.round((CW - bw) / 2),
    y: wb.minY - S.minY + 4
  };

  const frames = {}, anims = {};
  for (const [key, d] of Object.entries(clips)) {
    const keys = d.frames.map((f, i) => {
      const png = new PNG({ width: CW, height: CH });
      for (let y = 0; y < CH; y++)
        for (let x = 0; x < CW; x++) {
          const si = ((S.minY + y) * d.W + (S.minX + x)) * 4;
          if (f[si + 3] <= 30) continue;
          const di = (y * CW + x) * 4;
          png.data[di] = f[si]; png.data[di + 1] = f[si + 1];
          png.data[di + 2] = f[si + 2]; png.data[di + 3] = f[si + 3];
        }
      const k = `${key}_${i}`;
      frames[k] = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
      return k;
    });
    anims[key] = { fps: cfg.fps[key] || 10, repeat: cfg.loop[key] ? -1 : 0, keys };
  }

  out[name] = { charH, canvasW: CW, canvasH: CH, body, frames, anims };
  console.log(`${name}: canvas ${CW}x${CH}, creature ${charH}px, ` +
    `${Object.keys(frames).length} frames, ${Object.keys(anims).length} anims`);
  console.log(`${name}: body ${JSON.stringify(body)}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '/* Enemy sprites */ window.ENEMIES = ' + JSON.stringify(out) + ';\n');
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
