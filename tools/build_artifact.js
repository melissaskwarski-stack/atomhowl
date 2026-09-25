#!/usr/bin/env node
// Build build/hosted/ — the same game, published as a web page instead of one
// downloadable file.
//
// atomhowl.html inlines everything as data URIs because it is opened straight
// off disk, where a relative path resolves against wherever the file landed and
// fails. A hosted page has an origin, so none of that is necessary: the assets
// ship as ordinary files beside the page, which drops the base64 tax (a data
// URI is 1.37x its own bytes) and keeps the page itself small enough to
// publish, since a page is capped where its sibling files are not.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const p = rel => path.join(ROOT, rel);
const OUT = p('build/hosted');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copy = (from, to) => {
  fs.copyFileSync(p(from), path.join(OUT, to));
  return fs.statSync(path.join(OUT, to)).size;
};

// ---------- scripts, in load order ----------
const SCRIPTS = [
  ['vendor/phaser.min.js',     'phaser.min.js'],
  ['build/ew_assets.js',       'ew_assets.js'],
  ['build/wf_assets.js',       'wf_assets.js'],
  ['build/enemy_assets.js',    'enemy_assets.js'],
  ['build/zomb_assets.js',     'zomb_assets.js'],
  ['build/ui_assets.js',       'ui_assets.js'],
  ['build/scene_assets.js',    'scene_assets.js'],
  ['src_game/ah_game.js',      'ah_game.js']
];

// ---------- media as real files ----------
// The one place the hosted build genuinely differs: window.MEDIA carries paths
// rather than data URIs, which takes ~4MB of base64 out of the page.
const MEDIA = {
  menuVideo: [['public/assets/main_menu_video.webm', 'main_menu_video.webm']],
  menuMusic: [['public/assets/Atom_howl_intro_lite.mp3', 'intro.mp3']],
  fightMusic: [['public/assets/four_enemies_lite.mp3', 'four_enemies.mp3']]
};

const files = [];
let total = 0;

const mediaMap = {};
for (const [key, list] of Object.entries(MEDIA)) {
  mediaMap[key] = [];
  for (const [src, name] of list) {
    if (!fs.existsSync(p(src))) continue;
    total += copy(src, name);
    files.push(name);
    mediaMap[key].push(name);
  }
}

fs.writeFileSync(path.join(OUT, 'media.js'),
  '/* Media, as files beside the page */ window.MEDIA = ' + JSON.stringify(mediaMap) + ';\n');
files.push('media.js');

// ---------- dialogue voice ----------
// A clip per line, shipped as ordinary files. Not one take seeked into: a plain
// <audio> reports seekable [0,0] unless the host answers range requests, so
// seeking played the top of the take over every line.
const VOICE_SRC = 'public/assets/voice';
const voice = {}, voiceMs = {};
if (fs.existsSync(p(VOICE_SRC))) {
  const durs = fs.existsSync(p(VOICE_SRC + '/durations.json'))
    ? JSON.parse(fs.readFileSync(p(VOICE_SRC + '/durations.json'), 'utf8')) : {};
  fs.readdirSync(p(VOICE_SRC)).filter(f => f.endsWith('.mp3')).sort().forEach(f => {
    const id = path.basename(f, '.mp3');
    total += copy(VOICE_SRC + '/' + f, f);
    files.push(f);
    voice[id] = f;
    if (durs[id]) voiceMs[id] = Math.round(durs[id] * 1000);
  });
  console.log(`voice: ${Object.keys(voice).length} lines as files`);
}
fs.writeFileSync(path.join(OUT, 'voice.js'),
  '/* Dialogue voice */ window.VOICE = ' + JSON.stringify(voice) +
  '; window.VOICE_MS = ' + JSON.stringify(voiceMs) + ';\n');
files.push('voice.js');

// The sandbox ships: this is the build being played to give feedback on.
fs.writeFileSync(path.join(OUT, 'devflag.js'), '/* Build mode */ window.ATOMHOWL_DEV = true;\n');
files.push('devflag.js');

// ---------- the typeface ----------
// A canvas cannot draw with a face the document has not loaded, so the UI font
// is still inlined — it is 13KB, which is nothing against the frame pools.
let fontFace = '';
const FONT = p('public/assets/fonts/chakrapetch.woff2');
if (fs.existsSync(FONT)) {
  const b64 = fs.readFileSync(FONT).toString('base64');
  fontFace = `@font-face{font-family:'AtomUI';font-style:normal;font-weight:400 900;` +
             `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

for (const [src, name] of SCRIPTS) {
  total += copy(src, name);
  files.push(name);
}

const order = ['phaser.min.js', 'ew_assets.js', 'wf_assets.js', 'enemy_assets.js',
               'zomb_assets.js', 'ui_assets.js', 'scene_assets.js',
               'media.js', 'voice.js', 'devflag.js', 'ah_game.js'];

// Shown in the page header so it is possible to tell at a glance whether the
// build in front of you is the one that was just published.
const BUILD_ID = crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(OUT, 'ah_game.js')))
  .digest('hex').slice(0, 7) + ' &middot; ' + new Date().toISOString().slice(0, 16).replace('T', ' ');

const html = `<meta http-equiv="Cache-Control" content="no-store, max-age=0">
<meta http-equiv="Pragma" content="no-cache">
<title>ATOMHOWL</title>
<style>
${fontFace}
:root{
  --ink:#f0e6d4; --dim:#a08d72; --faint:#6c5c47;
  --ground:#0a0807; --panel:#141010; --edge:#2a2119; --ember:#f2b13c;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:'AtomUI',ui-sans-serif,system-ui,sans-serif;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:14px; padding-block:18px; padding-left:16px; padding-right:16px;
}
/* As big as the window allows, still 16:9, leaving room for the header and
   the key legend. It was capped at 1280px, so a 1080p screen never got more. */
:root{ --gw: min(100%, calc((100vh - 150px) * 16 / 9)); }
#game{width:var(--gw); aspect-ratio:16/9; background:#000;
  border:1px solid var(--edge); box-shadow:0 18px 60px rgba(0,0,0,.65);}
