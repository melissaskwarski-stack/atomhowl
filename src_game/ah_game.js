/* ATOMHOWL game */
/* =====================================================================
   ATOMHOWL — Stage 1: "Quarantine Zone 7"  (shooting-scene build)
   Side-view run-and-gun matching the Codex redesign direction:
   move / jump / dash / aim+shoot / sword, zombie waves, noir city.
   All art is procedural placeholder in the shared noir palette —
   real Eterwolf GIFs + zombie sprites swap in once provided.
   ===================================================================== */
(function () {
'use strict';

// ------------------------------------------------------------------ //
//  TINY SYNTH — procedural SFX, no audio files needed                 //
// ------------------------------------------------------------------ //
const Sfx = {
  ctx: null, master: null, muted: false,
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.13;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* audio unavailable — game still runs */ }
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.13;
  },
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  shoot()   { this.noise(0.06, 0.5, 2600); this.blip(700, 0.05, 'square', 0.25, 180); },
  hit()     { this.blip(170, 0.06, 'square', 0.35, 90); },
  squelch() { this.noise(0.16, 0.5, 650); this.blip(95, 0.13, 'sawtooth', 0.3, 50); },
  sword()   { this.noise(0.11, 0.4, 1800); this.blip(520, 0.09, 'sine', 0.2, 1200); },
  jump()    { this.blip(290, 0.09, 'sine', 0.3, 520); },
  dash()    { this.noise(0.09, 0.3, 1400); },
  hurt()    { this.blip(120, 0.22, 'sawtooth', 0.45, 55); },
  wave()    { this.blip(392, 0.12, 'triangle', 0.35); setTimeout(() => this.blip(523, 0.2, 'triangle', 0.35), 130); },
  clear()   { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.3), i * 110)); },
  roar()    { this.noise(0.5, 0.6, 300); this.blip(70, 0.55, 'sawtooth', 0.5, 38); },
  swoop()   { this.blip(880, 0.22, 'sine', 0.2, 220); }
};

// ------------------------------------------------------------------ //
//  NOIR PALETTE + PIXEL MAPS (hand-drawn placeholder sprites)         //
//  Same ramp family as tools/unify_assets.py: shadow→brown→sepia→bone //
//  Accents per bible: blue=Eterwolf, green=the Changed                //
// ------------------------------------------------------------------ //
const PAL = {
  k: '#0d0a08',  // outline / near-black
  h: '#221a12',  // Eterwolf curly hair (dark)
  s: '#c49a66',  // skin (sepia)
  d: '#97713f',  // skin shadow
  j: '#2e4257',  // jacket — cold blue accent, noir-muted
  J: '#46688a',  // jacket highlight
  t: '#7a6a4d',  // shirt (worn tan)
  p: '#2a2118',  // pants
  b: '#15120e',  // boots
  g: '#3d3d46',  // gun metal
  G: '#70707e',  // gun highlight
  z: '#5d7a3b',  // zombie skin — green accent (the Changed)
  w: '#3c5226',  // zombie skin shadow
  e: '#b9d96a',  // zombie eye glow
  c: '#3b3228',  // zombie rags
  C: '#4d4334',  // zombie rags light
  r: '#6e3b2e',  // brute raw flesh
  f: '#fff2c8',  // bullet core / flash
  F: '#f2b13c',  // amber glow
  H: '#c93b2a',  // heart red (noir-dimmed)
  R: '#8a2f1f',  // boss hide — red accent (bible: bosses = red)
  X: '#5c1d12',  // boss hide shadow
  E: '#ff3b1f'   // boss / threat eye glow
};

// Eterwolf stand-in — lean build, curly hair, blue-noir jacket. Faces right.
const HERO_IDLE_0 = [
  '....hhhhh.....',
  '...hhhhhhh....',
  '..hhhhhhhhh...',
  '..hhssssshh...',
  '..hhssssssh...',
  '..hhdssdssh...',
  '..hhssddss....',
  '..hh.sdds.....',
  '..hhjjjjjj....',
  '..jjJttJjj....',
  '..jjJttJjj....',
  '.jj.JttJ.jj...',
  '.jj.JttJ.jj...',
  '.ss.jJJj.ss...',
  '....jjjj......',
  '....pppp......',
  '...pp..pp.....',
  '...pp..pp.....',
  '...pp..pp.....',
  '...pp..pp.....',
  '..bbb..bbb....',
  '..bbb..bbb....'
];
const HERO_IDLE_1 = [
  '..............',
  '....hhhhh.....',
  '...hhhhhhh....',
  '..hhhhhhhhh...',
  '..hhssssshh...',
  '..hhdssdssh...',
  '..hhssddss....',
  '..hh.sdds.....',
  '..hhjjjjjj....',
  '..jjJttJjj....',
  '..jjJttJjj....',
  '.jj.JttJ.jj...',
  '.jj.JttJ.jj...',
  '.ss.jJJj.ss...',
  '....jjjj......',
  '....pppp......',
  '...pp..pp.....',
  '...pp..pp.....',
  '...pp..pp.....',
  '...pp..pp.....',
  '..bbb..bbb....',
  '..bbb..bbb....'
];
const HERO_RUN_0 = [
  '....hhhhh.....',
  '...hhhhhhh....',
  '..hhhhhhhhh...',
  '..hhssssshh...',
  '..hhssssssh...',
  '..hhdssdssh...',
  '..hhssddss....',
  '..hh.sdds.....',
  '..hhjjjjjj....',
  '..jjJttJjj....',
  '..jjJttJjj....',
  '.jj.JttJ.jj...',
  '.ss.JttJ.jj...',
  '....jJJj..ss..',
  '....jjjj......',
  '....pppp......',
  '..pp...pp.....',
  '.pp.....pp....',
  '.pp......pp...',
  'bb........pp..',
  'bbb.......bbb.',
  '..............'
];
const HERO_RUN_1 = [
  '..............',
  '....hhhhh.....',
  '...hhhhhhh....',
  '..hhhhhhhhh...',
  '..hhssssshh...',
  '..hhdssdssh...',
  '..hhssddss....',
  '..hh.sdds.....',
  '..hhjjjjjj....',
  '..jjJttJjj....',
  '..jjJttJjj....',
  '.jj.JttJ.jj...',
  '.jj.JttJ.jj...',
  '.ss.jJJj.ss...',
  '....jjjj......',
  '....pppp......',
  '....pppp......',
  '...ppppp......',
  '....pppp......',
  '....pp........',
  '...bbb........',
  '...bbb........'
];
const HERO_RUN_2 = [
  '....hhhhh.....',
  '...hhhhhhh....',
  '..hhhhhhhhh...',
  '..hhssssshh...',
  '..hhssssssh...',
  '..hhdssdssh...',
  '..hhssddss....',
  '..hh.sdds.....',
  '..hhjjjjjj....',
  '..jjJttJjj....',
  '..jjJttJjj....',
  '.jj.JttJ.jj...',
  '.jj.JttJ.ss...',
  '..ss.JJj......',
  '....jjjj......',
  '....pppp......',
  '...pp..pp.....',
  '..pp....pp....',
  '.pp......pp...',
  '.pp........bb.',
  'bbb........bbb',
  '..............'
];
const HERO_AIR = [
  '....hhhhh.....',
  '...hhhhhhh....',
  '..hhhhhhhhh...',
  '..hhssssshh...',
  '..hhssssssh...',
  '..hhdssdssh...',
  '..hhssddss....',
  '..hh.sdds.....',
  '..hhjjjjjj....',
  '..jjJttJjj....',
  '..jjJttJjj....',
  '.jj.JttJ.jj...',
  '.ss.JttJ.ss...',
  '....jJJj......',
  '....jjjj......',
  '....pppp......',
  '...pp.pp......',
  '...pp..pp.....',
  '..bb....pp....',
  '..bbb...bbb...',
  '..............',
  '..............'
];
// Gun arm — separate sprite, rotates to aim. Pivot at left-middle.
const HERO_ARM = [
  'ssjjjj........',
  'ssjjjjjggGGg..',
  '.sss...gggggg.',
  '.......gg.....',
  '.......gg.....'
];
// The Changed — walker. Arms out, shambling. Faces right.
const ZOMBIE_WALK_0 = [
  '...kkkk.......',
  '..kzzzzk......',
  '.kzzzzzzk.....',
  '.kzzezzzk.....',
  '.kzzwwzzk.....',
  '..kzwwzk......',
  '...kzzk.......',
  '..cccc.zzzzzz.',
  '.cccccc.zzzzzz',
  '.cCcccc.......',
  '.cCcccc.......',
  '.cccccc.......',
  '.cccccc.......',
  '..ccccc.......',
  '..cccc........',
  '..cc.cc.......',
  '..cc.cc.......',
  '..cc..cc......',
  '.bb...cc......',
  '.bb...bb......',
  '.bbb..bbb.....',
  '..............'
];
const ZOMBIE_WALK_1 = [
  '..............',
  '...kkkk.......',
  '..kzzzzk......',
  '.kzzzzzzk.....',
  '.kzzezzzk.....',
  '.kzzwwzzk.....',
  '..kzwwzk......',
  '...kzzk.......',
  '..cccc.zzzzzz.',
  '.cccccc.zzzzzz',
  '.cCcccc.......',
  '.cCcccc.......',
  '.cccccc.......',
  '.cccccc.......',
  '..ccccc.......',
  '..cccc........',
  '..cc.cc.......',
  '..cc..cc......',
  '...cc.cc......',
  '...cc.bb......',
  '..bbb.bbb.....',
  '..............'
];
// Runner — skinnier, hunched low, fast.
const RUNNER_0 = [
  '..kkkk......',
  '.kzzzzk.....',
  '.kzezzk.....',
  '.kzwwzk.....',
  '..kzzk.zzzz.',
  '..ccc.zzzzz.',
  '.ccccc......',
  '.cCccc......',
  '.ccccc......',
  '..cccc......',
  '..cc.cc.....',
  '..cc..cc....',
  '.bb....cc...',
  '.bb....bb...',
  'bbb...bbb...',
  '............'
];
const RUNNER_1 = [
  '..kkkk......',
  '.kzzzzk.....',
  '.kzezzk.....',
  '.kzwwzk.....',
  '..kzzk.zzzz.',
  '..ccc.zzzzz.',
  '.ccccc......',
  '.cCccc......',
  '.ccccc......',
  '..cccc......',
  '..cc.cc.....',
  '...cc.cc....',
  '...cc..bb...',
  '..cc...bb...',
  '.bbb..bbb...',
  '............'
];
// Brute — wide, raw, slow tank.
const BRUTE_0 = [
  '.....kkkkkk.........',
  '....kzzzzzzk........',
  '...kzzzezzzzk.......',
  '...kzzzwwzzzk.......',
  '....kzzwwzzk........',
  '.....kzzzzk.........',
  '..ccccccccccc.zzzz..',
  '.ccccccccccccc.zzzzz',
  '.ccCCcccccrrcc.zzzzz',
  '.ccCCccccrrrcc......',
  '.cccccccccrrcc......',
  '.ccccccccccccc......',
  '.ccccccccccccc......',
  '..ccccccccccc.......',
  '..cccc...cccc.......',
  '..cccc...cccc.......',
  '..cccc...cccc.......',
  '.bbbbb...bbbbb......',
  '.bbbbb...bbbbb......',
  '....................'
];
const BRUTE_1 = [
  '....................',
  '.....kkkkkk.........',
  '....kzzzzzzk........',
  '...kzzzezzzzk.......',
  '...kzzzwwzzzk.......',
  '....kzzwwzzk........',
  '.....kzzzzk.........',
  '..ccccccccccc.zzzz..',
  '.ccccccccccccc.zzzzz',
  '.ccCCcccccrrcc.zzzzz',
  '.ccCCccccrrrcc......',
  '.cccccccccrrcc......',
  '.ccccccccccccc......',
  '.ccccccccccccc......',
  '..cccc...cccc.......',
  '...cccc..cccc.......',
  '...cccc...cccc......',
  '..bbbbb...bbbbb.....',
  '..bbbbb...bbbbb.....',
  '....................'
];
// Carrion bat — flying Changed. Two flap frames.
const FLYER_0 = [
  '.k..........k.',
  'kzk........kzk',
  'kzzk......kzzk',
  '.kzzk.kk.kzzk.',
  '..kzzkzzkzzk..',
  '...kzzezzzk...',
  '....kzzzk.....',
  '.....kzk......',
  '......k.......',
  '..............'
];
const FLYER_1 = [
  '..............',
  '..............',
  '...kk....kk...',
  '..kzzk..kzzk..',
  '.kzzzkkkzzzk..',
  'kzzkzzezzkzzk.',
  '.k..kzzzk..k..',
  '.....kzk......',
  '......k.......',
  '..............'
];
// THE ALPHA — first of the Changed. Hulking knuckle-walker, red accent.
const BOSS_0 = [
  '......kkkkkk............',
  '.....kRRRRRRk...........',
  '....kRRRRRRRRk..........',
  '....kRREERRRRk..........',
  '....kRRRRXXRRk..........',
  '.....kRXXXXRk...........',
  '..kkkRRRRRRRkkk.........',
  '.kRRRRRRRRRRRRRk........',
  'kRRRRRRRRRRRRRRRk.......',
  'kRRXRRRRRRRRXRRRk.......',
  'kRRXRRRrrRRRXRRRk.......',
  'kRRRRRRrrrRRRRRRk.......',
  'kRRRRRRRrrRRRRRRk.......',
  '.kRRRRRRRRRRRRRk........',
  '.kRRRk.RRRR.kRRRk.......',
  '.kRRRk.RRRR.kRRRk.......',
  '.kXXXk.RRRR.kXXXk.......',
  '.kXXXk.XXXX.kXXXk.......',
  '..kkk..XXXX..kkk........',
  '.......XXXX.............',
  '......kXXXXk............',
  '......kXX.XXk...........',
  '.....kXX...XXk..........',
  '.....kXX...XXk..........',
  '....kXXX...XXXk.........',
  '....bbbb...bbbb.........',
  '....bbbb...bbbb.........',
  '........................'
];
const BOSS_1 = [
  '........................',
  '......kkkkkk............',
  '.....kRRRRRRk...........',
  '....kRRRRRRRRk..........',
  '....kRREERRRRk..........',
  '....kRRRRXXRRk..........',
  '.....kRXXXXRk...........',
  '..kkkRRRRRRRkkk.........',
  '.kRRRRRRRRRRRRRk........',
  'kRRRRRRRRRRRRRRRk.......',
  'kRRXRRRRRRRRXRRRk.......',
  'kRRXRRRrrRRRXRRRk.......',
  'kRRRRRRrrrRRRRRRk.......',
  'kRRRRRRRrrRRRRRRk.......',
  '.kRRRRRRRRRRRRRk........',
  '.kRRRk.RRRR.kRRRk.......',
  '.kXXXk.RRRR.kXXXk.......',
  '.kXXXk.XXXX.kXXXk.......',
  '..kkk..XXXX..kkk........',
  '.......XXXX.............',
  '......kXXXXk............',
  '.....kXX..XXk...........',
  '.....kXX..XXk...........',
  '....kXX....XXk..........',
  '....kXXX...XXXk.........',
  '...bbbb.....bbbb........',
  '...bbbb.....bbbb........',
  '........................'
];
const HEART = [
  '.HH.HH.',
  'HHHHHHH',
  'HHHHHHH',
  '.HHHHH.',
  '..HHH..',
  '...H...'
];

