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

const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');
const FFMPEG = require('ffmpeg-static');
const TMP = p('build/.htmltmp');

// ---------- data URIs (uploads are sometimes JPEGs named .png) ----------
function toDataUri(file, mimeOverride) {
  const buf = fs.readFileSync(file);
  const mime = mimeOverride
            || (buf[0] === 0xFF && buf[1] === 0xD8 ? 'image/jpeg'
              : buf[0] === 0x47 && buf[1] === 0x49 ? 'image/gif'
              : 'image/png');
  return `data:${mime};base64,` + buf.toString('base64');
}

function isOpaque(buf) {
  try {
    const png = PNG.sync.read(buf);
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] < 250) return false;
    return true;
  } catch (e) { return false; }
}

// A painted backdrop carries no transparency, so PNG is spending megabytes
// storing a photograph losslessly. Every backdrop is inlined into the page, so
// that cost is paid in the download: as JPEG they are visually identical and
// roughly a tenth the size. Anything with real alpha stays PNG.
function encodeScene(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xFF && buf[1] === 0xD8) return toDataUri(file);      // already JPEG
  if (!isOpaque(buf)) return toDataUri(file);                          // needs alpha
  fs.mkdirSync(TMP, { recursive: true });
  const dst = path.join(TMP, path.basename(file, path.extname(file)) + '.jpg');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', file, '-q:v', '3', dst]);
  return toDataUri(dst, 'image/jpeg');
}

