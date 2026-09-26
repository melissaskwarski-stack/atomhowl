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
  // The second thing he does standing still: a longer, slower breath. He
  // settles into it after the first, and it is what he goes back to when he
  // has finished with the guitar.
  idle2:     A + 'ew_idle2_breathing.gif',
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
  // The fourth beat used to turn him to face the camera, which broke the line
  // of the fight — he was swinging at the player rather than at what he was
  // fighting. This is the replacement: 25 frames drawn facing west, a draw
  // through 12, the arc itself with its trail on 13-15, and the blade held out
  // after. Mirrored for east like the rest.
  katana2W:   A + 'Idle_v3_katana2_west.gif',
  esword:     A + 'Idle_v3_esword_east.gif',
  eswordF:    A + 'Idle_v3_esword_front.gif',
  // Knocked off his feet and killed: standing through 4, the stagger at 5, off
  // the ground at 6-7 and flat on his back by 8. Plays once and holds there.
  death:      A + 'Idle_v3_death_se.gif',
  // Running with the pistol up at about 45 degrees.
  p45:        A + 'Idle_v3_pistol45_east.gif',
  // --- low stance ---
  // 29 frames of crouch AND slide. Only the crouch is wanted: he stands
  // through 0-1, bends from 2, and is settled from 8 (frames 8-11 are
  // identical at 110x128). Everything from 12 is him throwing his feet out
  // into a slide, which is a separate move and is cut off here.
  crouch:     A + 'Idle_v3_crouch2_east.gif',
  // The all-fours clip that used to be the crouch is really him going down —
  // it is the fall, played when he misses a jump.
  falldown:   A + 'Idle_v3_prone_east.gif',
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

// Pinning everything below a seam to one frame stops a looping clip walking
// on the spot. The guitar USED to be in here at 0.52 — the waist — on the
// grounds that playing is an upper-body action. It is not: the instrument
// hangs well past the waist, so the seam ran straight through the lower bout,
// and every frame had a guitar whose body was held at frame 4 while its neck
// and his arms moved. That is a guitar smeared onto his thigh, which is
// exactly what it looked like.
//
// There is no seam that both quiets the legs and clears the instrument, so
// the legs keep their weight shift — it is a second of footwork, and the
// clip no longer loops long enough for it to read as pacing. SHARE_X below
// still holds him from sliding sideways, which was the other half of the job.
const FREEZE_BELOW = {};
// Clips whose frames keep one horizontal extent. Every frame is centred on
// its own silhouette, so a clip that throws its arms out (the jump swings
// from 47 to 115 wide) would shimmy the torso side to side. Sharing the X
// range holds him still; the feet still anchor frame by frame, which is what
// strips the rise the artist baked into the airborne frames — the physics
// supplies that.
// The swords throw an arc far wider than the body and the crouch drops the
// silhouette, so both would slide if each frame were centred on its own bounds.
// 'guitar' is here now that the freeze no longer gives it a shared box of its
// own: pulling the instrument off his back throws the silhouette from narrow
// to wide, and per-frame centring would swing his whole body to meet it.
const SHARE_X = ['jump', 'katana', 'katanaW', 'katana2W', 'esword',
                 'eswordF', 'crouch', 'crouchwalk', 'falldown', 'death', 'p45',
                 'guitar'];

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
  idle2:     pool('idle2',     'idle2',  false),
  idle2W:    pool('idle2W',    'idle2',  true),
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
  // drawn west; east is the mirror
  katana2W:  clips.katana2W ? pool('katana2W', 'katana2W', false) : null,
  katana2:   clips.katana2W ? pool('katana2',  'katana2W', true)  : null,
  esword:    clips.esword  ? pool('esword',  'esword',  false) : null,
  eswordW:   clips.esword  ? pool('eswordW', 'esword',  true)  : null,
  eswordF:   clips.eswordF ? pool('eswordF', 'eswordF', false) : null,
  death:     clips.death ? pool('death',  'death', false) : null,
  deathW:    clips.death ? pool('deathW', 'death', true)  : null,
  p45:       clips.p45 ? pool('p45',  'p45', false) : null,
  p45W:      clips.p45 ? pool('p45W', 'p45', true)  : null,
  crouch:    clips.crouch  ? pool('crouch',  'crouch',  false) : null,
  crouchW:   clips.crouch  ? pool('crouchW', 'crouch',  true)  : null,
  falldown:  clips.falldown ? pool('falldown',  'falldown', false) : null,
  falldownW: clips.falldown ? pool('falldownW', 'falldown', true)  : null,
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
// Per-weapon muzzles, in canvas pixels, measured off the frame each gun
// actually fires on. The game turns these into a world position against the
// sprite's own origin, so they stay right whatever the origin is set to.
const muzzles = {};
// `mirror` when the clip is drawn facing west and the east pose is its mirror.
// Every muzzle is stored as the EAST-facing canvas position; the game negates
// the x offset for west, so measuring one side is enough.
// `names` may be several keys for one measurement — the game looks the muzzle
// up by the action it is playing, and falls back to the weapon.
const mz = (names, clip, frame, mirror) => {
  if (!clips[clip]) return;
  const m = L.muzzleTip(clips[clip], frame, CW, CH, mirror);
  if (!m) return;
  [].concat(names).forEach(n => { muzzles[n] = m; });
  console.log(`muzzle ${[].concat(names).join('/')}: canvas ${m.x},${m.y}`);
};
// Keyed by the ACTION the game is playing as well as by the weapon: the gun
// sits somewhere quite different on a standing draw, a run and a 45-degree
// shot, and firing all three from the standing muzzle is what put bullets
// somewhere around his chest.
mz(['pistol', 'shoot', 'shootin'], 'pistol', 7);
mz(['ak', 'akshoot', 'akshootin', 'akrunshoot'], 'akwalk', 9);
// runshoot is drawn facing WEST, so the barrel is the LEFT-most column of the
// source — mirror, or the search walks in from the right and finds his back.
mz(['runshoot', 'runshootin'], 'runshootW', 10, true);
mz(['shoot45', 'shoot45in'], 'p45', 12);

