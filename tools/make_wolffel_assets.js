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
  aim:    A('wf_aim_east.gif'),     // extends the arm; stands in for shooting
  // A slab of a greatsword he hauls off his back, swings through a full arc
  // and drags back down: 21 frames that open and close on the same standing
  // pose (f20 -> f0 differs by 8, against 149 inside), so the two halves cut
  // cleanly into two swings.
  sword:  A('wf_greatsword_east.gif'),
  crouch: A('wf_crouch_east.gif'),
  akwalk: A('wf_akwalk_east.gif'),        // walking and firing the rifle
  pwalk:  A('wf_pistolwalk_east.gif')     // walking with the pistol up
};

// Where each one-shot settles into something repeatable.
const LOOP_FROM = { aim: 7 };
// The burger's loop is picked by hand rather than by index: it is the hand-at-
// mouth band, retraced so it cannot seam.
const CHEW = [4, 5, 6, 5];
// The arm swings wide in the aim and the burger comes up across the body, so
// both would shimmy if each frame were centred on its own silhouette.
const SHARE_X = ['aim', 'burger', 'sword', 'crouch'];

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
  shootinW: pool('shootinW', 'aim',    true),
  gs:       pool('gs',       'sword',  false),
  gsW:      pool('gsW',      'sword',  true),
  crouch:   pool('crouch',   'crouch', false),
  crouchW:  pool('crouchW',  'crouch', true),
  ak:       pool('ak',       'akwalk', false),
  akW:      pool('akW',      'akwalk', true),
  pw:       pool('pw',       'pwalk',  false),
  pwW:      pool('pwW',      'pwalk',  true)
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
// He takes two bites and is done, rather than chewing on forever: the chew
// band plays twice (repeat 1) and the game drops him back to the plain idle
// when it finishes — see longIdleOnce.
add('burger',    K.burger,    6, 1);
add('burgerW',   K.burgerW,   6, 1);
// the arm-extend, standing in for a draw-and-fire
add('shootin',   K.shootin,   14, 0);
add('shootinW',  K.shootinW,  14, 0);
add('shoot',     K.shoot,     10);
add('shootW',    K.shootW,    10);

// ---- the greatsword -------------------------------------------------------
// It is too heavy for a fast three-hit chain, so the combo is the two halves
// of the clip: he hauls it up and sweeps (2-14), then drags it back down
// (14-20), and the third beat is the whole thing swung both ways.
if (K.gs) {
  add('sword',   K.gs.slice(2, 15),   26, 0);
  add('swordW',  K.gsW.slice(2, 15),  26, 0);
  add('sword2',  K.gs.slice(14),      26, 0);
  add('sword2W', K.gsW.slice(14),     26, 0);
  add('sword3',  K.gs.slice(2),       28, 0);
  add('sword3W', K.gsW.slice(2),      28, 0);
  // the quiet band mid-swing, where he holds it out
  add('swordguard',  K.gs.slice(11, 15),  4);
  add('swordguardW', K.gsW.slice(11, 15), 4);
  // no front-facing art, so the finisher is the full two-way swing
  add('deathblow',  K.gs.slice(2),  15, 0);
}

// ---- low stance -----------------------------------------------------------
if (K.crouch) {
  add('crouchin',  K.crouch,          18, 0);
  add('crouchinW', K.crouchW,         18, 0);
  add('crouch',    K.crouch.slice(2),  5);
  add('crouchW',   K.crouchW.slice(2), 5);
}

// ---- the AK ---------------------------------------------------------------
// He raises it over the first three frames and his legs repeat on a 10-frame
// stride after that (measured), so the loop is frames 11-20.
if (K.ak) {
  add('akshootin',   K.ak.slice(0, 11),   24, 0);
  add('akshootinW',  K.akW.slice(0, 11),  24, 0);
  add('akrunshoot',  K.ak.slice(11),      14);
  add('akrunshootW', K.akW.slice(11),     14);
  add('akshoot',     K.ak.slice(11, 13),  10);
  add('akshootW',    K.akW.slice(11, 13), 10);
}

// ---- walking with the pistol up ------------------------------------------
if (K.pw) {
  add('runshootin',  K.pw,           20, 0);
  add('runshootinW', K.pwW,          20, 0);
  add('runshoot',    K.pw.slice(2),  11);
  add('runshootW',   K.pwW.slice(2), 11);
}

const mod = {
  charH: ih,
  hiRes: true,             // 3D render, not pixel art — scale fractionally
  directional: true,       // every side has a real key; never flipX
  longIdle: 'burger',      // what he does when left alone
  longIdleMs: 8000,
  longIdleOnce: true,      // two bites, then back to standing
  body, muzzle,
  pending: ['west art (all mirrored east)', 'dash', 'jump', 'land',
            'a front-facing finisher', 'a real standing firing clip'],
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