function buildPixelTexture(scene, key, rows, px) {
  px = px || 3;
  let w = 0;
  rows.forEach(r => { if (r.length > w) w = r.length; });
  const canvas = document.createElement('canvas');
  canvas.width = w * px;
  canvas.height = rows.length * px;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x * px, y * px, px, px); }
    }
  }
  scene.textures.addCanvas(key, canvas);
}

// ------------------------------------------------------------------ //
//  BANTER — Eterwolf solo lines (from GAME_BIBLE.md §4)               //
// ------------------------------------------------------------------ //
const BANTER = {
  waveStart: ['¡Ágale!', 'La pelea es nuestra.', '¡Listo!', 'Come on then!'],
  kill:      ['Die! You son of a howl!', '¡Toma!', 'More power! ¡Más poder!', '¡Eso!'],
  streak:    ['¡MÁS PODER!', 'Can’t touch the Spark!', '¡Malparido!'],
  hurt:      ['¡Ay! Cheap shot.', 'Okay. Now I’m mad.', 'Feli would laugh at that.'],
  swordKill: ['¡Toma!', 'Up close and personal.', 'Sliced.'],
  clear:     ['Halberd Bay breathes… for now.', 'Stage clear. Where’s Feli’s arepa?'],
  down:      ['Not… like this…', 'Feli… avenge me, brother…']
};

// ------------------------------------------------------------------ //
//  WAVES — escalating design (M2+M4 in one scene)                     //
// ------------------------------------------------------------------ //
function waveConfig(n) {
  if (n === 1) return { walkers: 5,  zombas: 1, runners: 1, brutes: 0, flyers: 0, archers: 0, speed: 45 };
  if (n === 2) return { walkers: 6,  zombas: 3, runners: 2, brutes: 0, flyers: 2, archers: 0, speed: 55 };
  if (n === 3) return { walkers: 7,  zombas: 3, runners: 3, brutes: 1, flyers: 3, archers: 1, speed: 60 };
  if (n === 4) return { walkers: 8,  zombas: 4, runners: 4, brutes: 1, flyers: 4, archers: 2, speed: 65 };
  if (n === 5) return { walkers: 3,  zombas: 2, runners: 2, brutes: 0, flyers: 2, archers: 1, speed: 65, boss: true };
  // endless scaling beyond stage 1 — a boss returns every 5th wave, stronger
  const k = n - 5;
  return {
    walkers: 8 + k * 2,
    zombas: 4 + k,
    runners: 4 + k,
    brutes: 1 + Math.floor(k / 2),
    flyers: 3 + Math.floor(k / 2),
    archers: 2 + Math.floor(k / 2),
    kingos: Math.floor(k / 3),
    speed: 70 + k * 5,
    boss: n % 5 === 0
  };
}

// cross-scene progress (weapon acquired in the shop, etc.)
const GameState = { hasWeapon: false };

const WORLD_W = 2400;
const WORLD_H = 720;
const GROUND_Y = 648;          // top surface of the street
const GRAVITY = 1500;

// ------------------------------------------------------------------ //
//  BOOT — builds every texture procedurally                           //
// ------------------------------------------------------------------ //
//  Hero animation helpers                                             //
//                                                                     //
//  The current character art ships per-direction (real east AND west  //
//  frames), so facing left plays the west animation rather than       //
//  mirroring the sprite — mirroring would flip his hair and gear.     //
//  Single-sided art has no *W keys and still mirrors via flipX.       //
// ------------------------------------------------------------------ //
const EW_DIR = !!(window.EW && window.EW.directional);

// 'ew-run' facing left -> 'ew-runW', when that variant exists
function ewAnim(key, facing) {
  return (EW_DIR && facing < 0 && window.EW.anims[key.slice(3) + 'W']) ? key + 'W' : key;
}

// only mirror when there's no real art for the other side
function ewFlip(sprite, facing) { sprite.setFlipX(EW_DIR ? false : facing < 0); }

// hi-res renders scale fractionally; pixel art snaps to whole pixels so it stays crisp
function ewScale(targetH, fallback) {
  if (!window.EW || !window.EW.charH) return fallback;
  const s = targetH / window.EW.charH;
  return window.EW.hiRes ? s : Math.max(1, Math.round(s));
}