const A_ = (keys, fps, repeat) => ({ fps, repeat: repeat === undefined ? -1 : repeat, keys });
const mid = a => [a[Math.min(2, a.length - 1)]];
// Nine strums, then the pull-off run backwards. The last strum frame sits one
// frame before the intro's end, so the reversal starts where the loop stops
// and there is no jump at the seam.
const GUITAR_OUT = (west) => {
  const loop = west ? K.guitarW : K.guitar;
  const intro = west ? K.guitarinW : K.guitarin;
  const out = [];
  for (let i = 0; i < 9; i++) out.push.apply(out, loop);
  const from = LOOP_FROM.guitar || 0;
  for (let i = from - 1; i >= 0; i--) out.push(intro[i]);
  return out;
};

const mod = {
  charH: ih,
  hiRes: true,             // 3D render, not pixel art — scale fractionally
  directional: true,       // real per-side art — pick the anim, never flipX
  body, muzzle, muzzles,
  canvasW: CW, canvasH: CH,
  // Standing still he works down this list, one step every idleStepMs: the
  // first breath, then the longer one, then the guitar comes off his back.
  // Having played, he goes back to the SECOND pose — not the first — and does
  // it again eight seconds later.
  idleChain: ['idle', 'idle2', 'guitar'],
  idleStepMs: 8000,
  idleLoopFrom: 1,
  idleLoopMs: 8000,
  longIdle: 'guitar',
  longIdleMs: 8000,
  longIdleOnce: true,      // it ends, and the chain comes round again
  pending: ['idle west (mirrored east)', 'walk west (mirrored east)',
            'guitar west (mirrored east)', 'pistol west (mirrored east)',
            'dash west (mirrored east)', 'run-shoot east (mirrored west)',
            'jump west (mirrored east)', 'energy-blade west (mirrored east)',
            'crouch west (mirrored east)', 'AK west (mirrored east)'],
  frames,
  anims: {
    idle:       A_(K.idle,      5),     // slow breathing
    idleW:      A_(K.idleW,     5),
    idle2:      A_(K.idle2,     5),     // the longer breath he settles into
    idle2W:     A_(K.idle2W,    5),
    walk:       A_(K.walk,      11),
    walkW:      A_(K.walkW,     11),
    // one-shot intros; each is chained into the matching loop below
    // Lean-in, with the standing frames gone: it now covers the first stride
    // instead of holding him upright for a third of a second.
    runin:      A_(K.runin,     22, 0),
    runinW:     A_(K.runinW,    22, 0),
    guitarin:   A_(K.guitarin,  11, 0),
    guitarinW:  A_(K.guitarinW, 11, 0),
    // The draw has to be OVER before the first bullet. Firing is gated on the
    // weapon cooldown, not on this clip, so every frame the arm is still on its
    // way up is a frame a bullet can leave from his hip. The pistol's cooldown
    // is 150ms, so the draw is cut to fit inside it.
    // Three frames is the whole extend; the rest of the draw was the arm
    // drifting into place after the gun was already up, and the prune step
    // drops the frames nothing plays.
    shootin:    A_(K.pistolin.slice(0, 3),  44, 0),
    shootinW:   A_(K.pistolinW.slice(0, 3), 44, 0),
    // settled tails
    run:        A_(K.run,       14),
    runW:       A_(K.runW,      14),
    // Nine times through the 0.71s strum, after a 0.82s intro: about seven
    // seconds of playing, then he stops and goes back to standing. It used to
    // loop until you moved, which meant he never put it away.
    //
    // And when it stopped he cut straight back to a breathing idle with the
    // guitar gone from his hands between one frame and the next. The intro is
    // him taking it off his back, so the intro PLAYED BACKWARDS is him putting
    // it away — the art for the exit was already there, pointing the wrong
    // direction. The strum is unrolled nine times into the key list and the
    // reversed intro hung on the end, so the whole flourish is one clip that
    // runs once: take it off, play, put it back, stand.
    guitar:     A_(GUITAR_OUT(false), 7, 0),
    guitarW:    A_(GUITAR_OUT(true),  7, 0),
    shoot:      A_(K.pistol,    10),    // arm out, recoil
    shootW:     A_(K.pistolW,   10),
    // Same again, and this one was the worst of them: eight frames at 15fps is
    // over half a second of arm swinging up while bullets are already leaving.
    runshootin:  A_(K.runshootin.slice(0, 3),  44, 0),
    runshootinW: A_(K.runshootinW.slice(0, 3), 44, 0),
    runshoot:   A_(K.runshoot,  15),   // settled run-and-fire cycle
    runshootW:  A_(K.runshootW, 15),
    // A dash is not a short run. Played straight, these six frames are a
    // stride and the legs cycle through it, which is what a run looks like
    // however fast it goes. So the clip is rebuilt as a held pose: one frame
    // of him leaning in, the committed stretch held for two thirds of the
    // move, and one frame coming down. The body stays still and the blur
    // trail carries the speed — which is what a dash actually is.
    dash:  A_([K.dash[1], K.dash[4], K.dash[4], K.dash[4], K.dash[4], K.dash[5]], 21, 0),
    dashW: A_([K.dashW[1], K.dashW[4], K.dashW[4], K.dashW[4], K.dashW[4], K.dashW[5]], 21, 0),

    // ---- melee ----------------------------------------------------------
    // The katana clip is draw (0-5), slash with the arc (6-8), then a guard
    // that settles (9-15). A combo swings the whole thing once to get the
    // blade out, then replays only the slash while it stays out, and finishes
    // on the energy blade's wider flurry. Frame rates are high on purpose:
    // the draw reads as a snap rather than a careful unsheathing.
    // Frame rates are high: a swing wants to land, and at 20fps the katana
    // took two fifths of a second just to reach the target.
    ...(K.katana ? {
      sword:       A_(K.katana.slice(0, 12),  34, 0),   // hit 1: draw and cut
      swordW:      A_(K.katanaW.slice(0, 12), 34, 0),
      sword2:      A_(K.katana.slice(5, 12),  36, 0),   // hit 2: blade already out
      sword2W:     A_(K.katanaW.slice(5, 12), 36, 0),
      swordguard:  A_(K.katana.slice(11),      6),      // blade out, waiting
      swordguardW: A_(K.katanaW.slice(11),     6)
    } : {}),
    ...(K.esword ? {
      sword3:  A_(K.esword.slice(0, 13),  34, 0),       // hit 3: the energy flurry
      sword3W: A_(K.eswordW.slice(0, 13), 34, 0)
    } : {}),
    // Hit 4 is the big one. It used to turn him to face the camera, which
    // pointed the swing out of the screen instead of at what he was fighting;
    // this is the side-on replacement. The draw is skipped — by the fourth
    // beat the blade is already out — so it opens on the raised pose at 7 and
    // runs through the arc on 13-15 into a short follow-through.
    ...(K.katana2 ? {
      sword4:  A_(K.katana2.slice(7, 19),  32, 0),
      sword4W: A_(K.katana2W.slice(7, 19), 32, 0)
    } : {}),
    // The finisher is drawn facing the camera, which is exactly where the
    // execution's pan and zoom puts it.
    ...(K.eswordF ? { deathblow: A_(K.eswordF, 16, 0) } : {}),


    // ---- low stance -----------------------------------------------------
    ...(K.crouch ? {
      // down through 2-11, then hold the settled frame. 8-11 are the same
      // drawing, so the hold is one frame rather than four copies of it.
      crouchin:  A_(K.crouch.slice(2, 12),  24, 0),
      crouchinW: A_(K.crouchW.slice(2, 12), 24, 0),
      crouch:    A_([K.crouch[9]],  4),
      crouchW:   A_([K.crouchW[9]], 4),
      // the rest of the same clip: feet thrown forward. Built and waiting —
      // nothing plays it yet.
      slide:     A_(K.crouch.slice(12, 21),  22, 0),
      slideW:    A_(K.crouchW.slice(12, 21), 22, 0)
    } : {}),
    ...(K.falldown ? {
      falldown:  A_(K.falldown,  20, 0),
      falldownW: A_(K.falldownW, 20, 0)
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
      akshootin:   A_(K.akwalk.slice(0, 9),   42, 0),
      akshootinW:  A_(K.akwalkW.slice(0, 9),  42, 0),
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
    }),
    // Knocked off his feet. The standing frames at the head are dropped — he
    // is already dead by the time this plays — so it opens on the stagger and
    // holds on the last frame, flat on his back, until the scene restarts.
    ...(K.death ? {
      death:  A_(K.death.slice(4),  12, 0),
      deathW: A_(K.deathW.slice(4), 12, 0)
    } : {}),
    // Firing on the run with the pistol up at 45 degrees. Two frames of draw
    // at 30fps so the arm is up before the first bullet, then the stride.
    ...(K.p45 ? {
      shoot45in:  A_(K.p45.slice(0, 3),   30, 0),
      shoot45inW: A_(K.p45W.slice(0, 3),  30, 0),
      shoot45:    A_(K.p45.slice(6, 20),  13),
      shoot45W:   A_(K.p45W.slice(6, 20), 13)
    } : {})
  }
};

// Every clip pools all of its frames, but the animations only ever slice parts
// out — the dash keeps 6 of 21, the crouch 10 of 29, and the replaced sword
// beats leave whole clips behind. Anything no animation names is dead weight in
// a page that ships every frame as base64, so it is dropped here instead of
// each cut having to be hand-trimmed back at the source.
(function pruneFrames() {
  const used = new Set();
  Object.values(mod.anims).forEach(a => (a.keys || []).forEach(k => used.add(k)));
  let dropped = 0, bytes = 0;
  for (const k of Object.keys(mod.frames)) {
    if (used.has(k)) continue;
    bytes += mod.frames[k].length;
    delete mod.frames[k];
    dropped++;
  }
  if (dropped) console.log(`pruned ${dropped} unreferenced frames (${Math.round(bytes / 1024)}KB)`);
})();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, 'window.EW = ' + JSON.stringify(mod) + ';\n');
console.log(`canvas ${CW}x${CH}  charH ${ih}`);
console.log('body', JSON.stringify(body), 'muzzle', JSON.stringify(muzzle));
console.log(`${Object.keys(frames).length} unique frames, ${Object.keys(mod.anims).length} anims`);
console.log('pending art:', mod.pending.join(', '));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
