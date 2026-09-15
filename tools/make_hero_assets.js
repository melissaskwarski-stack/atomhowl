#!/usr/bin/env node
// Build build/ew_assets.js from the Idle_v3 character GIFs.
//
// The art ships per-direction (east AND west), so the game plays a
// side-specific animation instead of mirroring one side — mirroring would
// flip the character's asymmetric hair and gear.
//
// The run clip is an acceleration, not a cycle: it opens standing upright and
// leans further forward on every frame, never settling. Looping the whole
// thing would make him stand up and lean in again several times a second, so
// it is split — the full clip plays once as he sets off, and only the settled
// tail loops after that. LOOP_FROM marks where each tail starts.
//
// Run ships with real east AND west art. Walk and idle are east only, so their
// west is a mirrored copy baked here rather than a runtime flipX — the
// directional player expects a real 'W' animation to exist.
//
// Shoot / sword still reuse the run frames and are listed in EW.pending until
// the real art lands. Image data is emitted once into EW.frames and referenced
// by key, so those placeholders cost nothing in file size.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib/clipcut');
const PNG = L.PNG;

const ROOT = path.resolve(__dirname, '..');
const A = 'public/assets/';
const SRC = {
  idle:      A + 'Idle_v3_idle_breathing_east.gif',
  // The run is two clips: the lean-in that gets him moving, which has real east
  // and west art, and a true looping sprint behind it. Before the sprint arrived
  // the loop had to be sliced out of the lean-in, which never settles.
  runin:     A + 'Idle_v3_run_east.gif',
  runinW:    A + 'Idle_v3_run_west.gif',
  sprint:    A + 'Idle_v3_sprint_east.gif',
  walk:      A + 'Idle_v3_walk_east.gif',
  guitar:    A + 'Idle_v3_guitar_east.gif',
  pistol:    A + 'Idle_v3_pistol_east.gif',
  dash:      A + 'Idle_v3_dash_east.gif',
  runshootW: A + 'Idle_v3_runshoot_west.gif',  // drawn facing west; east is mirrored
  jump:      A + 'Idle_v3_jump_east.gif',
  // --- melee: a katana with real art on three sides, and an energy blade ---
  katana:     A + 'Idle_v3_katana_east.gif',
  katanaW:    A + 'Idle_v3_katana_west.gif',
  katanaF:    A + 'Idle_v3_katana_front.gif',
  esword:     A + 'Idle_v3_esword_east.gif',
  eswordF:    A + 'Idle_v3_esword_front.gif',
  // --- low stance ---
  crouch:     A + 'Idle_v3_crouch_east.gif',
  crouchwalk: A + 'Idle_v3_crouchwalk_east.gif',
  // --- the second gun ---
  akwalk:     A + 'Idle_v3_akwalk_east.gif'
};

// Several clips open with a one-shot action and only then settle into
// something repeatable — the run leans in, the guitar is pulled off his back,
// the pistol is drawn. Each is emitted twice: '<name>in' plays the whole clip
// once, '<name>' loops the settled tail. The index is where that tail starts,
// chosen by comparing the wrap discontinuity against the in-loop motion
// (tools note: run 4 scored 1.12, pistol 7 scored 1.00 — lower is smoother).
const LOOP_FROM = { guitar: 4, pistol: 7, runshoot: 8, runshootW: 8 };

// Playing the guitar is an upper-body action, but the render has him shifting
// his weight foot to foot, which looks wrong once the clip is looping on the
// spot. Everything below this fraction of his height is pinned to the first
// frame of the loop, so only his torso, arms and the instrument move. The seam
// sits at the waist, which the motion profile shows is the quietest band —
// putting it anywhere busier would show as a shear.
const FREEZE_BELOW = { guitar: 0.52 };
// Clips whose frames keep one horizontal extent. Every frame is centred on
// its own silhouette, so a clip that throws its arms out (the jump swings
// from 47 to 115 wide) would shimmy the torso side to side. Sharing the X
// range holds him still; the feet still anchor frame by frame, which is what
// strips the rise the artist baked into the airborne frames — the physics
// supplies that.
// The swords throw an arc far wider than the body and the crouch drops the
// silhouette, so both would slide if each frame were centred on its own bounds.
const SHARE_X = ['jump', 'katana', 'katanaW', 'katanaF', 'esword', 'eswordF',
                 'crouch', 'crouchwalk'];