// ------------------------------------------------------------------ //
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Real Eterwolf frames (PixelLab GIFs, decoded + embedded as data URIs).
    // If window.EW is missing we fall back to the procedural placeholder.
    if (window.EW) {
      if (window.EW.frames) {
        // shared frame pool — placeholder anims reuse real frames, so each
        // image is loaded once no matter how many anims reference it
        for (const k of Object.keys(window.EW.frames)) {
          this.load.image('ew_' + k, window.EW.frames[k]);
        }
      } else {
        for (const name of Object.keys(window.EW.anims)) {
          window.EW.anims[name].frames.forEach((uri, i) => {
            this.load.image('ew_' + name + '_' + i, uri);
          });
        }
      }
    }
    // Custom background image (nuclear wasteland art)
    if (window.BG_DATA) {
      this.load.image('bg_custom', window.BG_DATA);
    }
    // Player-made monster sprites (from the GitHub assets upload)
    if (window.MOBS) {
      for (const key of Object.keys(window.MOBS)) {
        this.load.image('mob_' + key, window.MOBS[key]);
      }
    }
    // Scene art (menu / bunker interior / street). Embedded as data URIs when present.
    if (window.SCENES) {
      for (const key of Object.keys(window.SCENES)) {
        this.load.image('scene_' + key, window.SCENES[key]);
      }
    }
    // Animated zombie walk cycles (ZOMB sets from the GitHub upload)
    if (window.ZOMBS) {
      for (const S of Object.keys(window.ZOMBS)) {
        window.ZOMBS[S].frames.forEach((uri, i) => this.load.image('zomb_' + S + '_' + i, uri));
      }
    }
  }

  create() {
    // characters
    buildPixelTexture(this, 'hero_idle_0', HERO_IDLE_0);
    buildPixelTexture(this, 'hero_idle_1', HERO_IDLE_1);
    buildPixelTexture(this, 'hero_run_0', HERO_RUN_0);
    buildPixelTexture(this, 'hero_run_1', HERO_RUN_1);
    buildPixelTexture(this, 'hero_run_2', HERO_RUN_2);
    buildPixelTexture(this, 'hero_air', HERO_AIR);
    buildPixelTexture(this, 'hero_arm', HERO_ARM);
    buildPixelTexture(this, 'zombie_0', ZOMBIE_WALK_0);
    buildPixelTexture(this, 'zombie_1', ZOMBIE_WALK_1);
    buildPixelTexture(this, 'runner_0', RUNNER_0);
    buildPixelTexture(this, 'runner_1', RUNNER_1);
    buildPixelTexture(this, 'brute_0', BRUTE_0, 4);
    buildPixelTexture(this, 'brute_1', BRUTE_1, 4);
    buildPixelTexture(this, 'flyer_0', FLYER_0, 3);
    buildPixelTexture(this, 'flyer_1', FLYER_1, 3);
    buildPixelTexture(this, 'boss_0', BOSS_0, 5);
    buildPixelTexture(this, 'boss_1', BOSS_1, 5);
    buildPixelTexture(this, 'heart', HEART, 3);

    this._makeEffectTextures();
    this._makeEnvironmentTextures();
    this._makeGrainTextures();
    this._makePowerTextures();

    // animations shared across scenes
    const mk = (key, frames, rate, repeat) =>
      this.anims.create({ key: key, frames: frames.map(f => ({ key: f })), frameRate: rate, repeat: repeat });
    mk('hero-idle', ['hero_idle_0', 'hero_idle_1'], 2.2, -1);
    mk('hero-run', ['hero_run_0', 'hero_run_1', 'hero_run_2', 'hero_run_1'], 11, -1);
    mk('hero-air', ['hero_air'], 1, -1);
    mk('zombie-walk', ['zombie_0', 'zombie_1'], 4, -1);
    mk('runner-walk', ['runner_0', 'runner_1'], 9, -1);
    mk('brute-walk', ['brute_0', 'brute_1'], 3, -1);
    mk('flyer-fly', ['flyer_0', 'flyer_1'], 8, -1);
    mk('boss-walk', ['boss_0', 'boss_1'], 2.5, -1);

    // The game runs pixelArt (NEAREST) for the sprite sheets, but the current
    // hero is a high-res render shrunk to fit — nearest-sampling that drops
    // pixels and stipples the edges, so give just his frames linear filtering.
    if (window.EW && window.EW.hiRes && window.EW.frames) {
      for (const k of Object.keys(window.EW.frames)) {
        const t = this.textures.get('ew_' + k);
        if (t) t.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    // real Eterwolf animations. Directional art registers both an east key
    // ('ew-run') and a west one ('ew-runW'); see ewAnim().
    if (window.EW) {
      for (const name of Object.keys(window.EW.anims)) {
        const a = window.EW.anims[name];
        this.anims.create({
          key: 'ew-' + name,
          frames: a.keys ? a.keys.map(k => ({ key: 'ew_' + k }))
                         : a.frames.map((u, i) => ({ key: 'ew_' + name + '_' + i })),
          frameRate: a.fps,
          repeat: a.repeat
        });
      }
    }

    // zombie walk cycles: frames 1,2,3,4,5 then back 4,3,2 (pingpong)
    if (window.ZOMBS) {
      for (const S of Object.keys(window.ZOMBS)) {
        this.anims.create({
          key: 'zw-' + S,
          frames: [0, 1, 2, 3, 4, 3, 2, 1].map(i => ({ key: 'zomb_' + S + '_' + i })),
          frameRate: 8,
          repeat: -1
        });
      }
    }

    this.scene.start('MenuScene');
  }

  _makeEffectTextures() {
    // bullet tracer
    let g = this.make.graphics({ add: false });
    g.fillStyle(0xf2b13c, 0.55); g.fillRect(0, 0, 18, 5);
    g.fillStyle(0xfff2c8, 1);    g.fillRect(4, 1, 12, 3);
    g.generateTexture('bullet', 18, 5);
    g.destroy();

    // muzzle flash (two sizes)
    [['flash_0', 16], ['flash_1', 10]].forEach(item => {
      const gg = this.make.graphics({ add: false });
      gg.fillStyle(0xfff2c8, 1); gg.fillCircle(item[1], item[1], item[1] * 0.55);
      gg.fillStyle(0xf2b13c, 0.7); gg.fillCircle(item[1], item[1], item[1]);
      gg.generateTexture(item[0], item[1] * 2, item[1] * 2);
      gg.destroy();
    });

    // sword slash crescent
    g = this.make.graphics({ add: false });
    g.lineStyle(10, 0xfff2c8, 0.95);
    g.beginPath(); g.arc(10, 40, 38, -1.15, 1.15); g.strokePath();
    g.lineStyle(18, 0xf2b13c, 0.35);
    g.beginPath(); g.arc(10, 40, 34, -1.0, 1.0); g.strokePath();
    g.generateTexture('slash', 64, 80);
    g.destroy();

    // ground splat (dark fluid of the Changed)
    g = this.make.graphics({ add: false });
    g.fillStyle(0x1d2810, 0.9);
    g.fillEllipse(24, 7, 44, 11);
    g.fillEllipse(10, 5, 12, 6);
    g.fillEllipse(40, 5, 10, 5);
    g.generateTexture('splat', 48, 14);
    g.destroy();

    // dust puff
    g = this.make.graphics({ add: false });
    g.fillStyle(0x8a7a5e, 0.5); g.fillCircle(8, 8, 7);
    g.generateTexture('puff', 16, 16);
    g.destroy();

    // spawn warning marker
    g = this.make.graphics({ add: false });
    g.fillStyle(0xb9d96a, 1);
    g.fillRect(5, 0, 6, 16);
    g.fillRect(5, 20, 6, 6);
    g.generateTexture('warn', 16, 26);
    g.destroy();
  }

  _makeEnvironmentTextures() {
    // --- street: asphalt + sidewalk lip + cracks ---
    const sc = document.createElement('canvas');
    sc.width = WORLD_W; sc.height = WORLD_H - GROUND_Y;
    const sctx = sc.getContext('2d');
    sctx.fillStyle = '#16110c'; sctx.fillRect(0, 0, sc.width, sc.height);
    sctx.fillStyle = '#241c12'; sctx.fillRect(0, 0, sc.width, 8);
    sctx.fillStyle = '#2e2418';
    for (let x = 0; x < sc.width; x += 64) sctx.fillRect(x, 0, 2, 8);
    sctx.strokeStyle = '#0c0907'; sctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const cx = Math.random() * sc.width, cy = 10 + Math.random() * (sc.height - 14);
      sctx.beginPath(); sctx.moveTo(cx, cy);
      sctx.lineTo(cx + (Math.random() * 40 - 20), cy + (Math.random() * 16 - 8));
      sctx.stroke();
    }
    this.textures.addCanvas('street', sc);

    // --- ledge (fire-escape platform) ---
    let g = this.make.graphics({ add: false });
    g.fillStyle(0x241c12, 1); g.fillRect(0, 0, 150, 16);
    g.fillStyle(0x3a2c1c, 1); g.fillRect(0, 0, 150, 4);
    g.fillStyle(0x0d0a08, 1);
    for (let x = 8; x < 150; x += 18) g.fillRect(x, 4, 3, 12);
    g.generateTexture('ledge', 150, 16);
    g.destroy();

    // --- parallax building layers (3 depths) ---
    const layers = [
      { key: 'bg_far',  col: '#120d0a', winLit: 0.04, h: 420, top: 140 },
      { key: 'bg_mid',  col: '#1a130d', winLit: 0.07, h: 480, top: 110 },
      { key: 'bg_near', col: '#221912', winLit: 0.10, h: 540, top: 80 }
    ];
    layers.forEach(L => {
      const c = document.createElement('canvas');
      c.width = 1600; c.height = 720;
      const ctx = c.getContext('2d');
      let x = 0;
      while (x < c.width) {
        const bw = 90 + Math.random() * 170;
        const bh = L.h * (0.55 + Math.random() * 0.45);
        const by = 720 - bh;
        ctx.fillStyle = L.col;
        ctx.fillRect(x, by, bw, bh);
        // broken rooftop silhouettes
        if (Math.random() < 0.5) {
          ctx.fillRect(x + bw * 0.2, by - 14, bw * 0.18, 14);
        }
        // windows — a few dimly lit (amber), most dead
        for (let wy = by + 16; wy < 700; wy += 26) {
          for (let wx = x + 10; wx < x + bw - 12; wx += 22) {
            if (Math.random() < L.winLit) {
              ctx.fillStyle = 'rgba(242,177,60,0.55)';
              ctx.fillRect(wx, wy, 8, 11);
            } else if (Math.random() < 0.3) {
              ctx.fillStyle = 'rgba(0,0,0,0.45)';
              ctx.fillRect(wx, wy, 8, 11);
            }
            ctx.fillStyle = L.col;
          }
        }
        x += bw + 6 + Math.random() * 30;
      }
      this.textures.addCanvas(L.key, c);
    });

    // --- moon ---
    g = this.make.graphics({ add: false });
    g.fillStyle(0xd9c7a8, 0.10); g.fillCircle(70, 70, 70);
    g.fillStyle(0xd9c7a8, 0.16); g.fillCircle(70, 70, 52);
    g.fillStyle(0xcdbd9d, 0.85); g.fillCircle(70, 70, 38);
    g.fillStyle(0xbfae8e, 0.9);  g.fillCircle(58, 60, 7);
    g.fillCircle(82, 84, 5);
    g.generateTexture('moon', 140, 140);
    g.destroy();

    // --- drifting fog band ---
    const fc = document.createElement('canvas');
    fc.width = 512; fc.height = 200;
    const fctx = fc.getContext('2d');
    const grad = fctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, 'rgba(120,105,80,0)');
    grad.addColorStop(0.5, 'rgba(120,105,80,0.16)');
    grad.addColorStop(1, 'rgba(120,105,80,0)');
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 512, 200);
    for (let i = 0; i < 26; i++) {
      fctx.beginPath();
      fctx.fillStyle = 'rgba(130,112,84,0.05)';
      fctx.ellipse(Math.random() * 512, 40 + Math.random() * 120,
                   60 + Math.random() * 90, 18 + Math.random() * 26, 0, 0, Math.PI * 2);
      fctx.fill();
    }
    this.textures.addCanvas('fog', fc);
  }

  _makePowerTextures() {
    // Four pickup orbs: nuke (red), surge (amber), shield (blue), boost (green)
    const orbs = [
      ['pow_nuke',   0xff3b1f, 0xff8c00],
      ['pow_surge',  0xf2b13c, 0xfff2c8],
      ['pow_shield', 0x46688a, 0xb0d4ff],
      ['pow_boost',  0x3d7a3b, 0xb9d96a]
    ];
    orbs.forEach(([key, inner, glow]) => {
      const g = this.make.graphics({ add: false });
      g.fillStyle(glow, 0.35); g.fillCircle(14, 14, 14);
      g.fillStyle(inner, 1);   g.fillCircle(14, 14, 8);
      g.fillStyle(0xffffff, 0.7); g.fillCircle(11, 11, 3);
      g.generateTexture(key, 28, 28);
      g.destroy();
    });

    // weapon pickup — a stubby noir rifle silhouette with an amber glow
    const gun = this.make.graphics({ add: false });
    gun.fillStyle(0xf2b13c, 0.22); gun.fillCircle(28, 20, 26);   // glow halo
    gun.fillStyle(0x2a2a30, 1);  gun.fillRect(8, 16, 40, 7);     // barrel/body
    gun.fillStyle(0x70707e, 1);  gun.fillRect(8, 16, 30, 3);     // highlight
    gun.fillStyle(0x1a1a1f, 1);  gun.fillRect(40, 14, 10, 12);   // receiver
    gun.fillStyle(0x4a3a26, 1);  gun.fillRect(44, 22, 8, 14);    // grip
    gun.fillStyle(0x4a3a26, 1);  gun.fillRect(22, 22, 6, 12);    // mag
    gun.fillStyle(0xfff2c8, 1);  gun.fillRect(6, 18, 4, 3);      // muzzle spark
    gun.generateTexture('gun_pickup', 56, 40);
    gun.destroy();
  }

  _makeGrainTextures() {
    const SIZE = 256;
    for (let f = 0; f < 3; f++) {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      const data = ctx.createImageData(SIZE, SIZE);
      for (let i = 0; i < data.data.length; i += 4) {
        const hit = Math.random() < 0.2;
        const v = hit ? Math.floor(Math.random() * 55) : 0;
        data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
        data.data[i + 3] = hit ? Math.floor(Math.random() * 46) : 0;
      }
      ctx.putImageData(data, 0, 0);
      this.textures.addCanvas('grain_' + f, canvas);
    }
  }
}

