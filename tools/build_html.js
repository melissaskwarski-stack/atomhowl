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
  // q:v 4 rather than 3. Every backdrop is inlined into the page, and the
  // page has a 30MB ceiling it has to stay under; across the six painted
  // stages this is most of half a megabyte for a difference nobody has picked
  // out on a moving background.
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', file, '-q:v', '4', dst]);
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
  // The double-jump-and-dash stage: one painting, and the stage reads its
  // ledges off it by fraction.
  dashstage:  ['public/assets/dash_stage.jpg'],
  // The street in front of the shop: a descent onto its pavement and a dark
  // way in under the TIENDA sign.
  shopstreet: ['public/assets/shop_street.jpg'],
  // The bridge. The backdrop IS the bridge — both roadways, their railings,
  // the arches and the ivy are painted into it — so the stage reads where
  // they are instead of drawing a second bridge over the top, which is what
  // it used to do and why there were two of them at two heights. Only the
  // span is separate, because it has to break in half and fall.
  // the new bridge.png (2048x768), which replaced bridge_bg.jpg
  bridgebg:   ['public/assets/bridge_new.png'],
  bridgespan: ['public/assets/bridge_span.png'],
  // ---- FOREGROUND LIST -------------------------------------------------
  // Add a line here to make a picture usable as foreground dressing. The name
  // on the left is what you then write as tex:'<name>' in a stage's props.
  // Put the PNG in public/assets first; transparency is kept, so trim it tight
  // and it will sit on the ground properly.
  // ---- THE STORE INTERIOR ----------------------------------------------
  // One painting and five props. The stage reads every surface off the
  // painting by fraction; the props are placed the same way.
  storeint:  ['public/assets/store_interior.png'],
  ledgeprop: ['public/assets/ledge_prop.png'],
  chest:     ['public/assets/chest.png'],
  // The opening clip as one horizontal strip of 12 frames, cut from the gif
  // to its painted box. CHEST_FRAMES in the game has to match the 12.
  chestopen: ['public/assets/chest_open_strip.png'],
  leveroff:  ['public/assets/lever_off.png'],
  leveron:   ['public/assets/lever_on.png'],
  // ---- THE STORAGE ROOMS -----------------------------------------------
  // Each room ships twice: the room as it is with the power off, and the same
  // room lit. The stage draws the dark one and reveals the lit one through a
  // mask, so a torch beam is a hole cut in the darkness rather than a yellow
  // shape laid over it — the light falls on the actual painted room.
  storage1dark: ['public/assets/storage1_dark.png'],
  storage1lit:  ['public/assets/storage1_lit.png'],
  storage2dark: ['public/assets/storage2_dark.png'],
  storage2lit:  ['public/assets/storage2_lit.png'],
  ropethin:     ['public/assets/alien_rope_thin.png'],
  ropebig:      ['public/assets/alien_rope_big.png'],
  // multiple alien rope.png, turned upright at build-prep time so the game
  // stretches it floor to ceiling without rotating a sprite
  ropemulti:    ['public/assets/alien_rope_multi.png'],
  // the pistol: lying on the floor where the creature drops it, and side-on
  // for the card that says you have it
  pistolfloor:  ['public/assets/pistol_floor.png'],
  pistolsprite: ['public/assets/pistol_sprite.png'],
  // sit and stand up enemy.gif, reversed so it sits and then rises: 17 frames
  // on one shared box. The `N = 17` in _buildCreature has to match.
  creaturerise: ['public/assets/creature_rise_strip.png'],
  // The alien's death (death enemy 1.gif, 25 frames) and its first stand in
  // the lit room (first encounter enemy.gif, 20 frames), each cut to a 5-wide
  // grid on one box shared by every frame, every frame stood on its own
  // lowest row. ALIEN_DEATH_SHEET / ALIEN_FACE_SHEET in the game describe the
  // grids and have to match them.
  aliendeath:   ['public/assets/alien_death_sheet.png'],
  alienface:    ['public/assets/alien_encounter_sheet.png'],
  // jump through window.gif, 17 frames on the walk's 247 box (ALIEN_JUMP_SHEET)
  alienjump:    ['public/assets/alien_window_jump.png'],
  // The tienda window: window glass.png baked to the window's shape (whole and
  // broken), and window shattered.png as a burst plus its shards cut apart.
  panewhole:    ['public/assets/tienda_pane.png'],
  panebroken:   ['public/assets/tienda_pane_broken.png'],
  glassshards:  ['public/assets/glass_shards.png'],
  glassburst:   ['public/assets/glass_burst.png'],
  // The bunker's food box: closed (closed box.png, trimmed and downscaled),
  // and open (cut from bunker new.png, where the painting has it).
  bunkerboxclosed: ['public/assets/bunker_box_closed.png'],
  bunkerboxopen:   ['public/assets/bunker_box_open.png'],
  // The burnt street's Twingo, in its three states: burning, blowing up, and
  // the wreck left behind. Each drawn at its own scale and position, so the
  // game locks them together on the wheels (TWINGO_ART in ah_game.js).
  twingocar:    ['public/assets/twingo_car.png'],
  twingoboom:   ['public/assets/twingo_boom.png'],
  twingowreck:  ['public/assets/twingo_wreck.png'],
  // fire.gif, 9 frames in a strip (FIRE_SHEET): the moving fire
  fxfire:       ['public/assets/fx_fire.png'],
  // Things to look at: the diary page in the village road, the shop owner's
  // portrait by the chest, and his clothes by the goo in storage two.
  letter:       ['public/assets/letter.png'],
  shopowner:    ['public/assets/shop_owner.png'],
  shopownerblur: ['public/assets/shop_owner_blur.png'],
  ownerclothes: ['public/assets/owner_clothes.png'],
  // Character effects. dash effect.png, re-cut into five even cells.
  fxdash:       ['public/assets/fx_dash_burst.png'],
  cine1:        ['public/assets/enemy_cine_1.jpg'],
  cine2:        ['public/assets/enemy_cine_2.jpg'],
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
  if (fs.existsSync(p('build/scene_assets2.js'))) {
    new Function('window', fs.readFileSync(p('build/scene_assets2.js'), 'utf8'))(sandbox.window);
  }
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