// Bursts: the physics launches the instant the key goes down, so a clip that
// opens on two or three frames of the character still standing reads as him
// sliding upright before the animation catches up. Those frames are found by
// measurement and dropped — the run's lean-in and the dash both spend a third
// of their length standing there.
// The value is how far into the clip's own peak movement a frame has to be
// before it counts as committed; the run gets a harder gate than the dash
// because its lean-in carries on accelerating for several frames after it
// starts, and only the first couple are genuinely dead.
const TRIM_LEADIN = { runin: 0.4, runinW: 0.4, dash: 0.25 };

const FREEZE_FEATHER = 12;
const OUT = path.join(ROOT, 'build/ew_assets.js');

// ---------- load ----------
const clips = L.loadClips(
  Object.fromEntries(Object.entries(SRC).map(([k, rel]) => [k, path.join(ROOT, rel)])));
if (!clips.idle || !clips.runin) { console.error('need idle + run east'); process.exit(1); }

for (const [name, frac] of Object.entries(FREEZE_BELOW)) {
  const d = clips[name];
  if (!d) continue;
  const from = LOOP_FROM[name] || 0;
  const b = d.boxes[from];
  const seam = Math.round(b.minY + (b.maxY - b.minY + 1) * frac);
  const base = d.frames[from];
  for (let i = from + 1; i < d.frames.length; i++) {
    const f = d.frames[i];
    for (let y = seam; y < d.H; y++) {
      const w = Math.min(1, (y - seam) / FREEZE_FEATHER);
      for (let x = 0; x < d.W; x++) {
        const k = (y * d.W + x) * 4;
        for (let c = 0; c < 4; c++) f[k + c] = Math.round(f[k + c] * (1 - w) + base[k + c] * w);
      }
    }
  }
  // Every frame is cut against its own bounds and re-centred, so a torso that
  // changes width would slide the pinned legs anyway. The loop frames are
  // given ONE shared box, which is what actually holds them still.
  d.boxes = d.frames.map(fr => L.bbox(fr, d.W, d.H));   // silhouette changed
  const loop = d.boxes.slice(from);
  const shared = {
    minX: Math.min.apply(null, loop.map(v => v.minX)),
    maxX: Math.max.apply(null, loop.map(v => v.maxX)),
    minY: Math.min.apply(null, loop.map(v => v.minY)),
    maxY: Math.max.apply(null, loop.map(v => v.maxY))
  };
  for (let i = from; i < d.boxes.length; i++) d.boxes[i] = shared;
  console.log(`${name}: legs pinned below y${seam} from frame ${from}, ` +
    `loop shares box ${shared.maxX - shared.minX + 1}x${shared.maxY - shared.minY + 1}`);
}

for (const [name, gate] of Object.entries(TRIM_LEADIN)) {
  const d = clips[name];
  if (!d) continue;
  const n = L.leadIn(d, gate);
  if (!n) continue;
  d.frames = d.frames.slice(n);
  d.boxes = d.boxes.slice(n);
  console.log(`${name}: dropped ${n} standing frame(s) off the front`);
}

L.shareX(clips, SHARE_X);

// ---------- uniform, feet-anchored canvas ----------
// One canvas for every clip so the sprite never jumps when the animation
// changes, and every frame sits on the same floor line.
const { CW, CH } = L.canvasFor(clips);
const cut = L.makeCutter(CW, CH);