// ------------------------------------------------------------------ //
//  GAME                                                               //
// ------------------------------------------------------------------ //
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    const cam = this.cameras.main;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#0a0807');

    // ---------- backdrop ----------
    // Prefer the painted combat level art (main.png) → then the wasteland → then procedural.
    this.useCombatArt = this.textures.exists('scene_combat');
    this.useCustomBg = this.textures.exists('bg_custom');
    if (this.useCombatArt) {
      const img = this.add.image(0, 0, 'scene_combat').setOrigin(0, 0).setDepth(-25);
      const s = WORLD_H / img.height;            // fill the 720 height
      img.setScale(s);
      img.setScrollFactor(1);                     // scrolls 1:1 with the world
      this.combatArtW = img.width * s;
      // tile a flipped copy if the world is wider than the painting
      if (this.combatArtW < WORLD_W) {
        this.add.image(this.combatArtW, 0, 'scene_combat').setOrigin(0, 0).setDepth(-25).setScale(s).setFlipX(true);
      }
      this.bgFar = null; this.bgMid = null; this.bgNear = null;
    } else if (this.useCustomBg) {
      // Real nuclear-wasteland background art — single tileSprite, slow parallax scroll
      this.bgCustom = this.add.tileSprite(640, 360, 1280, 720, 'bg_custom')
        .setScrollFactor(0).setDepth(-25);
      this.bgFar = null; this.bgMid = null; this.bgNear = null;
    } else {
      // Procedural noir city fallback
      this.add.image(990, 150, 'moon').setScrollFactor(0.05, 0).setDepth(-30);
      this.bgFar  = this.add.tileSprite(640, 360, 1280, 720, 'bg_far').setScrollFactor(0).setDepth(-25);
      this.bgMid  = this.add.tileSprite(640, 360, 1280, 720, 'bg_mid').setScrollFactor(0).setDepth(-20);
      this.bgNear = this.add.tileSprite(640, 360, 1280, 720, 'bg_near').setScrollFactor(0).setDepth(-15);
    }
    this.fogA = this.add.tileSprite(640, 560, 1280, 200, 'fog').setScrollFactor(0).setDepth(-5).setAlpha(0.8);
    this.fogB = this.add.tileSprite(640, 470, 1280, 200, 'fog').setScrollFactor(0).setDepth(12).setAlpha(0.5);

    // ---------- solid world ----------
    this.solids = [];
    const street = this.add.image(WORLD_W / 2, GROUND_Y + (WORLD_H - GROUND_Y) / 2, 'street').setDepth(-2);
    this.physics.add.existing(street, true);
    this.solids.push(street);

    this.oneWays = [];
    // stair-stepped: every ledge reachable — 540 from ground, 455 from 540, 370 from 455
    [[620, 540], [1780, 540], [950, 455], [1500, 455], [1200, 370]].forEach(pos => {
      const ledge = this.add.image(pos[0], pos[1], 'ledge').setDepth(-2);
      this.physics.add.existing(ledge, true);
      ledge.body.checkCollision.down = false;
      ledge.body.checkCollision.left = false;
      ledge.body.checkCollision.right = false;
      this.oneWays.push(ledge);
    });

    // ---------- player: Eterwolf (enters the level from the LEFT) ----------
    const SPAWN_X = 160;
    this.realHero = !!window.EW;
    if (this.realHero) {
      this.player = this.physics.add.sprite(SPAWN_X, GROUND_Y - 80, 'ew_idle_0');
      const B = window.EW.body;
      this.player.body.setSize(B.w, B.h).setOffset(B.x, B.y);
      // ~120px tall in combat, whatever the source art measures
      this.player.setScale(ewScale(120, 0.5));
      this.player.play('ew-idle');
    } else {
      this.player = this.physics.add.sprite(SPAWN_X, GROUND_Y - 80, 'hero_idle_0');
      this.player.body.setSize(22, 60).setOffset(10, 6);
      this.player.play('hero-idle');
    }
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.curAnim = '';
    this.swordAnimUntil = 0;
    this.physics.add.collider(this.player, this.solids);
    this.oneWayCollider = this.physics.add.collider(this.player, this.oneWays, null, (pl) => !this.dropThrough, this);

    // procedural gun arm — only for the placeholder (Eterwolf's GIFs include the weapon)
    this.arm = this.add.image(this.player.x, this.player.y, 'hero_arm').setDepth(11);
    this.arm.setOrigin(0.12, 0.4);
    if (this.realHero) this.arm.setVisible(false);

    this.hp = 5;
    this.maxHp = 5;
    this.facing = 1;
    this.invulnUntil = 0;

    // ----- power-up state -----
    this.powers = { nuke: 0, surge: 0, shield: 0, boost: 0 };
    this.surgeUntil  = 0;   // rapid-fire active while time < this
    this.shieldUntil = 0;   // invuln + blue shimmer
    this.boostUntil  = 0;   // speed doubled
    this.lastGrounded = 0;
    this.jumpsUsed = 0;          // double jump: 0 on ground, max 2
    this.jumpBufferedAt = -9999;
    this.nextFireAt = 0;
    this.nextSwordAt = 0;
    this.nextDashAt = 0;
    this.dashUntil = 0;
    this.dropThrough = false;
    this.dead = false;
    this.kills = 0;
    this.recentKills = [];

    cam.startFollow(this.player, true, 0.12, 0.1);
    cam.setDeadzone(140, 80);

    // ---------- combat groups ----------
    this.bullets    = this.physics.add.group();
    this.zombies    = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.pickups    = this.physics.add.group();
    this.physics.add.collider(this.zombies, this.solids);
    this.physics.add.overlap(this.bullets, this.zombies, this.onBulletHit, null, this);
    this.physics.add.overlap(this.player, this.zombies, this.onTouched, null, this);
    this.physics.add.overlap(this.player, this.enemyShots, this.onEnemyShotHit, null, this);
    this.physics.add.overlap(this.player, this.pickups, this.onPickup, null, this);
    this.physics.add.collider(this.pickups, this.solids);

    // ---------- input ----------
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,F,R,M,J,K,Q');
    this.input.mouse.disableContextMenu();
    const wake = () => Sfx.ensure();
    this.input.on('pointerdown', wake);
    this.input.keyboard.on('keydown', wake);
    this.input.keyboard.on('keydown-M', () => Sfx.toggleMute());
    this.input.keyboard.on('keydown-R', () => { if (this.dead) this.scene.restart(); });
    this.input.on('pointerdown', (p) => {
      if (p.rightButtonDown()) this.swordAttack();
    });
    this.input.keyboard.on('keydown-F', () => this.swordAttack());
    this.input.keyboard.on('keydown-Q', () => this.useNuke());
    this.input.keyboard.on('keydown-J', () => this.swordAttack());
    this.input.keyboard.on('keydown-SHIFT', () => this.dash());
    // --- test keys (for tuning, harmless to ship) ---
    this.input.keyboard.on('keydown-V', () => {   // V = spawn one of each enemy
      if (this.dead) return;
      this.waveSpeed = this.waveSpeed || 55;
      ['walker', 'runner', 'brute', 'flyer', 'zomba', 'archer', 'kingo'].forEach(t => this.spawnZombie(t));
    });
    this.input.keyboard.on('keydown-B', () => {   // B = summon the boss
      if (this.dead || (this.boss && this.boss.active)) return;
      this.waveSpeed = this.waveSpeed || 55;
      this.spawnBoss();
    });
    this.input.keyboard.on('keydown-H', () => {   // H = HORDE stress test
      if (this.dead) return;
      this.waveSpeed = this.waveSpeed || 60;
      const mix = ['walker', 'walker', 'zomba', 'zomba', 'runner', 'runner', 'flyer',
                   'flyer', 'archer', 'walker', 'zomba', 'brute', 'runner', 'archer', 'kingo'];
      for (let i = 0; i < 40; i++) {
        this.time.delayedCall(i * 110, () => {
          if (!this.dead) this.spawnZombie(mix[i % mix.length]);
        });
      }
      this.showBanner('THE HORDE', 'they ALL heard you', 1500);
      Sfx.ensure(); Sfx.roar();
    });

    // jump buffering
    const bufferJump = () => { this.jumpBufferedAt = this.time.now; };
    this.input.keyboard.on('keydown-SPACE', bufferJump);
    this.input.keyboard.on('keydown-W', bufferJump);
    this.input.keyboard.on('keydown-UP', bufferJump);

    // ---------- atmosphere overlays ----------
    this.grain = this.add.tileSprite(640, 360, 1280, 720, 'grain_0')
      .setScrollFactor(0).setDepth(48).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);
    this._grainFrame = 0;
    this._addVignette();

    // ---------- HUD ----------
    this.hearts = [];
    for (let i = 0; i < this.maxHp; i++) {
      this.hearts.push(this.add.image(30 + i * 30, 30, 'heart').setScrollFactor(0).setDepth(60));
    }
    const tstyle = { fontFamily: 'Courier New, monospace', fontSize: '20px', color: '#d9c7a8' };
    this.waveText = this.add.text(1250, 18, '', tstyle).setOrigin(1, 0).setScrollFactor(0).setDepth(60);
    this.killText = this.add.text(1250, 44, '', tstyle).setOrigin(1, 0).setScrollFactor(0).setDepth(60);

    // Power-up HUD row: icons + count under the hearts
    const powDefs = [
      { key: 'nuke',  icon: 'pow_nuke',   label: 'Q:NUKE',  x: 20  },
      { key: 'surge', icon: 'pow_surge',  label: 'SURGE',   x: 120 },
      { key: 'shield',icon: 'pow_shield', label: 'SHIELD',  x: 220 },
      { key: 'boost', icon: 'pow_boost',  label: 'BOOST',   x: 320 }
    ];
    this.powHudIcons = {};
    const ptstyle = { fontFamily: 'Courier New, monospace', fontSize: '13px', color: '#d9c7a8', stroke: '#0d0a08', strokeThickness: 3 };
    powDefs.forEach(d => {
      const ic = this.add.image(d.x, 68, d.icon).setScrollFactor(0).setDepth(61).setAlpha(0.3);
      const lbl = this.add.text(d.x + 16, 62, d.label + ':0', ptstyle).setScrollFactor(0).setDepth(61).setAlpha(0.3);
      this.powHudIcons[d.key] = { ic, lbl };
    });
    this.add.text(640, 702,
      'A/D · W/Space jump ×2 · Shift dash · LMB fire · RMB/F sword · Q nuke · H horde · B boss · M mute',
      { fontFamily: 'Courier New, monospace', fontSize: '14px', color: '#8a6f4a' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(60).setAlpha(0.85);

    // ---------- boss health bar (hidden until the Alpha shows) ----------
    this.boss = null;
    this.bossBarBg = this.add.rectangle(640, 76, 420, 18, 0x0d0a08, 0.85)
      .setScrollFactor(0).setDepth(62).setStrokeStyle(2, 0x5c1d12).setVisible(false);
    this.bossBarFill = this.add.rectangle(640 - 208, 76, 416, 12, 0xc93b2a, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(63).setVisible(false);
    this.bossBarLabel = this.add.text(640, 56, 'THE ALPHA — first of the Changed', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#ff6a4a',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(63).setVisible(false);

    this.banterText = this.add.text(0, 0, '', {
      fontFamily: 'Courier New, monospace', fontSize: '16px', color: '#f2b13c',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(40).setAlpha(0);
    this.lastBanterAt = 0;

    this.bannerText = this.add.text(640, 280, '', {
      fontFamily: 'Courier New, monospace', fontSize: '52px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
    this.subBannerText = this.add.text(640, 332, '', {
      fontFamily: 'Courier New, monospace', fontSize: '20px', color: '#8a6f4a'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);

    // ---------- waves ----------
    this.wave = 0;
    this.spawnQueue = [];
    this.waveActive = false;
    this.waveTriggered = false;     // wave 1 starts when the player reaches the middle
    this.updateHud();

    // entry card — no enemies yet. The player must advance to the middle.
    this.showBanner('HALBERD BAY', 'advance to the middle of the street…', 2400);
    this.midX = WORLD_W / 2;
    // guiding arrow that points the player toward the center
    this.advanceHint = this.add.text(640, 150, '▶  ADVANCE  ▶', {
      fontFamily: 'Courier New, monospace', fontSize: '24px', color: '#f2b13c',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: this.advanceHint, alpha: 0.9, duration: 600, delay: 2400,
      yoyo: true, repeat: -1, hold: 500 });
  }

  // wave 1 fires the first time the player crosses the midpoint
  checkWaveTrigger() {
    if (this.waveTriggered || this.dead) return;
    if (this.player.x >= this.midX) {
      this.waveTriggered = true;
      if (this.advanceHint) { this.tweens.killTweensOf(this.advanceHint); this.advanceHint.setAlpha(0); }
      Sfx.ensure(); Sfx.roar();
      this.cameras.main.shake(300, 0.005);
      this.startWave(1);
    }
  }

  // ================= WAVES =================
  startWave(n) {
    if (this.dead) return;
    this.wave = n;
    const cfg = waveConfig(n);
    this.waveActive = true;
    this.spawnQueue = [];
    for (let i = 0; i < cfg.walkers; i++) this.spawnQueue.push('walker');
    for (let i = 0; i < (cfg.zombas || 0); i++) this.spawnQueue.push('zomba');
    for (let i = 0; i < cfg.runners; i++) this.spawnQueue.push('runner');
    for (let i = 0; i < cfg.brutes; i++) this.spawnQueue.push('brute');
    for (let i = 0; i < (cfg.flyers || 0); i++) this.spawnQueue.push('flyer');
    for (let i = 0; i < (cfg.archers || 0); i++) this.spawnQueue.push('archer');
    for (let i = 0; i < (cfg.kingos || 0); i++) this.spawnQueue.push('kingo');
    Phaser.Utils.Array.Shuffle(this.spawnQueue);
    this.waveSpeed = cfg.speed;

    Sfx.wave();
    if (cfg.boss) {
      this.showBanner('WAVE ' + n, 'something BIG is coming…', 2000);
      this.time.delayedCall(2300, () => { if (!this.dead) this.spawnBoss(); });
    } else {
      this.showBanner('WAVE ' + n, '', 1600);
    }
    this.sayBanter('waveStart');
    this.updateHud();
    this.scheduleNextSpawn(cfg.boss ? 4200 : 600);
  }

  scheduleNextSpawn(delay) {
    if (this.spawnQueue.length === 0) return;
    this.time.delayedCall(delay, () => {
      if (this.dead) return;
      const type = this.spawnQueue.shift();
      this.spawnZombie(type);
      this.scheduleNextSpawn(Phaser.Math.Between(650, 1250));
    });
  }

  spawnZombie(type) {
    const cam = this.cameras.main;
    const side = Math.random() < 0.5 ? -1 : 1;
    let x = side < 0 ? cam.scrollX - 50 : cam.scrollX + 1280 + 50;
    x = Phaser.Math.Clamp(x, 30, WORLD_W - 30);

    // edge-of-screen warning marker
    const warnX = side < 0 ? 24 : 1256;
    const warn = this.add.image(warnX, GROUND_Y - 60, 'warn').setScrollFactor(0).setDepth(55);
    this.tweens.add({ targets: warn, alpha: 0, duration: 700, onComplete: () => warn.destroy() });

    const speedJitter = 0.85 + Math.random() * 0.3;
    let z;
    if (type === 'zomba' && this.textures.exists('mob_zomba')) {
      z = this.physics.add.sprite(x, GROUND_Y - 40, 'mob_zomba');
      z.body.setSize(40, 60).setOffset(20, 8);
      z.setData({ hp: 3, speed: this.waveSpeed * 0.9 * speedJitter, dmg: 1, type: type });
      this.wobble(z);
    } else if (type === 'archer' && this.textures.exists('mob_archer')) {
      z = this.physics.add.sprite(x, GROUND_Y - 40, 'mob_archer');
      z.body.setSize(36, 60).setOffset(17, 8);
      z.setData({ hp: 2, speed: this.waveSpeed * 0.8 * speedJitter, dmg: 1, type: type });
      z.setData('nextShotAt', this.time.now + 1500 + Math.random() * 1200);
      this.wobble(z);
    } else if (type === 'kingo' && this.textures.exists('mob_kingo')) {
      z = this.physics.add.sprite(x, GROUND_Y - 60, 'mob_kingo');
      z.body.setSize(70, 86).setOffset(20, 14);
      z.setData({ hp: 18, speed: this.waveSpeed * 0.5 * speedJitter, dmg: 2, type: type });
      this.wobble(z, 2);
    } else if (type === 'brute') {
      z = this.physics.add.sprite(x, GROUND_Y - 60, 'brute_0');
      z.body.setSize(48, 70).setOffset(8, 6);
      z.play('brute-walk');
      z.setData({ hp: 9, speed: this.waveSpeed * 0.55 * speedJitter, dmg: 2, type: type });
    } else if (type === 'flyer') {
      z = this.physics.add.sprite(x, GROUND_Y - 220 - Math.random() * 120, 'flyer_0');
      z.body.allowGravity = false;
      z.body.setSize(30, 20).setOffset(6, 6);
      z.play('flyer-fly');
      z.setData({ hp: 2, speed: this.waveSpeed * 1.4 * speedJitter, dmg: 1, type: type });
      z.setData('seed', Math.random() * 10);
      z.setData('nextSwoopAt', this.time.now + 2000 + Math.random() * 1500);
      z.setData('swoopUntil', 0);
    } else if (type === 'runner') {
      z = this.physics.add.sprite(x, GROUND_Y - 40, 'runner_0');
      z.body.setSize(20, 42).setOffset(6, 4);
      z.play('runner-walk');
      z.setData({ hp: 1, speed: this.waveSpeed * 2.1 * speedJitter, dmg: 1, type: type });
    } else {
      // walker — use one of the animated ZOMB sets when available (they face LEFT)
      const sets = window.ZOMBS ? Object.keys(window.ZOMBS) : [];
      if (sets.length && this.textures.exists('zomb_' + sets[0] + '_0')) {
        const S = sets[Math.floor(Math.random() * sets.length)];
        const zi = window.ZOMBS[S];
        z = this.physics.add.sprite(x, GROUND_Y - 70, 'zomb_' + S + '_0');
        z.setScale(1.5);
        z.body.setSize(Math.round(zi.w * 0.55), zi.h - 4).setOffset(Math.round(zi.w * 0.22), 4);
        z.play('zw-' + S);
        z.setData('faceLeft', true);
        z.setData({ hp: 2, speed: this.waveSpeed * speedJitter, dmg: 1, type: type });
      } else {
        z = this.physics.add.sprite(x, GROUND_Y - 50, 'zombie_0');
        z.body.setSize(22, 58).setOffset(7, 5);
        z.play('zombie-walk');
        z.setData({ hp: 2, speed: this.waveSpeed * speedJitter, dmg: 1, type: type });
      }
    }
    z.setData('knockUntil', 0);
    z.setData('alive', true);
    z.setDepth(8);
    z.setCollideWorldBounds(true);
    this.zombies.add(z);
  }

  // ================= POWERS =================
  dropPickup(x, y) {
    // boss always drops, others: brute 60%, walker/runner 15%
    const roll = Math.random();
    const types = ['nuke', 'surge', 'shield', 'boost'];
    const type = types[Math.floor(Math.random() * types.length)];
    const pk = this.pickups.create(x, y - 20, 'pow_' + type);
    pk.setData('ptype', type);
    pk.setDepth(5);
    pk.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: pk, y: pk.y - 18, alpha: 0.85, duration: 500, yoyo: true, repeat: -1 });
    return pk;
  }

  onPickup(player, pk) {
    if (!pk.active) return;
    const type = pk.getData('ptype');
    this.tweens.killTweensOf(pk);
    pk.destroy();
    this.powers[type] = (this.powers[type] || 0) + 1;
    this.updatePowHud();

    // flash the screen
    const fl = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0.18).setScrollFactor(0).setDepth(75);
    this.tweens.add({ targets: fl, alpha: 0, duration: 180, onComplete: () => fl.destroy() });

    const names = { nuke: '☢ NUKE', surge: '⚡ SURGE', shield: '🛡 SHIELD', boost: '💨 BOOST' };
    this.showBanner(names[type] || type.toUpperCase(), 'press Q to use nuke · others activate instantly', 1800);
    Sfx.clear();

    // surge/shield/boost activate immediately on pickup
    const time = this.time.now;
    if (type === 'surge') {
      this.powers.surge--;
      this.surgeUntil = Math.max(this.surgeUntil, time) + 7000;
      this.updatePowHud();
    } else if (type === 'shield') {
      this.powers.shield--;
      this.shieldUntil = Math.max(this.shieldUntil, time) + 6000;
      this.invulnUntil = this.shieldUntil;
      this.updatePowHud();
    } else if (type === 'boost') {
      this.powers.boost--;
      this.boostUntil = Math.max(this.boostUntil, time) + 8000;
      this.updatePowHud();
    }
    // nuke stays in inventory until Q
  }

  useNuke() {
    if (this.dead || this.powers.nuke <= 0) return;
    this.powers.nuke--;
    this.updatePowHud();
    Sfx.ensure(); Sfx.roar();

    // screen blast
    const flash = this.add.rectangle(640, 360, 1280, 720, 0xff8800, 0.72).setScrollFactor(0).setDepth(74);
    this.tweens.add({ targets: flash, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
    this.cameras.main.shake(600, 0.018);
    this.showBanner('☢ ATOMIC STRIKE', 'everything burns', 2000);
    Sfx.blip(60, 0.6, 'sawtooth', 0.55, 30);

    // kill every enemy with expanding ring effect
    this.zombies.getChildren().forEach((z, i) => {
      if (!z.active || !z.getData('alive')) return;
      this.time.delayedCall(i * 35, () => {
        if (z.active) {
          const boom = this.add.image(z.x, z.y, 'flash_0').setDepth(20).setScale(1.5)
            .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8800);
          this.tweens.add({ targets: boom, scale: 4, alpha: 0, duration: 400, onComplete: () => boom.destroy() });
          this.damageZombie(z, 999, 0, false);
        }
      });
    });
  }

  updatePowHud() {
    const time = this.time.now;
    Object.entries(this.powHudIcons).forEach(([key, { ic, lbl }]) => {
      const n = this.powers[key] || 0;
      const active = (key === 'surge' && time < this.surgeUntil)
                  || (key === 'shield' && time < this.shieldUntil)
                  || (key === 'boost' && time < this.boostUntil);
      const bright = n > 0 || active;
      ic.setAlpha(bright ? 1 : 0.28);
      lbl.setAlpha(bright ? 1 : 0.28);
      const labels = { nuke: 'Q:NUKE', surge: 'SURGE', shield: 'SHIELD', boost: 'BOOST' };
      const suffix = active ? '★' : ':' + n;
      lbl.setText(labels[key] + suffix);
      if (active) lbl.setColor('#f2b13c'); else lbl.setColor('#d9c7a8');
    });
  }

  // static PNG monsters get a shamble-wobble so they read as alive
  wobble(z, amp) {
    amp = amp || 4;
    this.tweens.add({ targets: z, angle: { from: -amp, to: amp }, yoyo: true, repeat: -1, duration: 260 + Math.random() * 120 });
  }

  spawnBoss() {
    const cam = this.cameras.main;
    const side = this.player.x > WORLD_W / 2 ? -1 : 1;   // enters from the far side
    const x = side < 0
      ? Math.max(90, cam.scrollX - 80)
      : Math.min(WORLD_W - 90, cam.scrollX + 1360);
    const z = this.physics.add.sprite(x, GROUND_Y - 80, 'boss_0');
    z.body.setSize(86, 118).setOffset(14, 10);
    z.play('boss-walk');
    const hpMax = 60 + Math.max(0, this.wave - 5) * 6;   // returns stronger in endless
    z.setData({
      hp: hpMax, hpMax: hpMax, speed: 28, dmg: 2, type: 'boss',
      state: 'walk', nextChargeAt: this.time.now + 3000, stateUntil: 0, chargeDir: 1
    });
    z.setData('knockUntil', 0);
    z.setData('alive', true);
    z.setDepth(9);
    z.setCollideWorldBounds(true);
    this.zombies.add(z);
    this.boss = z;
    this.bossBarBg.setVisible(true);
    this.bossBarFill.setVisible(true).setScale(1, 1);
    this.bossBarLabel.setVisible(true);
    Sfx.ensure(); Sfx.roar();
    this.cameras.main.shake(500, 0.006);
  }

  updateBoss(z, time) {
    const dx = this.player.x - z.x;
    const dir = dx >= 0 ? 1 : -1;
    const state = z.getData('state');

    if (state === 'walk') {
      z.setFlipX(dir < 0);
      z.setVelocityX(dir * z.getData('speed'));
      if (time > z.getData('nextChargeAt') && Math.abs(dx) < 760) {
        z.setData('state', 'tele');
        z.setData('stateUntil', time + 850);
        z.setVelocityX(0);
        Sfx.roar();
        this.cameras.main.shake(220, 0.003);
      }
    } else if (state === 'tele') {
      // the ONE telegraphed attack (bible M7): red flicker wind-up, then charge
      if (Math.floor(time / 90) % 2 === 0) z.setTintFill(0xff3b1f); else z.clearTint();
      if (time > z.getData('stateUntil')) {
        z.clearTint();
        z.setData('state', 'charge');
        z.setData('chargeDir', dir);
        z.setData('stateUntil', time + 1100);
      }
    } else if (state === 'charge') {
      z.setVelocityX(z.getData('chargeDir') * 310);
      if (time > z.getData('stateUntil') || z.body.blocked.left || z.body.blocked.right) {
        z.setData('state', 'stagger');                  // missed — now he's open
        z.setData('stateUntil', time + 1400);
        z.setVelocityX(0);
        this.cameras.main.shake(180, 0.006);
        const puff = this.add.image(z.x, GROUND_Y - 12, 'puff').setDepth(6).setScale(2);
        this.tweens.add({ targets: puff, alpha: 0, scale: 4, duration: 400, onComplete: () => puff.destroy() });
      }
    } else if (state === 'stagger') {
      z.setVelocityX(0);
      if (time > z.getData('stateUntil')) {
        z.setData('state', 'walk');
        z.setData('nextChargeAt', time + 2400 + Math.random() * 1600);
      }
    }
  }

  checkWaveCleared() {
    if (!this.waveActive || this.dead) return;
    if (this.spawnQueue.length > 0) return;
    if (this.zombies.countActive(true) > 0) return;
    this.waveActive = false;

    if (this.wave === 5) {
      Sfx.clear();
      this.showBanner('STAGE 1 CLEAR', 'endless mode — how long can the Spark burn?', 3400);
      this.sayBanter('clear');
      this.time.delayedCall(4200, () => this.startWave(this.wave + 1));
    } else {
      this.showBanner('WAVE ' + this.wave + ' CLEARED', 'breathe.', 1400);
      this.time.delayedCall(3200, () => this.startWave(this.wave + 1));
    }
  }

  // ================= COMBAT =================
  fireBullet(time, straight, surge) {
    const cd = surge ? 55 : 150;
    if (time < this.nextFireAt || this.dead) return;
    this.nextFireAt = time + cd;
    Sfx.ensure(); Sfx.shoot();

    // keyboard fire (K) shoots straight ahead in facing dir; mouse aims freely
    const base = straight ? (this.facing > 0 ? 0 : Math.PI) : this.aimAngle;
    const angle = base + (Math.random() - 0.5) * 0.05;
    let muzzleX, muzzleY;
    if (this.realHero) {
      muzzleX = this.player.x + this.facing * window.EW.muzzle.dx * this.player.scaleX;
      muzzleY = this.player.y + window.EW.muzzle.dy * this.player.scaleY;
    } else {
      muzzleX = this.arm.x + Math.cos(angle) * 38;
      muzzleY = this.arm.y + Math.sin(angle) * 38;
    }

    const b = this.bullets.create(muzzleX, muzzleY, 'bullet');
    b.body.allowGravity = false;
    b.setRotation(angle);
    b.setDepth(9);
    b.setBlendMode(Phaser.BlendModes.ADD);
    this.physics.velocityFromRotation(angle, 950, b.body.velocity);
    b.setData('bornAt', time);

    // muzzle flash + tiny recoil shake
    const fl = this.add.image(muzzleX, muzzleY, 'flash_0').setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    fl.setRotation(angle);
    this.tweens.add({ targets: fl, alpha: 0, scale: 0.4, duration: 60, onComplete: () => fl.destroy() });
    this.cameras.main.shake(28, 0.0009);
  }

  onBulletHit(bullet, zombie) {
    if (!zombie.getData('alive')) return;
    const dir = bullet.body.velocity.x >= 0 ? 1 : -1;
    bullet.destroy();
    this.damageZombie(zombie, 1, dir * 140, false);
  }

  swordAttack() {
    const time = this.time.now;
    if (time < this.nextSwordAt || this.dead) return;
    this.nextSwordAt = time + (this.realHero ? 620 : 420);
    Sfx.ensure(); Sfx.sword();

    // play the swing animation for its actual duration (asset-agnostic)
    if (this.realHero) {
      const swordKey = ewAnim('ew-sword', this.facing);
      this.player.play(swordKey);
      this.curAnim = swordKey;
      const sa = this.anims.get(swordKey);
      this.swordAnimUntil = time + (sa ? sa.duration : 340) + 40;
    }

    const dir = this.facing;
    const sl = this.add.image(this.player.x + dir * 42, this.player.y - 6, 'slash')
      .setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    sl.setFlipX(dir < 0);
    sl.setScale(0.7);
    this.tweens.add({ targets: sl, alpha: 0, scaleX: 1.15, scaleY: 1.15, duration: 140, onComplete: () => sl.destroy() });

    let hitAny = false;
    this.zombies.getChildren().forEach(z => {
      if (!z.active || !z.getData('alive')) return;
      const dx = z.x - this.player.x;
      const dy = Math.abs(z.y - this.player.y);
      if (dy < 70 && dx * dir > -12 && Math.abs(dx) < 95) {
        hitAny = true;
        this.damageZombie(z, 3, dir * 320, true);
      }
    });
    if (hitAny) this.cameras.main.shake(70, 0.004);
  }

  damageZombie(z, dmg, knockX, fromSword) {
    const type = z.getData('type');
    // staggered boss takes double damage — reward punishing the missed charge
    let finalDmg = dmg;
    if (type === 'boss' && z.getData('state') === 'stagger') finalDmg = dmg * 2;

    const hp = z.getData('hp') - finalDmg;
    z.setData('hp', hp);
    Sfx.hit();

    z.setTintFill(0xffffff);
    this.time.delayedCall(60, () => { if (z.active) z.clearTint(); });

    z.setData('knockUntil', this.time.now + 160);
    const resist = type === 'brute' ? 0.35 : (type === 'boss' ? 0 : 1);
    if (resist > 0) z.setVelocityX(knockX * resist);

    if (type === 'boss') {
      this.bossBarFill.setScale(Math.max(0, hp / z.getData('hpMax')), 1);
    }

    if (hp <= 0) this.killZombie(z, fromSword);
  }

  killZombie(z, fromSword) {
    z.setData('alive', false);
    z.body.enable = false;
    this.tweens.killTweensOf(z);   // stop the shamble-wobble before the death tween
    Sfx.squelch();

    if (z.getData('type') === 'boss') {
      this.boss = null;
      this.bossBarBg.setVisible(false);
      this.bossBarFill.setVisible(false);
      this.bossBarLabel.setVisible(false);
      Sfx.roar(); Sfx.clear();
      this.cameras.main.shake(550, 0.012);
      this.showBanner('THE ALPHA FALLS', 'the street goes quiet', 2600);
      for (let i = -2; i <= 2; i++) {
        const bs = this.add.image(z.x + i * 34, GROUND_Y - 5, 'splat')
          .setDepth(0).setAlpha(0.9).setScale(1.4);
        this.tweens.add({ targets: bs, alpha: 0, duration: 12000, onComplete: () => bs.destroy() });
      }
    }

    this.kills++;
    const now = this.time.now;
    // power drop: boss = always, brute/kingo = 55%, others = 14%
    const dtype = z.getData('type');
    const dropChance = dtype === 'boss' ? 2.0 : (dtype === 'brute' || dtype === 'kingo') ? 0.55 : 0.14;
    if (Math.random() < dropChance) this.dropPickup(z.x, GROUND_Y);
    this.recentKills.push(now);
    this.recentKills = this.recentKills.filter(t => now - t < 2200);
    if (this.recentKills.length >= 4) {
      this.sayBanter('streak');
      this.recentKills = [];
    } else if (fromSword) {
      this.sayBanter('swordKill', 0.55);
    } else if (Math.random() < 0.16) {
      this.sayBanter('kill', 0.8);
    }
    this.updateHud();

    // dark splat stays on the street
    const splat = this.add.image(z.x, GROUND_Y - 5, 'splat').setDepth(0).setAlpha(0.85);
    this.tweens.add({ targets: splat, alpha: 0, duration: 9000, onComplete: () => splat.destroy() });

    // topple + fade
    const fall = (z.body.velocity.x >= 0 ? 1 : -1) * 90;
    z.anims.stop();
    this.tweens.add({
      targets: z, angle: fall, alpha: 0, y: z.y + 10, duration: 380,
      onComplete: () => z.destroy()
    });

    this.time.delayedCall(60, () => this.checkWaveCleared());
  }

  onEnemyShotHit(player, shot) {
    shot.destroy();
    if (this.dead) return;
    const time = this.time.now;
    if (time < this.invulnUntil || time < this.dashUntil) return;
    this.hp -= 1;
    this.invulnUntil = time + 950;
    Sfx.hurt();
    this.cameras.main.shake(120, 0.006);
    this.player.setTintFill(0xff3b1f);
    this.time.delayedCall(110, () => { if (!this.dead) this.player.clearTint(); });
    this.tweens.add({ targets: this.player, alpha: 0.35, duration: 90, yoyo: true, repeat: 4,
      onComplete: () => this.player.setAlpha(1) });
    this.sayBanter('hurt', 0.8);
    this.updateHud();
    if (this.hp <= 0) this.gameOver();
  }

  onTouched(player, z) {
    if (!z.getData('alive') || this.dead) return;
    const time = this.time.now;
    if (time < this.invulnUntil || time < this.dashUntil) return;

    this.hp -= z.getData('dmg');
    this.invulnUntil = time + 950;
    Sfx.hurt();
    this.cameras.main.shake(160, 0.008);

    this.player.setTintFill(0xff3b1f);
    this.time.delayedCall(110, () => { if (!this.dead) this.player.clearTint(); });
    // blink during i-frames
    this.tweens.add({ targets: this.player, alpha: 0.35, duration: 90, yoyo: true, repeat: 4,
      onComplete: () => this.player.setAlpha(1) });

    const away = this.player.x < z.x ? -1 : 1;
    this.player.setVelocity(away * 330, -260);
    this.sayBanter('hurt', 0.8);
    this.updateHud();

    if (this.hp <= 0) this.gameOver();
  }

  gameOver() {
    this.dead = true;
    this.player.setTintFill(0x661a10);
    this.player.setVelocityX(0);
    this.arm.setVisible(false);
    this.bossBarBg.setVisible(false);
    this.bossBarFill.setVisible(false);
    this.bossBarLabel.setVisible(false);
    this.zombies.getChildren().forEach(z => { if (z.active) { z.setVelocityX(0); z.anims.stop(); } });

    const ov = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.62).setScrollFactor(0).setDepth(80);
    ov.setAlpha(0);
    this.tweens.add({ targets: ov, alpha: 1, duration: 600 });
    this.add.text(640, 300, 'ETERWOLF DOWN', {
      fontFamily: 'Courier New, monospace', fontSize: '58px', color: '#c93b2a',
      stroke: '#0d0a08', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);
    this.add.text(640, 360, '"' + Phaser.Utils.Array.GetRandom(BANTER.down) + '"', {
      fontFamily: 'Courier New, monospace', fontSize: '20px', color: '#d9c7a8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);
    this.add.text(640, 420, 'waves survived: ' + (this.wave - 1) + ' · kills: ' + this.kills, {
      fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#8a6f4a'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);
    this.add.text(640, 470, 'press R to run it back', {
      fontFamily: 'Courier New, monospace', fontSize: '22px', color: '#f2b13c'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);
  }

  // ================= MOVEMENT =================
  dash() {
    const time = this.time.now;
    if (time < this.nextDashAt || this.dead) return;
    this.nextDashAt = time + 900;
    this.dashUntil = time + 260;
    Sfx.ensure(); Sfx.dash();

    let dir = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) dir = -1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) dir = 1;
    if (dir === 0) dir = this.facing;

    this.player.setVelocityX(dir * 760);
    this.player.setVelocityY(0);

    // afterimages
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 50, () => {
        if (this.dead) return;
        const ghost = this.add.image(this.player.x, this.player.y, this.player.texture.key)
          .setDepth(7).setAlpha(0.3).setFlipX(this.player.flipX).setTint(0x46688a)
          .setScale(this.player.scaleX, this.player.scaleY);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 240, onComplete: () => ghost.destroy() });
      });
    }
  }

  // ================= PRESENTATION HELPERS =================
  showBanner(big, small, holdMs) {
    this.bannerText.setText(big);
    this.subBannerText.setText(small || '');
    this.bannerText.setScale(0.8);
    this.tweens.add({ targets: this.bannerText, alpha: 1, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.Out' });
    this.tweens.add({ targets: this.subBannerText, alpha: 1, duration: 300 });
    this.time.delayedCall(holdMs, () => {
      this.tweens.add({ targets: [this.bannerText, this.subBannerText], alpha: 0, duration: 350 });
    });
  }

  sayBanter(category, chance) {
    const time = this.time.now;
    if (chance !== undefined && Math.random() > chance) return;
    if (time - this.lastBanterAt < 2400) return;
    this.lastBanterAt = time;
    const line = Phaser.Utils.Array.GetRandom(BANTER[category]);
    this.banterText.setText(line);
    this.banterText.setAlpha(1);
    this.tweens.add({ targets: this.banterText, alpha: 0, duration: 500, delay: 1500 });
  }

  updateHud() {
    this.hearts.forEach((heart, i) => heart.setAlpha(i < this.hp ? 1 : 0.18));
    this.waveText.setText('WAVE ' + Math.max(1, this.wave) + (this.wave > 5 ? ' · ENDLESS' : ''));
    this.killText.setText('KILLS ' + this.kills);
  }

  _addVignette() {
    const W = 1280, H = 720;
    const gfx = this.add.graphics().setScrollFactor(0).setDepth(50);
    const BAND = Math.round(Math.min(W, H) * 0.36);
    const STEPS = 22;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const alpha = t * t * t * 0.6;
      const d = Math.round((1 - t) * BAND);
      if (d <= 0) continue;
      gfx.fillStyle(0x000000, alpha);
      gfx.fillRect(0, 0, W, d);
      gfx.fillRect(0, H - d, W, d);
      gfx.fillRect(0, 0, d, H);
      gfx.fillRect(W - d, 0, d, H);
    }
  }

  // ================= MAIN LOOP =================
  update(time, delta) {
    const cam = this.cameras.main;

    // parallax + fog drift + grain
    if (this.useCombatArt) {
      // painted level scrolls 1:1 with the camera — nothing to shift
    } else if (this.useCustomBg) {
      this.bgCustom.tilePositionX = cam.scrollX * 0.22;
    } else {
      this.bgFar.tilePositionX = cam.scrollX * 0.12;
      this.bgMid.tilePositionX = cam.scrollX * 0.3;
      this.bgNear.tilePositionX = cam.scrollX * 0.55;
    }
    this.fogA.tilePositionX += delta * 0.012;
    this.fogB.tilePositionX -= delta * 0.02;
    if (this.game.loop.frame % 3 === 0) {
      this._grainFrame = (this._grainFrame + 1) % 3;
      this.grain.setTexture('grain_' + this._grainFrame);
      this.grain.tilePositionX = Math.random() * 256;
      this.grain.tilePositionY = Math.random() * 256;
    }

    if (this.dead) return;

    // wave 1 ignites once the player advances to the middle
    this.checkWaveTrigger();

    // ----- power state (computed early so boostActive is available to movement) -----
    const surgeActive  = time < this.surgeUntil;
    const shieldActive = time < this.shieldUntil;
    const boostActive  = time < this.boostUntil;
    if (shieldActive) {
      if (Math.floor(time / 120) % 2 === 0) this.player.setTint(0x88ccff);
      else this.player.clearTint();
      this.invulnUntil = this.shieldUntil;
    }

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    if (onGround) { this.lastGrounded = time; this.jumpsUsed = 0; }

    // ----- aim -----
    const pointer = this.input.activePointer;
    const world = cam.getWorldPoint(pointer.x, pointer.y);
    this.aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 14, world.x, world.y);

    // ----- fire intent (needed by facing + anim state machine) -----
    const firing = (pointer.isDown && pointer.button === 0 && !pointer.rightButtonDown())
                || this.keys.K.isDown;

    // ----- movement input (read first: movement keys flip facing INSTANTLY) -----
    let move = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) move -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) move += 1;

    // facing priority: movement keys > mouse aim while firing > keep last
    if (move !== 0) this.facing = move;
    else if (firing && pointer.isDown) this.facing = (Math.abs(this.aimAngle) <= Math.PI / 2) ? 1 : -1;

    // ----- horizontal movement -----
    const dashing = time < this.dashUntil;
    if (!dashing) {
      this.player.setVelocityX(move * (boostActive ? 580 : 340));

      // drop through one-way ledges with S/Down + jump press
      this.dropThrough = (this.keys.S.isDown || this.keys.DOWN.isDown);

      // ----- jump: buffered + coyote time + DOUBLE JUMP -----
      const wantsJump = time - this.jumpBufferedAt < 130;
      const coyoteOk = time - this.lastGrounded < 100;
      const canGroundJump = coyoteOk && this.jumpsUsed === 0;
      const canAirJump = !coyoteOk && this.jumpsUsed < 2;
      if (wantsJump && (canGroundJump || canAirJump) && !this.dropThrough) {
        const second = canAirJump && !canGroundJump;
        this.player.setVelocityY(second ? -560 : -640);
        this.jumpsUsed = second ? 2 : 1;
        this.jumpBufferedAt = -9999;
        this.lastGrounded = -9999;
        Sfx.ensure(); Sfx.jump();
        const puff = this.add.image(this.player.x, this.player.y + (second ? 10 : 30), 'puff').setDepth(6);
        if (second) puff.setTint(0x46688a);    // blue flicker on the air jump
        this.tweens.add({ targets: puff, alpha: 0, scale: second ? 2.6 : 2, duration: 260, onComplete: () => puff.destroy() });
      }
      // variable jump height
      const jumpHeld = this.keys.SPACE.isDown || this.keys.W.isDown || this.keys.UP.isDown;
      if (!jumpHeld && this.player.body.velocity.y < -220) this.player.setVelocityY(-220);
    }

    // ----- animation state -----
    ewFlip(this.player, this.facing);
    const moving = Math.abs(this.player.body.velocity.x) > 20;
    if (this.realHero) {
      // sword swing owns the sprite until it finishes
      if (time < this.swordAnimUntil) {
        // let it play
      } else {
        let want;
        if (!onGround) want = 'ew-jump';            // freezes on the tucked frame
        else if (firing) want = 'ew-runshoot';      // ONLY run-shoot gif, never the gun-lift one
        else if (moving) want = 'ew-run';
        else want = 'ew-idle';
        want = ewAnim(want, this.facing);
        if (this.curAnim !== want) {
          this.player.play(want);
          this.curAnim = want;
        }
      }
    } else {
      if (!onGround) this.player.play('hero-air', true);
      else if (moving) this.player.play('hero-run', true);
      else this.player.play('hero-idle', true);

      // gun arm follows aim (placeholder only)
      this.arm.setPosition(this.player.x + this.facing * 3, this.player.y - 14);
      this.arm.setRotation(this.aimAngle);
      this.arm.setFlipY(this.facing < 0);
    }

    // ----- fire -----
    if (firing) this.fireBullet(time, this.keys.K.isDown && !pointer.isDown, surgeActive);

    // ----- bullets: cull -----
    this.bullets.getChildren().forEach(b => {
      if (!b.active) return;
      if (time - b.getData('bornAt') > 1100 || b.x < -40 || b.x > WORLD_W + 40 || b.y < -40 || b.y > WORLD_H + 40) {
        b.destroy();
      }
    });
    this.enemyShots.getChildren().forEach(b => {
      if (!b.active) return;
      if (time - b.getData('bornAt') > 2500 || b.x < -40 || b.x > WORLD_W + 40 || b.y < -40 || b.y > WORLD_H + 40) {
        b.destroy();
      }
    });

    // ----- banter follows player -----
    this.banterText.setPosition(this.player.x, this.player.y - 52);

    // ----- enemy AI -----
    this.zombies.getChildren().forEach(z => {
      if (!z.active || !z.getData('alive')) return;
      const type = z.getData('type');

      if (type === 'boss') { this.updateBoss(z, time); return; }
      if (time < z.getData('knockUntil')) return;

      const dx = this.player.x - z.x;
      const dir = dx >= 0 ? 1 : -1;
      z.setFlipX(z.getData('faceLeft') ? dir > 0 : dir < 0);

      if (type === 'flyer') {
        // mid-swoop: let the dive play out
        if (time < z.getData('swoopUntil')) return;
        // start a swoop at the player
        if (time > z.getData('nextSwoopAt') && Math.abs(dx) < 300) {
          z.setData('swoopUntil', time + 480);
          z.setData('nextSwoopAt', time + 2600 + Math.random() * 1600);
          const ang = Phaser.Math.Angle.Between(z.x, z.y, this.player.x, this.player.y - 10);
          this.physics.velocityFromRotation(ang, 330, z.body.velocity);
          Sfx.swoop();
          return;
        }
        // hover above the player on a sine bob
        const targetY = this.player.y - 120 + Math.sin(time * 0.004 + z.getData('seed')) * 34;
        z.setVelocityX(dir * z.getData('speed'));
        z.setVelocityY(Phaser.Math.Clamp((targetY - z.y) * 2.4, -170, 170));
        return;
      }

      // archers hold range and shoot
      if (type === 'archer') {
        const dist = Math.abs(dx);
        if (dist > 340) z.setVelocityX(dir * z.getData('speed'));
        else if (dist < 220) z.setVelocityX(-dir * z.getData('speed') * 0.7);
        else z.setVelocityX(0);
        if (dist < 560 && time > z.getData('nextShotAt')) {
          z.setData('nextShotAt', time + 2100 + Math.random() * 800);
          const ang = Phaser.Math.Angle.Between(z.x, z.y - 10, this.player.x, this.player.y - 10);
          const shot = this.enemyShots.create(z.x, z.y - 10, 'bullet');
          shot.body.allowGravity = false;
          shot.setTint(0xb9d96a).setRotation(ang).setDepth(9);
          this.physics.velocityFromRotation(ang, 380, shot.body.velocity);
          shot.setData('bornAt', time);
          Sfx.blip(420, 0.08, 'square', 0.2, 700);
        }
        return;
      }

      z.setVelocityX(dir * z.getData('speed'));

      const zGrounded = z.body.blocked.down || z.body.touching.down;
      // runners lunge when close
      if (type === 'runner' && Math.abs(dx) < 150 && zGrounded && Math.random() < 0.01) {
        z.setVelocity(dir * z.getData('speed') * 1.8, -380);
      }
      // the Changed can hop up at a camping player — "they can JUMP?!"
      if (this.player.y < z.y - 70 && Math.abs(dx) < 90 && zGrounded && Math.random() < 0.008) {
        z.setVelocityY(-680);
      }
    });
  }
}

// ================================================================== //
//  SHARED: a walkable Eterwolf for the exploration scenes            //
//  (no combat — just run / idle / jump and trigger exit zones)       //
// ================================================================== //
function makeWalker(scene, x, groundY) {
  let p;
  if (window.EW) {
    // sheet frames are ~245px tall — rendered at ~0.85 he reads life-size in interiors
    p = scene.physics.add.sprite(x, groundY - 140, 'ew_idle_0');
    const B = window.EW.body;
    p.body.setSize(B.w, B.h).setOffset(B.x, B.y);
    // ~190px tall in walk scenes so he reads life-size in interiors
    p.setScale(ewScale(190, 0.85));
    p.play('ew-idle');
    p._real = true;
  } else {
    p = scene.physics.add.sprite(x, groundY - 80, 'hero_idle_0');
    p.body.setSize(22, 60).setOffset(10, 6);
    p.play('hero-idle');
    p._real = false;
  }
  p.setCollideWorldBounds(true);
  p.setDepth(10);
  p._facing = 1;
  p._curAnim = '';
  return p;
}

function driveWalker(scene, p, keys, onGround) {
  let move = 0;
  if (keys.A.isDown || keys.LEFT.isDown)  move -= 1;
  if (keys.D.isDown || keys.RIGHT.isDown) move += 1;
  if (move !== 0) p._facing = move;
  p.setVelocityX(move * 330);

  const wantJump = Phaser.Input.Keyboard.JustDown(keys.W)
                || Phaser.Input.Keyboard.JustDown(keys.SPACE)
                || Phaser.Input.Keyboard.JustDown(keys.UP);
  if (wantJump && onGround) { p.setVelocityY(-640); Sfx.ensure(); Sfx.jump(); }

  ewFlip(p, p._facing);
  const moving = Math.abs(p.body.velocity.x) > 20;
  if (p._real) {
    let want = !onGround ? 'ew-jump' : (moving ? 'ew-run' : 'ew-idle');
    want = ewAnim(want, p._facing);
    if (p._curAnim !== want) { p.play(want); p._curAnim = want; }
  } else {
    if (!onGround) p.play('hero-air', true);
    else if (moving) p.play('hero-run', true);
    else p.play('hero-idle', true);
  }
  return move;
}

// ================================================================== //
//  MENU                                                               //
// ================================================================== //
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const W = 1280, H = 720;
    if (this.textures.exists('scene_menu')) {
      const img = this.add.image(W / 2, H / 2, 'scene_menu');
      const s = Math.max(W / img.width, H / img.height);   // cover
      img.setScale(s);
    } else {
      // procedural title fallback
      this.cameras.main.setBackgroundColor('#0a0807');
      this.add.text(W / 2, 180, 'ATOMHOWL', {
        fontFamily: 'Courier New, monospace', fontSize: '90px', color: '#d9c7a8',
        stroke: '#0d0a08', strokeThickness: 10
      }).setOrigin(0.5);
      this.add.text(W / 2, 250, '1957 · the old world is gone', {
        fontFamily: 'Courier New, monospace', fontSize: '20px', color: '#8a6f4a'
      }).setOrigin(0.5);
    }

    // clickable button zones over the painted buttons (menu art at cover-scale)
    const mkBtn = (y, label, onPick) => {
      const zone = this.add.rectangle(W / 2, y, 320, 60, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(W / 2, y, label, {
        fontFamily: 'Courier New, monospace', fontSize: '30px', color: '#f2b13c',
        stroke: '#0d0a08', strokeThickness: 6
      }).setOrigin(0.5).setAlpha(this.textures.exists('scene_menu') ? 0.001 : 1);
      const glow = this.add.rectangle(W / 2, y, 330, 64, 0xf2b13c, 0).setStrokeStyle(2, 0xf2b13c, 0);
      zone.on('pointerover', () => { glow.setStrokeStyle(3, 0xf2b13c, 0.9); txt.setAlpha(1).setColor('#fff2c8'); });
      zone.on('pointerout',  () => { glow.setStrokeStyle(2, 0xf2b13c, 0); if (this.textures.exists('scene_menu')) txt.setAlpha(0.001); txt.setColor('#f2b13c'); });
      zone.on('pointerdown', () => { Sfx.ensure(); Sfx.wave(); onPick(); });
      return zone;
    };

    // positions tuned to the menu art (1 PLAYER ≈ y343, 2 PLAYERS ≈ y435)
    mkBtn(343, '1 PLAYER', () => this.scene.start('BunkerScene'));
    mkBtn(435, '2 PLAYERS', () => this.flashSoon());

    this.input.keyboard.on('keydown-ONE', () => { Sfx.ensure(); this.scene.start('BunkerScene'); });
    this.input.keyboard.on('keydown-ENTER', () => { Sfx.ensure(); this.scene.start('BunkerScene'); });
    this.input.keyboard.on('keydown-TWO', () => this.flashSoon());
    this.input.on('pointerdown', () => Sfx.ensure());

    this.soonText = this.add.text(W / 2, 520, '', {
      fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#c93b2a',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0);
  }

  flashSoon() {
    this.soonText.setText('2-PLAYER CO-OP — coming soon. Press 1 to play solo.').setAlpha(1);
    this.tweens.add({ targets: this.soonText, alpha: 0, duration: 600, delay: 1600 });
  }
}

// ================================================================== //
//  EXPLORATION SCENE BASE (bunker + city + shop share this)          //
// ================================================================== //
class WalkScene extends Phaser.Scene {
  // subclasses set cfg and call buildWalk() in create()
  buildWalk(cfg) {
    this.cfg = cfg;
    const H = 720;
    const groundY = cfg.groundY;
    let WW = cfg.worldW;

    this.cameras.main.setBackgroundColor('#0a0807');

    // background art scaled to fill 720 height; world width follows the art
    if (this.textures.exists(cfg.bgKey)) {
      const img = this.add.image(0, 0, cfg.bgKey).setOrigin(0, 0).setDepth(-20);
      const s = H / img.height;
      img.setScale(s);
      this.bgWidth = Math.round(img.width * s);
      if (cfg.worldW === 'auto') WW = this.bgWidth;
      if (this.bgWidth < WW) {
        this.add.image(this.bgWidth, 0, cfg.bgKey).setOrigin(0, 0).setDepth(-20).setScale(s).setFlipX(true);
      }
    } else {
      if (cfg.worldW === 'auto') WW = 2200;
      if (cfg.drawFallback) cfg.drawFallback.call(this, WW);
    }
    this.worldW = WW;
    this.cfg.worldW = WW;

    this.physics.world.setBounds(0, 0, WW, H);
    this.cameras.main.setBounds(0, 0, WW, H);

    // invisible floor
    const floor = this.add.rectangle(WW / 2, groundY + 40, WW, 80, 0x000000, 0).setDepth(-1);
    this.physics.add.existing(floor, true);

    // player — a scene transition can override the spawn point (e.g. re-enter at the hole)
    const data = this.sys.settings.data || {};
    const spawnFrac = data.spawnXFrac != null ? data.spawnXFrac : cfg.startXFrac;
    const startX = spawnFrac != null ? spawnFrac * WW : (cfg.startX || 160);
    this.player = makeWalker(this, startX, groundY);
    this.physics.add.collider(this.player, floor);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(160, 100);

    // input
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,M,E,ENTER');
    this.input.keyboard.on('keydown-M', () => Sfx.toggleMute());
    const wake = () => Sfx.ensure();
    this.input.on('pointerdown', wake);
    this.input.keyboard.on('keydown', wake);

    // exit zones (xFrac → world x)
    // markers float above the (now much taller) player's head
    this.markerY = groundY - 250;
    this.exits = (cfg.exits || []).map(ex => ({ ...ex, x: ex.xFrac != null ? ex.xFrac * WW : ex.x }));
    this.exitMarkers = this.exits.map(ex => {
      const m = this.add.text(ex.x, this.markerY, ex.arrow || '▲', {
        fontFamily: 'Courier New, monospace', fontSize: '34px', color: '#f2b13c',
        stroke: '#0d0a08', strokeThickness: 5
      }).setOrigin(0.5).setDepth(30).setAlpha(0);
      const lbl = this.add.text(ex.x, this.markerY + 34, ex.label, {
        fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
        stroke: '#0d0a08', strokeThickness: 4
      }).setOrigin(0.5).setDepth(30).setAlpha(0);
      return { m, lbl, ex };
    });

    // optional weapon pickup
    if (cfg.pickup && !GameState.hasWeapon) {
      const px = cfg.pickup.xFrac * WW;
      this.pickupGlow = this.add.circle(px, groundY - 38, 30, 0xf2b13c, 0.16).setDepth(19)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.pickup = this.add.image(px, groundY - 40, 'gun_pickup').setDepth(20);
      this.tweens.add({ targets: this.pickup, y: groundY - 56, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tweens.add({ targets: this.pickupGlow, alpha: 0.4, scale: 1.2, duration: 700, yoyo: true, repeat: -1 });
      this.pickupHint = this.add.text(px, groundY - 130, '★ pick up — walk into it', {
        fontFamily: 'Courier New, monospace', fontSize: '14px', color: '#f2b13c',
        stroke: '#0d0a08', strokeThickness: 4
      }).setOrigin(0.5).setDepth(20);
      this.pickGot = false;
    }

    // title + controls hint
    this.add.text(640, 36, cfg.title, {
      fontFamily: 'Courier New, monospace', fontSize: '22px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(40);
    this.add.text(640, 690, 'A/D walk · W jump · E / ▲ enter doorway · M mute',
      { fontFamily: 'Courier New, monospace', fontSize: '14px', color: '#8a6f4a' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(40).setAlpha(0.85);

    // film grain
    if (this.textures.exists('grain_0')) {
      this.grain = this.add.tileSprite(640, 360, 1280, 720, 'grain_0')
        .setScrollFactor(0).setDepth(48).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD);
      this._gf = 0;
    }
    this._transitioning = false;
  }

  update() {
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    if (!this._transitioning) driveWalker(this, this.player, this.keys, onGround);

    if (this.grain && this.game.loop.frame % 3 === 0) {
      this._gf = (this._gf + 1) % 3;
      this.grain.setTexture('grain_' + this._gf);
      this.grain.tilePositionX = Math.random() * 256;
    }

    // weapon pickup on contact
    if (this.pickup && !this.pickGot && Math.abs(this.player.x - this.pickup.x) < 60) {
      this.pickGot = true;
      GameState.hasWeapon = true;
      this.tweens.killTweensOf(this.pickup);
      this.tweens.killTweensOf(this.pickupGlow);
      this.pickup.destroy(); this.pickupGlow.destroy(); this.pickupHint.destroy();
      this.acquireWeapon(this.cfg.pickup.name);
    }

    // exit prompts + trigger
    const enterPressed = Phaser.Input.Keyboard.JustDown(this.keys.E)
                      || Phaser.Input.Keyboard.JustDown(this.keys.UP)
                      || Phaser.Input.Keyboard.JustDown(this.keys.W);
    this.exitMarkers.forEach(({ m, lbl, ex }) => {
      // a combat exit that needs the weapon stays locked until it's picked up
      const locked = ex.needWeapon && !GameState.hasWeapon;
      // hideLocked exits don't exist at all until unlocked (no marker, no message)
      if (locked && ex.hideLocked) { m.setAlpha(0); lbl.setAlpha(0); return; }
      const near = Math.abs(this.player.x - ex.x) < (ex.w || 90);
      const a = near ? 1 : 0;
      m.setAlpha(a); lbl.setAlpha(a);
      if (near) {
        m.y = this.markerY + Math.sin(this.time.now * 0.006) * 6;
        lbl.setText(locked ? 'GRAB THE WEAPON FIRST' : ex.label);
        lbl.setColor(locked ? '#c93b2a' : '#d9c7a8');
        // auto exits fire just by running into them; others want E/W/up
        if (!locked && (ex.auto || enterPressed) && !this._transitioning) this.goExit(ex);
      }
    });
  }

  acquireWeapon(name) {
    Sfx.ensure(); Sfx.clear();
    this.cameras.main.flash(220, 255, 240, 200);
    const panel = this.add.rectangle(640, 360, 660, 240, 0x0d0a08, 0.92)
      .setScrollFactor(0).setDepth(90).setStrokeStyle(3, 0xf2b13c);
    const ic = this.add.image(640, 282, 'gun_pickup').setScrollFactor(0).setDepth(91).setScale(1.7);
    const t1 = this.add.text(640, 326, 'ACQUIRED NEW WEAPON', {
      fontFamily: 'Courier New, monospace', fontSize: '26px', color: '#f2b13c',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const t2 = this.add.text(640, 360, name, {
      fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#d9c7a8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const t3 = this.add.text(640, 410,
      'LMB / K — fire     ·     RMB / F — sword     ·     Shift — dash\ngo back OUTSIDE and run RIGHT — the street fight begins at the middle',
      { fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#8a6f4a', align: 'center' }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const grp = [panel, ic, t1, t2, t3];
    grp.forEach(o => o.setAlpha(0));
    this.tweens.add({ targets: grp, alpha: 1, duration: 250 });
    this.time.delayedCall(3600, () => {
      this.tweens.add({ targets: grp, alpha: 0, duration: 450, onComplete: () => grp.forEach(o => o.destroy()) });
    });
  }

  goExit(ex) {
    this._transitioning = true;
    this.player.setVelocityX(0);
    Sfx.ensure(); Sfx.dash();
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const target = ex.kind === 'combat' ? 'GameScene' : ex.target;
      this.scene.start(target, ex.spawnXFrac != null ? { spawnXFrac: ex.spawnXFrac } : undefined);
    });
  }
}

// ================================================================== //
//  SCENE 1 — THE BUNKER (walk right, climb the stairs to the city)   //
// ================================================================== //
class BunkerScene extends WalkScene {
  constructor() { super('BunkerScene'); }
  create() {
    this.cameras.main.fadeIn(450, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_bunker',
      worldW: 'auto', groundY: 525, startXFrac: 0.07,   // bunker2.png walkway line
      title: 'THE BUNKER — quarantine shelter',
      exits: [
        { xFrac: 0.90, w: 180, label: 'UP TO THE CITY', target: 'CityScene' }   // the green door
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x14110d, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x1c1812, 1); g.fillRect(0, 120, WW, 360);
        g.fillStyle(0x2a241a, 1); g.fillRect(0, 150, WW, 14);
        for (let x = 200; x < WW - 300; x += 360) {
          g.fillStyle(0x24201a, 1); g.fillRect(x, 300, 120, 200);
        }
        [350, 980, 1600].forEach(lx => {
          g.fillStyle(0xf2b13c, 0.5); g.fillCircle(lx, 360, 26);
          g.fillStyle(0xfff2c8, 0.9); g.fillCircle(lx, 360, 10);
        });
        g.fillStyle(0x6b7a8a, 0.5); g.fillRect(WW - 120, 150, 90, 350);  // stair daylight
        g.fillStyle(0x16110c, 1); g.fillRect(0, 600, WW, 120);
        g.fillStyle(0x241c12, 1); g.fillRect(0, 600, WW, 8);
      }
    });
  }
}

// ================================================================== //
//  SCENE 2 — THE CITY (walk right to the shop on the far edge)        //
// ================================================================== //
class CityScene extends WalkScene {
  constructor() { super('CityScene'); }
  create() {
    this.cameras.main.fadeIn(450, 0, 0, 0);
    // route through the shop-front exterior once shop.png is uploaded
    const shopTarget = this.textures.exists('scene_shopfront') ? 'ShopFrontScene' : 'ShopScene';
    this.buildWalk({
      bgKey: 'scene_city',
      worldW: 'auto', groundY: 570, startXFrac: 0.13,   // pavement line in city.png; start at the "02" door
      title: 'HALBERD BAY — the ruined row',
      exits: [
        { xFrac: 0.10, w: 80, arrow: '◀', label: 'BACK TO BUNKER', target: 'BunkerScene' },
        { xFrac: 0.97, w: 90, label: 'TO THE SHOP ▶', target: shopTarget, auto: true }   // just run through
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        for (let i = 0; i < 40; i++) {
          const t = i / 39;
          const r = Math.round(20 + t * 90), gg = Math.round(10 + t * 35), b = Math.round(8 + t * 10);
          g.fillStyle((r << 16) | (gg << 8) | b, 1); g.fillRect(0, i * 9, WW, 10);
        }
        g.fillStyle(0x0d0a08, 0.8);
        for (let x = 0; x < WW; x += 70) g.fillRect(x, 360 - (80 + Math.random() * 180), 56, 260);
        g.fillStyle(0x14110c, 1); g.fillRect(0, 360, WW, 360);
        g.fillStyle(0x241c12, 1); g.fillRect(0, 560, WW, 8);
        // shop marker on the far right
        for (let i = 0; i < 10; i++) {
          g.fillStyle(i % 2 ? 0xc93b2a : 0xd9c7a8, 1);
          g.fillRect(WW - 320 + i * 30, 250, 30, 26);
        }
      }
    });
  }
}

// ================================================================== //
//  SCENE 3a — SHOP FRONT (exterior; enter through the door hole)     //
//  Activates automatically once shop.png is uploaded to GitHub.       //
// ================================================================== //
class ShopFrontScene extends WalkScene {
  constructor() { super('ShopFrontScene'); }
  create() {
    this.cameras.main.fadeIn(450, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_shopfront',
      worldW: 'auto', groundY: 520, startXFrac: 0.05,   // sidewalk line in shop.png
      title: 'SPORTING GOODS — the last shop standing',
      exits: [
        { xFrac: 0.02, w: 70, arrow: '◀', label: 'BACK TO THE CITY', target: 'CityScene' },
        { xFrac: 0.73, w: 110, label: 'ENTER THROUGH THE HOLE', target: 'ShopScene', spawnXFrac: 0.29 },  // land just inside the hole
        // after the weapon is collected: run right along the sidewalk → the street fight
        { xFrac: 0.985, w: 70, label: 'THE STREET ▶', target: 'GameScene', kind: 'combat', auto: true, needWeapon: true }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x120e0a, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x241c12, 1); g.fillRect(0, 600, WW, 8);
      }
    });
  }
}

// ================================================================== //
//  SCENE 3b — THE SHOP (grab the weapon, then exit right to combat)  //
// ================================================================== //
class ShopScene extends WalkScene {
  constructor() { super('ShopScene'); }
  create() {
    this.cameras.main.fadeIn(450, 0, 0, 0);
    const hasFront = this.textures.exists('scene_shopfront');
    this.buildWalk({
      bgKey: 'scene_shop',
      worldW: 'auto', groundY: 640, startXFrac: 0.10,   // shop tile floor measured from the art
      title: 'SPORTING GOODS — camp · hunt · survive',
      pickup: { xFrac: 0.60, name: 'M1 SCRAP CARBINE' },
      exits: hasFront ? [
        // ONE exit — the hole you came in by. Appears only after the weapon is collected.
        { xFrac: 0.27, w: 130, label: 'BACK OUTSIDE ▶', target: 'ShopFrontScene',
          spawnXFrac: 0.75, needWeapon: true, hideLocked: true }
      ] : [
        { xFrac: 0.02, w: 70, arrow: '◀', label: 'OUT THE DOOR', target: 'CityScene' },
        { xFrac: 0.96, w: 130, label: 'OUT TO THE STREET ▶', target: 'GameScene', kind: 'combat', needWeapon: true }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x140f0c, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x1e1812, 1); g.fillRect(0, 100, WW, 380);     // back wall
        // gun wall (right-center)
        g.fillStyle(0x2a2218, 1); g.fillRect(WW * 0.45, 200, WW * 0.4, 220);
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 5; c++) {
            g.fillStyle(0x3a3a42, 1);
            g.fillRect(WW * 0.46 + c * (WW * 0.075), 220 + r * 50, WW * 0.06, 8);
          }
        // doorway hole to the city on the left
        g.fillStyle(0x6b6050, 0.6); g.fillRect(WW * 0.18, 180, 120, 300);
        g.fillStyle(0x140f0c, 1); g.fillRect(0, 560, WW, 160);     // floor
        g.fillStyle(0x241c12, 1); g.fillRect(0, 560, WW, 8);
      }
    });
  }
}

// ------------------------------------------------------------------ //
//  BOOT THE GAME                                                      //
// ------------------------------------------------------------------ //
window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  pixelArt: true,
  backgroundColor: '#0a0807',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY }, debug: false } },
  scene: [BootScene, MenuScene, BunkerScene, CityScene, ShopFrontScene, ShopScene, GameScene]
});

})();