#game canvas{display:block; width:100%!important; height:100%!important;}
.legend{width:var(--gw); display:flex; flex-wrap:wrap; gap:6px 22px;
  font-size:11px; font-weight:600; letter-spacing:.06em; color:var(--faint);}
.legend b{color:var(--dim); font-weight:700}
/* The sword is locked until the chest in the tienda. It reads dimmed until
   then and lights up the moment the blades are taken, so the legend is
   telling the truth about what the buttons do. */
.legend .sword{opacity:.34}
.legend .sword::after{content:' (LOCKED)'; color:var(--faint); font-size:10px}
.legend .sword.on{opacity:1}
.legend .sword.on::after{content:''}
.legend .k{color:var(--ember); font-weight:700}
h1{margin:0; font-size:13px; font-weight:700; letter-spacing:.34em; color:var(--dim);
  width:var(--gw);}
h1 span{color:var(--faint); letter-spacing:.08em; font-weight:600; float:right}
@media (max-width:520px){ h1 span{display:none} }
</style>

<h1>ATOMHOWL <span>build ${BUILD_ID} &middot; click once for sound</span></h1>
<div id="game"></div>
<div class="legend">
  <span><b>MOVE</b> <span class="k">A D</span></span>
  <span><b>RUN</b> hold <span class="k">SHIFT</span></span>
  <span><b>JUMP</b> <span class="k">W</span> / <span class="k">SPACE</span></span>
  <span><b>DOOR</b> <span class="k">E</span></span>
  <span><b>CROUCH</b> <span class="k">S</span></span>
  <span><b>DASH</b> tap <span class="k">SHIFT</span></span>
  <span><b>FIRE</b> <span class="k">LMB</span> / <span class="k">K</span></span>
  <span><b>AIM 45&deg;</b> <span class="k">UP</span> + FIRE</span>
  <span><b>WEAPON</b> <span class="k">E</span></span>
  <span class="sword"><b>SWORD</b> <span class="k">F</span> / <span class="k">RMB</span></span>
  <span><b>SANDBOX</b> <span class="k">F9</span></span>
  <span><b>RESTART STAGE</b> <span class="k">R</span></span>
  <span><b>FULLSCREEN</b> <span class="k">ALT</span>+<span class="k">ENTER</span></span>
  <span><b>MUTE</b> <span class="k">N</span></span>
  <span><b>MENU</b> <span class="k">ESC</span></span>
  <span><b>SKIP DIALOGUE</b> <span class="k">ENTER</span> / click SKIP</span>
  <span><b>PROP EDITOR</b> <span class="k">M</span> toggle &middot; drag &middot; <span class="k">O</span> export</span>
  <span><b>CONTROLLER</b> <span class="k">F10</span> tester &middot; Xbox pad supported</span>
</div>
` + order.map(f => {
  // charset on every tag: these are separate files now, and a script without
  // one is decoded with whatever the document happens to be using. The caret
  // in the menu came through as mojibake locally because of exactly that.
  //
  // ?v= is the file's own content hash, and it is not optional. The page is
  // republished to one fixed URL, so every sibling file keeps its name from
  // build to build — and the browser, having no reason to think ah_game.js
  // changed, serves the copy it already has. The page updates and the game
  // does not, which reads as the publish having silently failed. A name that
  // changes with the bytes is what forces the refetch.
  const full = path.join(OUT, f);
  if (!fs.existsSync(full)) return '';
  const v = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex').slice(0, 10);
  return `<script src="${f}?v=${v}" charset="utf-8"></script>`;
}).filter(Boolean).join('\n') + '\n';

fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log('hosted build ->', path.relative(ROOT, OUT));
order.forEach(f => {
  const n = path.join(OUT, f);
  if (fs.existsSync(n)) console.log('  ' + f.padEnd(20), (fs.statSync(n).size / 1048576).toFixed(2) + ' MB');
});
console.log('  ' + 'index.html'.padEnd(20), (fs.statSync(path.join(OUT, 'index.html')).size / 1024).toFixed(0) + ' KB');
const all = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log('total', (all / 1048576).toFixed(2), 'MB across', fs.readdirSync(OUT).length, 'files');