// ---------- unique frame pool ----------
// Pool keys double as texture names ('ew_' + key), so 'ew_idle_0' — the
// texture the game constructs the player sprite with — still resolves.
const frames = {};
const pool = (poolName, clip, mirror) => {
  const d = clips[clip];
  return d.frames.map((_, i) => {
    const k = `${poolName}_${i}`;
    frames[k] = cut(d, i, mirror);
    return k;
  });
};
const K = {
  idle:      pool('idle',      'idle',   false),
  idleW:     pool('idleW',     'idle',   true),   // east only — mirror
  walk:      pool('walk',      'walk',   false),
  walkW:     pool('walkW',     'walk',   true),   // east only — mirror
  runin:     pool('runin',     'runin',  false),  // real east lean-in
  runinW:    pool('runinW',    'runinW', false),  // real west lean-in
  run:       pool('run',       'sprint', false),  // true looping sprint
  runW:      pool('runW',      'sprint', true),   // east only — mirror
  guitarin:  pool('guitarin',  'guitar', false),
  guitarinW: pool('guitarinW', 'guitar', true),   // east only — mirror
  pistolin:  pool('pistolin',  'pistol', false),
  pistolinW: pool('pistolinW', 'pistol', true),   // east only — mirror
  dash:      pool('dash',      'dash',   false),
  dashW:     pool('dashW',     'dash',   true),   // east only — mirror
  runshootinW: pool('runshootinW', 'runshootW', false),  // real west art
  runshootin:  pool('runshootin',  'runshootW', true),   // west only — mirror
  jump:      clips.jump ? pool('jump',  'jump', false) : null,
  jumpW:     clips.jump ? pool('jumpW', 'jump', true)  : null,  // east only — mirror
  katana:    clips.katana  ? pool('katana',  'katana',  false) : null,
  katanaW:   clips.katanaW ? pool('katanaW', 'katanaW', false) : null,  // real west art
  katanaF:   clips.katanaF ? pool('katanaF', 'katanaF', false) : null,
  esword:    clips.esword  ? pool('esword',  'esword',  false) : null,
  eswordW:   clips.esword  ? pool('eswordW', 'esword',  true)  : null,
  eswordF:   clips.eswordF ? pool('eswordF', 'eswordF', false) : null,
  crouch:    clips.crouch  ? pool('crouch',  'crouch',  false) : null,
  crouchW:   clips.crouch  ? pool('crouchW', 'crouch',  true)  : null,
  cwalk:     clips.crouchwalk ? pool('cwalk',  'crouchwalk', false) : null,
  cwalkW:    clips.crouchwalk ? pool('cwalkW', 'crouchwalk', true)  : null,
  akwalk:    clips.akwalk  ? pool('akwalk',  'akwalk',  false) : null,
  akwalkW:   clips.akwalk  ? pool('akwalkW', 'akwalk',  true)  : null
};
// Each looping tail reuses frames already emitted for its intro, so splitting
// a clip in two costs no extra image data.
// The run has its own loop art now, so only these still slice a tail out of a
// one-shot clip.
for (const name of ['guitar', 'pistol', 'runshoot']) {
  const from = LOOP_FROM[name] || 0;
  K[name]       = K[name + 'in'].slice(from);
  K[name + 'W'] = K[name + 'inW'].slice(from);
}

// ---------- body box + muzzle ----------
const ib = clips.idle.boxes[0];
const iw = ib.maxX - ib.minX + 1, ih = ib.maxY - ib.minY + 1;
const bw = Math.max(8, Math.round(iw * 0.46));
const body = { w: bw, h: ih - 6, x: Math.round((CW - bw) / 2), y: CH - ih + 2 };
// No weapon art yet, so shots leave from chest height just in front of the
// torso. Measured from the feet (the frames are feet-anchored at CH-2) and
// expressed relative to the sprite's centre, which is what the game adds to
// player.y. Chest sits ~0.72 of body height up from the sole.
const FEET_Y = CH - 2;
const muzzle = {
  dx: Math.round(iw * 0.5 + 4),
  dy: Math.round((FEET_Y - ih * 0.72) - CH / 2)
};

const A_ = (keys, fps, repeat) => ({ fps, repeat: repeat === undefined ? -1 : repeat, keys });
const mid = a => [a[Math.min(2, a.length - 1)]];

