#!/usr/bin/env node
// Assemble the single-file build: atomhowl.html
//
// Everything is inlined so the game runs from a file:// URL with no server
// and no network — Phaser, the character frames, the zombie cycles, the
// scene art and the game itself.
//
// Scene backgrounds are re-embedded from public/assets on every build so
// swapping a painting is just a matter of dropping in the file. Monster art
// and the fallback backdrop are carried forward from build/scene_assets.js.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const p = rel => path.join(ROOT, rel);
const OUT = p('atomhowl.html');

// ---------- data URIs (uploads are sometimes JPEGs named .png) ----------
function toDataUri(file) {
  const buf = fs.readFileSync(file);
  const mime = buf[0] === 0xFF && buf[1] === 0xD8 ? 'image/jpeg'
             : buf[0] === 0x47 && buf[1] === 0x49 ? 'image/gif'
             : 'image/png';
  return `data:${mime};base64,` + buf.toString('base64');
}

// first path that exists wins
const SCENE_SRC = {
  menu:      ['public/assets/atomhowl-menu.png', 'atomhowl-menu.png', 'atomic-howl-menu.png'],
  bunker:    ['public/assets/bunker2.png', 'bunker2.png', 'bunker.png'],
  city:      ['public/assets/city.png', 'city.png', 'city-1.png'],
  shop:      ['shops.png', 'public/assets/shops.png'],
  shopfront: ['public/assets/shop.png', 'shop.png'],
  combat:    ['main.png', 'public/assets/main.png', 'public/assets/background.png']
};

// carry forward what the previous build embedded
let prev = { BG_DATA: null, MOBS: {}, SCENES: {} };
if (fs.existsSync(p('build/scene_assets.js'))) {
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(p('build/scene_assets.js'), 'utf8'))(sandbox.window);
  prev = {
    BG_DATA: sandbox.window.BG_DATA || null,
    MOBS: sandbox.window.MOBS || {},
    SCENES: sandbox.window.SCENES || {}
  };
}

const scenes = {};
for (const [key, candidates] of Object.entries(SCENE_SRC)) {
  const hit = candidates.map(p).find(fs.existsSync);
  if (hit) {
    scenes[key] = toDataUri(hit);
    console.log(`scene "${key}" <- ${path.relative(ROOT, hit)}`);
  } else if (prev.SCENES[key]) {
    scenes[key] = prev.SCENES[key];
    console.log(`scene "${key}" (kept from previous build)`);
  } else {
    console.log(`scene "${key}" MISSING — procedural fallback`);
  }
}

const sceneBlock =
  '/* Scene + monster art */ ' +
  `window.BG_DATA = ${JSON.stringify(prev.BG_DATA)}; ` +
  `window.MOBS = ${JSON.stringify(prev.MOBS)}; ` +
  `window.SCENES = ${JSON.stringify(scenes)};`;
fs.writeFileSync(p('build/scene_assets.js'), sceneBlock);

// ---------- assemble ----------
const read = rel => fs.readFileSync(p(rel), 'utf8');
const blocks = [
  read('vendor/phaser.min.js'),
  read('build/ew_assets.js'),
  read('build/zomb_assets.js'),
  sceneBlock,
  '/* ATOMHOWL game */\n' + read('src_game/ah_game.js')
];

const html =
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ATOMHOWL</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0807; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
canvas { display: block; }
</style>
</head>
<body>
` + blocks.map(b => `<script>${b}</script>`).join('\n') + `
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`Built: ${OUT} (${(html.length / 1048576).toFixed(2)} MB)`);