// Two files, not one. The hosted build is published file by file, and a
// single file may not pass 16MB; the scene art alone was heading past it. The
// keys are dealt into two halves by size, and the second half merges into the
// first when it loads.
const half = { a: {}, b: {} };
let sizeA = 0;
const LIMIT_A = 10.5 * 1024 * 1024;
for (const [k, uri] of Object.entries(scenes)) {
  if (sizeA + uri.length <= LIMIT_A) { half.a[k] = uri; sizeA += uri.length; }
  else half.b[k] = uri;
}
const sceneBlock =
  '/* Scene + monster art */ ' +
  `window.BG_DATA = ${JSON.stringify(prev.BG_DATA)}; ` +
  `window.MOBS = ${JSON.stringify(prev.MOBS)}; ` +
  `window.SCENES = ${JSON.stringify(half.a)};`;
const sceneBlock2 =
  '/* Scene art, second half */ ' +
  `window.SCENES = Object.assign(window.SCENES || {}, ${JSON.stringify(half.b)});`;
fs.writeFileSync(p('build/scene_assets.js'), sceneBlock);
fs.writeFileSync(p('build/scene_assets2.js'), sceneBlock2);
console.log(`scene art split: ${Object.keys(half.a).length} in scene_assets.js ` +
  `(${(sceneBlock.length / 1048576).toFixed(1)}MB), ${Object.keys(half.b).length} in ` +
  `scene_assets2.js (${(sceneBlock2.length / 1048576).toFixed(1)}MB)`);

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
  // "four enemies", under the first fight and the horde after it. 96k mono,
  // cover art stripped, for the same reason as the menu bed.
  fightMusic: [['public/assets/four_enemies_lite.mp3', 'audio/mpeg']],
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
// The handwriting on letters: Caveat (OFL), shipped with the game rather than
// fetched, so a letter reads the same offline and in the PC build.
const HAND = p('public/assets/fonts/caveat-latin-500.woff2');
if (fs.existsSync(HAND)) {
  fontFace += `@font-face{font-family:'Caveat';font-style:normal;font-weight:400 700;` +
              `font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(HAND).toString('base64')}) format('woff2');}`;
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
  sceneBlock2,
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