const mod = {
  charH: ih,
  hiRes: true,             // 3D render, not pixel art — scale fractionally
  directional: true,       // real per-side art — pick the anim, never flipX
  body, muzzle,
  pending: ['idle west (mirrored east)', 'walk west (mirrored east)',
            'guitar west (mirrored east)', 'pistol west (mirrored east)',
            'dash west (mirrored east)', 'run-shoot east (mirrored west)',
            'jump west (mirrored east)', 'energy-blade west (mirrored east)',
            'crouch west (mirrored east)', 'AK west (mirrored east)'],
  frames,
  anims: {
    idle:       A_(K.idle,      5),     // slow breathing
    idleW:      A_(K.idleW,     5),
    walk:       A_(K.walk,      11),
    walkW:      A_(K.walkW,     11),
    // one-shot intros; each is chained into the matching loop below
    // Lean-in, with the standing frames gone: it now covers the first stride
    // instead of holding him upright for a third of a second.
    runin:      A_(K.runin,     22, 0),
    runinW:     A_(K.runinW,    22, 0),
    guitarin:   A_(K.guitarin,  11, 0),
    guitarinW:  A_(K.guitarinW, 11, 0),
    shootin:    A_(K.pistolin,  26, 0),   // snap the pistol out, not a slow draw
    shootinW:   A_(K.pistolinW, 26, 0),
    // settled tails
    run:        A_(K.run,       14),
    runW:       A_(K.runW,      14),
    guitar:     A_(K.guitar,    7),     // idle strumming
    guitarW:    A_(K.guitarW,   7),
    shoot:      A_(K.pistol,    10),    // arm out, recoil
    shootW:     A_(K.pistolW,   10),
    runshootin:  A_(K.runshootin,  15, 0),   // draws the pistol at a run
    runshootinW: A_(K.runshootinW, 15, 0),
    runshoot:   A_(K.runshoot,  15),   // settled run-and-fire cycle
    runshootW:  A_(K.runshootW, 15),
    // Six frames over the 290ms the dash actually lasts, so the clip ends as
    // control comes back rather than playing on over a normal run.
    dash:       A_(K.dash,      21, 0),
    dashW:      A_(K.dashW,     21, 0),

    // ---- melee ----------------------------------------------------------
    // The katana clip is draw (0-5), slash with the arc (6-8), then a guard
    // that settles (9-15). A combo swings the whole thing once to get the
    // blade out, then replays only the slash while it stays out, and finishes
    // on the energy blade's wider flurry. Frame rates are high on purpose:
    // the draw reads as a snap rather than a careful unsheathing.
    ...(K.katana ? {
      sword:       A_(K.katana.slice(0, 12),  20, 0),   // hit 1: draw and cut
      swordW:      A_(K.katanaW.slice(0, 12), 20, 0),
      sword2:      A_(K.katana.slice(5, 12),  22, 0),   // hit 2: blade already out
      sword2W:     A_(K.katanaW.slice(5, 12), 22, 0),
      swordguard:  A_(K.katana.slice(11),      6),      // blade out, waiting
      swordguardW: A_(K.katanaW.slice(11),     6)
    } : {}),
    ...(K.esword ? {
      sword3:  A_(K.esword.slice(0, 13),  20, 0),       // hit 3: the energy flurry
      sword3W: A_(K.eswordW.slice(0, 13), 20, 0)
    } : {}),
    // The finisher is drawn facing the camera, which is exactly where the
    // execution's pan and zoom puts it.
    ...(K.eswordF ? { deathblow: A_(K.eswordF, 16, 0) } : {}),
    ...(K.katanaF ? { deathblow2: A_(K.katanaF, 18, 0) } : {}),

    // ---- low stance -----------------------------------------------------
    ...(K.crouch ? {
      crouchin:  A_(K.crouch,           18, 0),
      crouchinW: A_(K.crouchW,          18, 0),
      crouch:    A_(K.crouch.slice(4),   5),
      crouchW:   A_(K.crouchW.slice(4),  5)
    } : {}),
    ...(K.cwalk ? {
      crouchwalk:  A_(K.cwalk,  10),
      crouchwalkW: A_(K.cwalkW, 10)
    } : {}),

    // ---- the AK ---------------------------------------------------------
    // 21 frames: he brings the rifle up over the first three, and the legs
    // repeat on a 12-frame stride after that (measured, not guessed), so the
    // loop is exactly frames 9-20 and the walk does not limp.
    ...(K.akwalk ? {
      akshootin:   A_(K.akwalk.slice(0, 9),   24, 0),
      akshootinW:  A_(K.akwalkW.slice(0, 9),  24, 0),
      akrunshoot:  A_(K.akwalk.slice(9),      14),
      akrunshootW: A_(K.akwalkW.slice(9),     14),
      akshoot:     A_(K.akwalk.slice(9, 11),  10),
      akshootW:    A_(K.akwalkW.slice(9, 11), 10)
    } : {}),
    // The jump clip is one vertical hop: four frames of crouch, lift-off,
    // rise, a tucked apex, the fall and a landing squash. The crouch is not
    // played — the physics leaves the ground the instant the key goes down,
    // and a squat drawn 50px in the air reads as a glitch. The rest is cut
    // into phases the game picks by vertical speed, so a jump of any height
    // and the second jump both look right.
    ...(K.jump ? {
      jump:       A_([K.jump[4], K.jump[5]],   14, 0),  // lift-off, then holds the rise
      jumpW:      A_([K.jumpW[4], K.jumpW[5]], 14, 0),
      jumpapex:   A_([K.jump[6]],  10, 0),
      jumpapexW:  A_([K.jumpW[6]], 10, 0),
      jumpfall:   A_([K.jump[7]],  10, 0),
      jumpfallW:  A_([K.jumpW[7]], 10, 0),
      land:       A_([K.jump[8]],  10, 0),
      landW:      A_([K.jumpW[8]], 10, 0)
    } : {
      jump:       A_(mid(K.run),  10, 0),
      jumpW:      A_(mid(K.runW), 10, 0)
    })
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'window.EW = ' + JSON.stringify(mod) + ';\n');
console.log(`canvas ${CW}x${CH}  charH ${ih}`);
console.log('body', JSON.stringify(body), 'muzzle', JSON.stringify(muzzle));
console.log(`${Object.keys(frames).length} unique frames, ${Object.keys(mod.anims).length} anims`);
console.log('pending art:', mod.pending.join(', '));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