// first path that exists wins
const SCENE_SRC = {
  // No `menu` entry: the menu is the video now, and the old painted still that
  // used to sit behind it was showing through past the clip's edges. Dropping
  // it takes 2.2MB out of the page as well.
  exit:      ['public/assets/tutorial_exit.png', 'tutorial_exit.png'],
  jump:      ['public/assets/tutorial_jump.png', 'tutorial_jump.png'],
  wallblue:  ['public/assets/wall_blue.png'],
  // The bridge stage, in three layers: the valley behind it, the roadway on
  // each side of the ravine (one picture holding both, with an empty band
  // between them), and the section that spans the band. The stage reads its
  // own geometry back off these — the lip of the painted roadway is where the
  // hole in the floor starts — so redrawing them moves the stage with them.
  // The double-jump-and-dash stage: one painting, and the stage reads its
  // ledges off it by fraction.
  dashstage:  ['public/assets/dash_stage.jpg'],
  bridgebg:   ['public/assets/bridge_bg.jpg'],
  bridgeends: ['public/assets/bridge_ends.png'],
  bridgespan: ['public/assets/bridge_span.png'],
  // ---- FOREGROUND LIST -------------------------------------------------
  // Add a line here to make a picture usable as foreground dressing. The name
  // on the left is what you then write as tex:'<name>' in a stage's props.
  // Put the PNG in public/assets first; transparency is kept, so trim it tight
  // and it will sit on the ground properly.
  deadplant: ['public/assets/dead_plant.png'],
  deadlog:   ['public/assets/dead_log.png'],
  // ----------------------------------------------------------------------
  bunker:    ['public/assets/bunker_wide.png', 'public/assets/bunker2.png', 'bunker2.png', 'bunker.png'],
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
    scenes[key] = encodeScene(hit);
    console.log(`scene "${key}" <- ${path.relative(ROOT, hit)}` +
      ` (${Math.round(scenes[key].length / 1024)}KB inline)`);
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

// ---------- media ----------
// Inlined, not referenced. The page is opened straight off disk as a single
// downloaded file, so a relative src resolves against wherever that file
// landed and fails — which silently drops the menu back to the still image
// with no sound. A data: URI travels with the page and always resolves.
//
// Each entry lists every encode that exists, best-supported first, and the
// browser keeps the first it can decode: VP9/WebM covers Chromium builds
// shipped without the patented decoders, H.264/MP4 covers Safari.
const MEDIA_SRC = {
  menuVideo: [['public/assets/main_menu_video.webm', 'video/webm'],
              ['public/assets/main_menu_video.mp4',  'video/mp4']],
  // 96k mono: it is a looping bed under a menu, and the stereo master was
  // 4.3MB of the page once base64'd.
  menuMusic: [['public/assets/Atom_howl_intro_lite.mp3', 'audio/mpeg'],
              ['public/assets/Atom_howl_intro_web.mp3',  'audio/mpeg'],
              ['public/assets/Atom_howl_intro.mp3',      'audio/mpeg']],
};

// ---------- dialogue voice ----------
// One clip per line, cut from the scene's single take by tools/cut_voice.js.
// Not one file seeked into: a plain <audio> reports seekable [0,0] unless the
// host answers range requests, so seeking silently played the top of the take
// over every line.
const VOICE_DIR = 'public/assets/voice';
const voice = {}, voiceMs = {};
if (fs.existsSync(p(VOICE_DIR))) {
  const durs = fs.existsSync(p(VOICE_DIR + '/durations.json'))
    ? JSON.parse(fs.readFileSync(p(VOICE_DIR + '/durations.json'), 'utf8')) : {};
  fs.readdirSync(p(VOICE_DIR)).filter(f => f.endsWith('.mp3')).sort().forEach(f => {
    const id = path.basename(f, '.mp3');
    voice[id] = toDataUri(p(VOICE_DIR + '/' + f), 'audio/mpeg');
    if (durs[id]) voiceMs[id] = Math.round(durs[id] * 1000);
  });
  const kb = Math.round(Object.values(voice).reduce((n, u) => n + u.length, 0) / 1024);
  console.log(`voice: ${Object.keys(voice).length} lines (${kb}KB inline)`);
}
const voiceBlock = `/* Dialogue voice */ window.VOICE = ${JSON.stringify(voice)}; ` +
                   `window.VOICE_MS = ${JSON.stringify(voiceMs)};`;
const media = {};
for (const [key, candidates] of Object.entries(MEDIA_SRC)) {
  const hits = candidates.filter(([rel]) => fs.existsSync(p(rel)));
  if (!hits.length) { console.log(`media "${key}" MISSING — scene falls back`); continue; }
  // Only the first encode goes in. The rest are the same clip again in
  // another container, and inlined that is megabytes of page for a format the
  // first already plays — the menu video's H.264 twin alone is 1.7MB base64,
  // and it exists only for Safari. The hosted build ships every encode, since
  // there the browser fetches the one it wants and the others cost nothing.
  media[key] = [toDataUri(p(hits[0][0]), hits[0][1])];
  const kb = Math.round(media[key][0].length / 1024);
  const rest = hits.slice(1).map(h => path.basename(h[0]));
  console.log(`media "${key}" <- ${path.basename(hits[0][0])} (${kb}KB inline)` +
    (rest.length ? `  [${rest.join(', ')} left out of the single file]` : ''));
}
const mediaBlock = `/* Streamed media paths */ window.MEDIA = ${JSON.stringify(media)};`;

// ---------- build mode ----------
// Development builds carry the debug sandbox — its menu entry and its hotkey.
// `node tools/build_html.js --release` clears the flag, which removes both
// without the game code needing a second code path.
const DEV = !process.argv.includes('--release');
const devBlock = `/* Build mode */ window.ATOMHOWL_DEV = ${DEV};`;
console.log(`build mode: ${DEV ? 'development (sandbox reachable)' : 'release (sandbox stripped)'}`);

// ---------- UI typeface ----------
// The UI face ships inline as base64: a canvas cannot draw with a face the
// document has not loaded, and a webfont URL would not resolve on file://.
// One variable woff2 covers every weight the UI asks for.
let fontFace = '';
const FONT = p('public/assets/fonts/chakrapetch.woff2');
if (fs.existsSync(FONT)) {
  const b64 = fs.readFileSync(FONT).toString('base64');
  fontFace =
    `@font-face{font-family:'AtomUI';font-style:normal;font-weight:400 900;` +
    `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  console.log(`font "AtomUI" <- ${path.relative(ROOT, FONT)} (${Math.round(b64.length / 1024)}KB inline)`);
} else {
  console.log('font "AtomUI" MISSING — UI falls back to a system sans');
}

// ---------- assemble ----------
const read = rel => fs.readFileSync(p(rel), 'utf8');
const blocks = [
  read('vendor/phaser.min.js'),
  read('build/ew_assets.js'),
  read('build/wf_assets.js'),
  read('build/enemy_assets.js'),
  read('build/zomb_assets.js'),
  read('build/ui_assets.js'),
  sceneBlock,
  mediaBlock,
  voiceBlock,
  devBlock,
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
${fontFace}
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
