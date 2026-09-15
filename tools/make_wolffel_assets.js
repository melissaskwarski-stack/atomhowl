#!/usr/bin/env node
// Build build/wf_assets.js — Wolffel, the second playable brother.
//
// He has far less art than Eterwolf: an idle, a walk, a sprint, the burger he
// digs out of his side pocket when he is left standing, and one arm-extend that
// stands in for firing. The game fills the gaps by falling back along a chain
// (no dash art -> run, no jump art -> run, and so on), which is what lets a
// character be dropped into the sandbox before its set is finished.
//
// All of it is drawn facing east or south-east, so every west animation is a
// mirrored copy baked here — the directional player expects a real 'W' key to
// exist rather than flipping the sprite at runtime.
//
// Two of the clips are one-shot actions rather than cycles, and each is emitted
// twice: '<name>in' plays the whole thing once and chains into '<name>', which
// loops the settled tail. The burger's tail is the chew, and it ping-pongs
// (4,5,6,5) because three frames of a hand at a mouth do not wrap — retracing
// them has no seam at all, which scoring the wrap discontinuity could not beat
// (best straight loop scored 1.55; Eterwolf's guitar, for reference, is 1.12).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib/clipcut');

const ROOT = path.resolve(__dirname, '..');
const A = rel => path.join(ROOT, 'public/assets', rel);
const OUT = path.join(ROOT, 'build/wf_assets.js');

const SRC = {
  idle:   A('wf_idle_se.gif'),      // 3/4 view, breathing on the spot
  walk:   A('wf_walk_east.gif'),
  run:    A('wf_sprint_east.gif'),
  burger: A('wf_burger_se.gif'),    // reaches into his side and eats
  aim:    A('wf_aim_east.gif')      // extends the arm; stands in for shooting
};

// Where each one-shot settles into something repeatable.
const LOOP_FROM = { aim: 7 };
// The burger's loop is picked by hand rather than by index: it is the hand-at-
// mouth band, retraced so it cannot seam.
const CHEW = [4, 5, 6, 5];
// The arm swings wide in the aim and the burger comes up across the body, so
// both would shimmy if each frame were centred on its own silhouette.
const SHARE_X = ['aim', 'burger'];

const clips = L.loadClips(SRC);
if (!clips.idle) { console.error('need the idle clip'); process.exit(1); }
L.shareX(clips, SHARE_X);

const { CW, CH } = L.canvasFor(clips);
const cut = L.makeCutter(CW, CH);

// ---------- unique frame pool ----------
// Pool keys double as texture names ('wf_' + key), and every animation is a
// list of those keys, so a frame used by both an intro and its loop is stored
// once.
const frames = {};
const pool = (poolName, clip, mirror) => {
  if (!clips[clip]) return null;
  return clips[clip].frames.map((_, i) => {
    const k = `${poolName}_${i}`;
    frames[k] = cut(clips[clip], i, mirror);
    return k;
  });
};

const K = {
  idle:     pool('idle',     'idle',   false),
  idleW:    pool('idleW',    'idle',   true),
  walk:     pool('walk',     'walk',   false),
  walkW:    pool('walkW',    'walk',   true),
  run:      pool('run',      'run',    false),
  runW:     pool('runW',     'run',    true),
  burgerin: pool('burgerin', 'burger', false),
  burgerinW: pool('burgerinW', 'burger', true),
  shootin:  pool('shootin',  'aim',    false),
  shootinW: pool('shootinW', 'aim',    true)
};
// The looping tails reuse frames the intros already emitted.
if (K.burgerin) {
  K.burger  = CHEW.map(i => K.burgerin[Math.min(i, K.burgerin.length - 1)]);
  K.burgerW = CHEW.map(i => K.burgerinW[Math.min(i, K.burgerinW.length - 1)]);
}
if (K.shootin) {
  K.shoot  = K.shootin.slice(LOOP_FROM.aim);
  K.shootW = K.shootinW.slice(LOOP_FROM.aim);
}

// ---------- body box + muzzle ----------
const ib = clips.idle.boxes[0];
const iw = ib.maxX - ib.minX + 1, ih = ib.maxY - ib.minY + 1;
const bw = Math.max(8, Math.round(iw * 0.46));
const body = { w: bw, h: ih - 6, x: Math.round((CW - bw) / 2), y: CH - ih + 2 };
// Measured off the aim clip when there is one: the arm ends up level with the
// chest and a little in front of the torso. Expressed relative to the sprite's
// centre, which is what the game adds to player.y.
const FEET_Y = CH - 2;
const armed = clips.aim && clips.aim.boxes[clips.aim.boxes.length - 1];
const muzzle = {
  dx: Math.round((armed ? (armed.maxX - armed.minX + 1) : iw) * 0.5 + 4),
  dy: Math.round((FEET_Y - ih * 0.72) - CH / 2)
};

const A_ = (keys, fps, repeat) => ({ fps, repeat: repeat === undefined ? -1 : repeat, keys });
const anims = {};
const add = (name, keys, fps, repeat) => { if (keys) anims[name] = A_(keys, fps, repeat); };

add('idle',      K.idle,      5);
add('idleW',     K.idleW,     5);
add('walk',      K.walk,      11);
add('walkW',     K.walkW,     11);
add('run',       K.run,       14);
add('runW',      K.runW,      14);
// long idle: he digs the burger out, then chews on a loop
add('burgerin',  K.burgerin,  10, 0);
add('burgerinW', K.burgerinW, 10, 0);
add('burger',    K.burger,    6);
add('burgerW',   K.burgerW,   6);
// the arm-extend, standing in for a draw-and-fire
add('shootin',   K.shootin,   14, 0);
add('shootinW',  K.shootinW,  14, 0);
add('shoot',     K.shoot,     10);
add('shootW',    K.shootW,    10);

const mod = {
  charH: ih,
  hiRes: true,             // 3D render, not pixel art — scale fractionally
  directional: true,       // every side has a real key; never flipX
  longIdle: 'burger',      // what he does when left alone
  longIdleMs: 8000,
  body, muzzle,
  pending: ['west art (all mirrored east)', 'dash', 'jump', 'land',
            'run-and-gun', 'sword', 'a real firing clip (the arm-extend stands in)'],
  frames,
  anims
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'window.WF = ' + JSON.stringify(mod) + ';\n');
console.log(`canvas ${CW}x${CH}  charH ${ih}`);
console.log('body', JSON.stringify(body), 'muzzle', JSON.stringify(muzzle));
console.log(`${Object.keys(frames).length} unique frames, ${Object.keys(anims).length} anims:`,
  Object.keys(anims).join(' '));
console.log('pending art:', mod.pending.join(', '));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
