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
  swoop()   { this.blip(880, 0.22, 'sine', 0.2, 220); },
  // menu / dialogue UI
  hover()   { this.blip(760, 0.045, 'sine', 0.14, 980); },
  select()  { this.blip(520, 0.07, 'triangle', 0.22, 300); setTimeout(() => this.blip(880, 0.11, 'sine', 0.14, 1150), 55); },
  deny()    { this.blip(200, 0.13, 'square', 0.2, 130); },
  type()    { this.blip(1500, 0.011, 'square', 0.035); }
};

// ------------------------------------------------------------------ //
//  UI TYPE — the build embeds Chakra Petch as 'AtomUI'; the stacks    //
//  fall back to a system sans so the shell still reads without it.    //
//  It carries headings and labels; the dialogue body stays on a plain //
//  sans, which is easier on the eye for whole sentences.              //
// ------------------------------------------------------------------ //
const F_UI  = 'AtomUI, "Segoe UI", Roboto, Helvetica, sans-serif';
const F_TXT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Canvas cannot draw with a face the document has not finished loading, so
// the boot sequence waits on it before the first scene paints any text.
function whenFontsReady(cb) {
  const d = document;
  if (!d.fonts || !d.fonts.load) return cb();
  const want = ['500 24px AtomUI', '600 24px AtomUI', '700 64px AtomUI'];
  let left = want.length, fired = false;
  const done = () => { if (!fired && --left <= 0) { fired = true; cb(); } };
  setTimeout(() => { if (!fired) { fired = true; cb(); } }, 3000);   // never hang
  want.forEach(f => d.fonts.load(f).then(done, done));
}

// ------------------------------------------------------------------ //
//  MENU MUSIC — an <audio> element, not the Phaser loader             //
//  Phaser fetches audio over XHR, which a file:// page is not allowed //
//  to do; an <audio src> reads the local file directly. The track     //
//  carries the menu, character select and intro, so it lives out here //
//  rather than in any one scene.                                      //
// ------------------------------------------------------------------ //
let _music = null;

// window.MEDIA lists every encode of a track that shipped, best first.
function mediaList(key) {
  const m = window.MEDIA && window.MEDIA[key];
  return !m ? [] : (Array.isArray(m) ? m : [m]);
}

const AUDIO_MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav' };

// Entries are data: URIs in a built page and plain paths when running from
// source, so the type is read from whichever the URL actually carries.
function audioType(url) {
  if (url.slice(0, 5) === 'data:') return url.slice(5, url.indexOf(';'));
  return AUDIO_MIME[(url.split('.').pop() || '').toLowerCase()];
}

function pickAudio(list) {
  const probe = document.createElement('audio');
  for (const url of list) {
    const type = audioType(url);
    if (!type || probe.canPlayType(type)) return url;
  }
  return list[0];
}

// Built during boot rather than when the menu opens, so the track is fetched
// and decoded while the page is still loading and playback can begin on the
// first frame instead of buffering first.
// The menu bed, and how far it drops under a spoken line. Voice at 64k mono
// loses badly to a full-range music bed at 0.5 — the words are there and you
// cannot make them out.
const MUSIC_BED = 0.5, MUSIC_DUCK = 0.14;
function duckMusic(on) {
  if (!_music) return;
  try { _music.volume = on ? MUSIC_DUCK : MUSIC_BED; } catch (e) {}
}

function primeMusic() {
  if (_music) return _music;
  const list = mediaList('menuMusic');
  if (!list.length) return null;
  try {
    _music = new Audio(pickAudio(list));
    _music.loop = true;
    _music.volume = MUSIC_BED;
    _music.preload = 'auto';
    _music.load();
  } catch (e) { _music = null; }
  return _music;
}

// A browser will not let a page start audible sound before it has been
// interacted with, so a cold load is refused however early it is attempted —
// there is no way around that. What this does is take the very first moment
// the policy allows: it tries immediately (which succeeds on a reload, or
// where the site has playback permission), and otherwise starts on the first
// input of any kind, including the click that opens the menu.
let _musicArmed = false;
const MUSIC_GESTURES = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'];

function startMusic() {
  const audio = primeMusic();
  if (!audio || _musicArmed) return;
  _musicArmed = true;
  const disarm = () => MUSIC_GESTURES.forEach(e => window.removeEventListener(e, attempt, true));
  const attempt = () => { if (_music) _music.play().then(disarm, () => {}); };
  MUSIC_GESTURES.forEach(e => window.addEventListener(e, attempt, true));
  attempt();
}

// Fade out over `ms` so the cut into the bunker is not abrupt.
function stopMusic(ms) {
  if (!_music) return;
  const a = _music;
  _music = null;
  _musicArmed = false;
  const step = 50, fall = a.volume / Math.max(1, (ms || 0) / step);
  const t = setInterval(() => {
    a.volume = Math.max(0, a.volume - fall);
    if (a.volume <= 0.001) { clearInterval(t); a.pause(); a.src = ''; }
  }, step);
}

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
  hurt:      ['¡Ay! Cheap shot.', 'Okay. Now I’m mad.', 'Wolffel would laugh at that.'],
  swordKill: ['¡Toma!', 'Up close and personal.', 'Sliced.'],
  clear:     ['Halberd Bay breathes… for now.', 'Stage clear. Where’s Wolffel’s arepa?'],
  down:      ['Not… like this…', 'Wolffel… avenge me, brother…']
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
const GameState = { hasWeapon: false, castId: null };

const WORLD_W = 2400;
const WORLD_H = 720;
const GROUND_Y = 648;          // top surface of the street
const GRAVITY = 1500;
// The brothers are 3D renders, not pixel art, and their frames are about
// 225px tall. Drawn any larger than that the renderer is inventing pixels
// that were never painted, and the result is soft — which is what a stage at
// 210 px/m was doing, magnifying them by 1.67. So this is the ceiling: 1.8m
// at 125 px/m is 225px, one screen pixel per painted pixel, as sharp as they
// can be. Stages may go smaller — the bridge sits at 60 to take in the whole
// span — but the floor is around 50, below which the silhouette stops reading
// and a sword swing and a reload look the same.
//
// Going closer than this needs bigger source art, not a bigger number.
//
// It is a reference, not a rule, and the paintings overrule it. A stage is
// painted at a scale of its own — the bunker's bunks and the village's blast
// doorway each say how big a metre is in that picture — and a brother drawn
// smaller than that stands in the room like a child. Being the right size in
// the world is worth more than being sharp, so a stage states the scale its
// art wants and takes the magnification. This number is what that costs:
// past it, every pixel over 225 is invented.
//
// Taller source renders are the one thing that buys both, and the build picks
// them up with no code change.
const PX_PER_M_SHARP = 125;
const PX_PER_M_MIN = 50;

// How long a character stands before moving on to its next idle pose.
// Only a fallback: each one states its own step in its art.
const IDLE_LONG_MS = 5000;

// ---- how big is a person, and therefore everything else --------------------
// A stage says how many screen pixels one metre is on the plane the brothers
// walk on, and their height falls out of it. That is the whole rule: measure
// one thing in the painting you know the real size of, and the character is
// scaled to match it.
//
// The village road was calibrated on the blast doorway the brothers walk out
// of — 345px from the road to the lintel. At 167 px/m that doorway is 2.07m,
// which is a standard door, and the brothers come out at 300px. Before this
// they were 200px, which made that same doorway 3.1m and them about 1.2m: the
// reason they read as children against their own street.
//
// The bunker was measured separately, off the bunk-bed spacing (~205px between
// mattresses, so ~1m), and already sat at the right scale, so it keeps the
// exact size it had.
const HUMAN_M = 1.8;
// Growing the character without growing his stride and his jump just makes him
// heavy: the jump is a fixed number of pixels, so a taller man clears less of
// himself with it. Speeds, jump and gravity are therefore scaled alongside, and
// this is the scale they were originally tuned at (a 200px man, so 111 px/m).
// Scaling velocity AND gravity by the same factor leaves every airborne
// duration identical and simply makes the arc bigger, so the motion is the one
// that was tuned, seen larger.
const PHYS_BASE_PX_PER_M = 111;
// The row of main.png where the painted street's lit edge drops away into the
// dark foreground — measured as the strongest lit-to-dark step across the width
// (595 on the left, 602 on the right). The painting is scaled so this row lands
// on GROUND_Y, which is what puts the player's feet on the stone instead of in
// the shadow strip below it.
const COMBAT_FLOOR_ROW = 598;

// The alien shambles until it is shot, then commits. Two lunges, picked at
// random, so a run-in never reads the same way twice.
const ALIEN_HEIGHT     = 124;   // on-screen height; a head under the player's 132
const ALIEN_ENRAGE     = 2.3;   // speed multiplier once it has been hit
const ALIEN_LUNGE_NEAR = 250;   // how close before it commits
const ALIEN_LUNGE_MS   = 620;   // how long a lunge owns the sprite
const ALIEN_LUNGE_CD   = 1500;  // cooldown between lunges
const ALIEN_RAGE_TINT  = 0xffa88f;

// The wall crawler never touches the ground. It clings, creeps up and down its
// stretch of brick, and spits acid down at whoever walks underneath — so it
// cannot be fought the way everything else can, which is the point of it.
const CRAWLER_HEIGHT   = 86;
const CRAWLER_SPEED    = 42;    // how fast it creeps along the wall
const CRAWLER_RANGE    = 560;   // how far it will spit
const CRAWLER_SPIT_CD  = 2200;
const CRAWLER_SPIT_MS  = 560;   // the wind-up the animation needs
const ACID_SPEED       = 430;
const ACID_GRAVITY     = 520;   // arcs, so it has to be dodged rather than out-run

// ------------------------------------------------------------------ //
//  BOOT — builds every texture procedurally                           //
// ------------------------------------------------------------------ //
//  THE CAST                                                           //
//                                                                     //
//  A playable character is an asset module (window.EW, window.WF)     //
//  plus one entry below. Its frames load as '<pre>_<frame>' and its    //
//  animations register as '<pre>-<action>', so two characters never    //
//  collide; the state machines name bare ACTIONS ('run', 'idle') and   //
//  resolve them against whoever is being played.                       //
//                                                                     //
//  The art ships per-direction where it exists, so facing left plays   //
//  the west animation rather than mirroring the sprite — mirroring     //
//  would flip asymmetric hair and gear. Single-sided art has no *W     //
//  keys and still mirrors via flipX.                                   //
//                                                                     //
//  Nobody has a complete set. Rather than have every scene test what   //
//  exists, a missing action falls back along a chain — no dash art     //
//  runs instead, no jump art runs in the air — so a character can be   //
//  dropped into the sandbox with four clips and still be playable.     //
// ------------------------------------------------------------------ //
const CAST = [];
(function buildCast() {
  [{ id: 'eterwolf', name: 'ETERWOLF', pre: 'ew', art: window.EW,
     longIdle: 'guitar', longIdleMs: 5000 },
   { id: 'wolffel',  name: 'WOLFFEL',  pre: 'wf', art: window.WF,
     longIdle: 'burger', longIdleMs: 8000 }].forEach(d => {
    if (!d.art || !d.art.anims) return;      // art not built — leave them out
    if (d.art.longIdle) d.longIdle = d.art.longIdle;
    if (d.art.longIdleMs) d.longIdleMs = d.art.longIdleMs;
    // some long idles are a one-off (two bites of a burger), others carry on
    // until you move (strumming a guitar)
    d.longIdleOnce = !!d.art.longIdleOnce;
    // Standing still is a sequence, not a single pose. A character may name
    // its own order; one that does not gets the old two-step behaviour —
    // plain idle, then its flourish — so nothing has to change to keep working.
    d.idleChain = (d.art.idleChain && d.art.idleChain.length)
                ? d.art.idleChain.slice()
                : ['idle', d.longIdle].filter(Boolean);
    d.idleStepMs = d.art.idleStepMs || d.longIdleMs || IDLE_LONG_MS;
    d.dir = !!d.art.directional;
    CAST.push(d);
  });
})();
const DEFAULT_CAST = CAST.length ? CAST[0].id : null;
const castById = id => CAST.find(c => c.id === id) || CAST[0] || null;

// What to play when a character has no art for an action. First hit wins.
const ACTION_FALLBACK = {
  dash:     ['dash', 'run', 'walk', 'idle'],
  jump:     ['jump', 'run', 'walk', 'idle'],
  jumpapex: ['jumpapex', 'jump', 'run', 'idle'],
  jumpfall: ['jumpfall', 'jump', 'run', 'idle'],
  land:     ['land', 'idle'],
  runshoot: ['runshoot', 'shoot', 'run', 'idle'],
  shoot:    ['shoot', 'idle'],
  sword:    ['sword', 'shoot', 'run', 'idle'],
  guitar:   ['guitar', 'idle'],
  burger:   ['burger', 'idle'],
  walk:     ['walk', 'run', 'idle'],
  run:      ['run', 'walk', 'idle'],
  // the chain degrades to whatever swings the character does have
  sword2:     ['sword2', 'sword', 'shoot', 'idle'],
  sword3:     ['sword3', 'sword2', 'sword', 'idle'],
  sword4:     ['sword4', 'sword3', 'sword2', 'sword', 'idle'],
  swordguard: ['swordguard', 'idle'],
  deathblow:  ['deathblow', 'sword4', 'sword3', 'sword2', 'sword', 'idle'],
  crouch:      ['crouch', 'idle'],
  crouchwalk:  ['crouchwalk', 'crouch', 'walk', 'idle'],
  akshoot:     ['akshoot', 'shoot', 'idle'],
  akrunshoot:  ['akrunshoot', 'runshoot', 'akshoot', 'shoot', 'run', 'idle'],
  // the draws, so a character without one simply skips straight to firing
  shootin:     ['shootin', 'shoot', 'idle'],
  akshootin:   ['akshootin', 'shootin', 'akshoot', 'shoot', 'idle'],
  shoot45:     ['shoot45', 'runshoot', 'shoot', 'idle'],
  death:       ['death', 'falldown', 'idle'],
  shoot45in:   ['shoot45in', 'shoot45', 'runshootin', 'shootin', 'shoot', 'idle'],
  runshootin:  ['runshootin', 'runshoot', 'shootin', 'shoot', 'idle'],
  akrunshootin: ['akrunshootin', 'akshootin', 'runshootin', 'akrunshoot', 'shoot', 'idle']
};
// Which standing pose belongs this far into a rest.
//
// Wolffel settles side-on the moment he stops, turns three-quarters on eight
// seconds later, and eight after that digs the burger out of his pocket. The
// chain and the step are the character's, so this is the only place that has
// to know how a long stand is paced.
//
// Two things pull him back off the end of it: `done`, once a one-shot
// flourish has played out, and `allowLong` false, which is a stage saying the
// flourish does not belong here at all. Both walk back past the flourish
// rather than to the front of the chain, so he keeps whatever quiet pose he
// had reached.
function idlePose(hero, restSince, now, done, allowLong) {
  const chain = hero && hero.idleChain;
  if (!chain || !chain.length) return 'idle';
  let max = chain.length - 1;
  if (done || allowLong === false)
    while (max > 0 && chain[max] === hero.longIdle) max--;
  const step = hero.idleStepMs || IDLE_LONG_MS;
  let i = restSince ? Math.floor((now - restSince) / step) : 0;
  return chain[Math.max(0, Math.min(i, max))];
}
function heroHas(hero, action) { return !!(hero && hero.art.anims[action]); }
function heroAction(hero, action) {
  if (!hero) return action;
  if (hero.art.anims[action]) return action;
  const chain = ACTION_FALLBACK[action];
  if (chain) for (const a of chain) if (hero.art.anims[a]) return a;
  return 'idle';
}
// an action plus a facing -> the animation key registered at boot
function heroAnim(hero, action, facing) {
  const a = heroAction(hero, action);
  const w = a + 'W';
  return hero.pre + '-' + (hero.dir && facing < 0 && hero.art.anims[w] ? w : a);
}
// only mirror when there's no real art for the other side
function heroFlip(sprite, hero, facing) { sprite.setFlipX(hero && hero.dir ? false : facing < 0); }
// hi-res renders scale fractionally; pixel art snaps to whole pixels so it stays crisp
function heroScale(hero, targetH, fallback) {
  if (!hero || !hero.art.charH) return fallback;
  const s = targetH / hero.art.charH;
  return hero.art.hiRes ? s : Math.max(1, Math.round(s));
}

// ------------------------------------------------------------------ //
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // Character frames (PixelLab GIFs, decoded + embedded as data URIs), one
    // pool per member of the cast. With none built the game falls back to the
    // procedural placeholder hero.
    for (const c of CAST) {
      if (c.art.frames) {
        // shared frame pool — an intro and its looping tail reference the same
        // images, so each is loaded once however many anims name it
        for (const k of Object.keys(c.art.frames)) {
          this.load.image(c.pre + '_' + k, c.art.frames[k]);
        }
      } else {
        for (const name of Object.keys(c.art.anims)) {
          c.art.anims[name].frames.forEach((uri, i) => {
            this.load.image(c.pre + '_' + name + '_' + i, uri);
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
    // Creature sprites — one shared canvas per enemy across all its clips.
    if (window.ENEMIES) {
      for (const [name, e] of Object.entries(window.ENEMIES)) {
        for (const k of Object.keys(e.frames)) this.load.image(`mob_${name}_${k}`, e.frames[k]);
      }
    }
    // Front-end art: dialogue frame, character busts (each with an eyes-shut
    // twin the blink swaps to) and the 8-direction turntables.
    if (window.UIART) {
      for (const [s, uri] of Object.entries(window.UIART.panels || {})) {
        this.load.image('ui_panel_' + s, uri);
      }
      for (const [n, p] of Object.entries(window.UIART.portraits || {})) {
        if (p.open) this.load.image('portrait_' + n, p.open);
        if (p.closed) this.load.image('portrait_' + n + '_closed', p.closed);
      }
      for (const [n, frames] of Object.entries(window.UIART.rotations || {})) {
        frames.forEach((uri, i) => this.load.image(`rot_${n}_${i}`, uri));
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
    for (const c of CAST) {
      if (!c.art.hiRes || !c.art.frames) continue;
      for (const k of Object.keys(c.art.frames)) {
        const t = this.textures.get(c.pre + '_' + k);
        if (t) t.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    // Character animations, namespaced by character. Directional art registers
    // both an east key ('ew-run') and a west one ('ew-runW'); see heroAnim().
    for (const c of CAST) {
      for (const name of Object.keys(c.art.anims)) {
        const a = c.art.anims[name];
        this.anims.create({
          key: c.pre + '-' + name,
          frames: a.keys ? a.keys.map(k => ({ key: c.pre + '_' + k }))
                         : a.frames.map((u, i) => ({ key: c.pre + '_' + name + '_' + i })),
          frameRate: a.fps,
          repeat: a.repeat
        });
      }
    }

    // Front-end art is rendered at high resolution and shown smaller, so like
    // the hero frames it needs linear sampling rather than the game's nearest.
    if (window.UIART) {
      const keys = Object.keys(window.UIART.panels || {}).map(s => 'ui_panel_' + s);
      for (const n of Object.keys(window.UIART.portraits || {})) keys.push('portrait_' + n, 'portrait_' + n + '_closed');
      for (const [n, f] of Object.entries(window.UIART.rotations || {})) f.forEach((_, i) => keys.push(`rot_${n}_${i}`));
      for (const k of keys) {
        if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      // idle turntables for the character select
      for (const [n, f] of Object.entries(window.UIART.rotations || {})) {
        this.anims.create({
          key: 'turn-' + n,
          frames: f.map((_, i) => ({ key: `rot_${n}_${i}` })),
          // A slow turn — this is a character being presented, not a spin.
          frameRate: 2.5, repeat: -1
        });
      }
    }

    // Creature animations. These are high-resolution renders shown small, so
    // like the hero they get linear sampling rather than the game's nearest.
    if (window.ENEMIES) {
      for (const [name, e] of Object.entries(window.ENEMIES)) {
        for (const k of Object.keys(e.frames)) {
          const t = this.textures.get(`mob_${name}_${k}`);
          if (t) t.setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
        for (const [key, a] of Object.entries(e.anims)) {
          this.anims.create({
            key: name + '-' + key,
            frames: a.keys.map(k => ({ key: `mob_${name}_${k}` })),
            frameRate: a.fps, repeat: a.repeat
          });
        }
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

    primeMusic();                       // fetch and decode before the menu opens
    whenFontsReady(() => this.scene.start('StartScene'));
  }

  _makeEffectTextures() {
    // bullet tracer
    let g = this.make.graphics({ add: false });
    g.fillStyle(0xf2b13c, 0.55); g.fillRect(0, 0, 18, 5);
    g.fillStyle(0xfff2c8, 1);    g.fillRect(4, 1, 12, 3);
    g.generateTexture('bullet', 18, 5);
    g.destroy();

    // acid glob — a bright core inside a sicker rim, so it still reads as a
    // blob of something corrosive at 14px against a dark street
    g = this.make.graphics({ add: false });
    g.fillStyle(0x3f6b18, 1);   g.fillCircle(7, 7, 7);
    g.fillStyle(0x8ede2a, 1);   g.fillCircle(7, 7, 5);
    g.fillStyle(0xe4ff9a, 1);   g.fillCircle(5.5, 5.5, 2.4);
    g.generateTexture('acid', 14, 14);
    g.destroy();

    // A fallen log. Drawn rather than painted: it only ever reads as a dark
    // shape near the camera, so the end grain and a couple of highlights along
    // the top are the whole of what is needed.
    g = this.make.graphics({ add: false });
    g.fillStyle(0x1a1410, 1); g.fillRoundedRect(0, 8, 190, 40, 14);
    g.fillStyle(0x241c15, 1); g.fillRoundedRect(4, 10, 182, 16, 8);
    g.fillStyle(0x2e2419, 1); g.fillEllipse(176, 28, 26, 40);
    g.fillStyle(0x191309, 1); g.fillEllipse(176, 28, 15, 25);
    g.fillStyle(0x0f0b08, 1); g.fillEllipse(176, 28, 6, 11);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0x30271c, 0.7);
      g.fillRect(18 + i * 32, 12 + (i % 2) * 3, 20, 2);
    }
    g.generateTexture('log_prop', 192, 56);
    g.destroy();

    // A stub wall block, stacked so it has a flat top to land on — used only
    // if the painted wall art failed to load.
    g = this.make.graphics({ add: false });
    const blocks = [[0,44,120,36],[14,26,92,22],[30,10,62,20],[8,34,40,14],[74,30,44,16]];
    blocks.forEach(([x, y, w, h], i) => {
      g.fillStyle([0x2a241d, 0x342c22, 0x1f1a15][i % 3], 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x433a2c, 0.9); g.fillRect(x, y, w, 3);
    });
    g.fillStyle(0x4a4032, 0.8); g.fillRect(30, 10, 62, 3);
    g.generateTexture('wall_prop', 120, 80);
    g.destroy();

    // speed line — a streak that fades out at both ends, so a row of them
    // behind a dash reads as air being torn rather than as drawn sticks
    g = this.make.graphics({ add: false });
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      g.fillStyle(0xbcd8f0, Math.sin(t * Math.PI) * 0.9);
      g.fillRect(i * 2, 0, 2, 3);
    }
    g.generateTexture('speedline', 80, 3);
    g.destroy();

    // the splat it leaves where it lands
    g = this.make.graphics({ add: false });
    g.fillStyle(0x6ba81f, 0.9);
    g.fillEllipse(16, 5, 30, 9);
    g.fillStyle(0x9ee63a, 0.9); g.fillEllipse(13, 4, 13, 5);
    g.generateTexture('acid_splat', 32, 10);
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

    // Doorway glow: the shape of a door, not a lamp on the floor in front of
    // one. It was an oval, and an oval sitting at the foot of a two-storey
    // blast door reads as a puddle of light rather than as the door being
    // live — the door is the thing you walk into, so the door is what should
    // light up.
    //
    // Built as a stack of rectangles each inset one pixel further than the
    // last, all at the same small alpha. A pixel FEATHER in from the edge is
    // covered by every rectangle from there inward, so the brightness ramps
    // evenly over that border and then holds flat across the middle: a lit
    // slab with soft edges rather than a blob with a hot centre. It is drawn
    // with ADD blending, so it lifts the painted door instead of covering it.
    g = this.make.graphics({ add: false });
    const GW = 180, GH = 360, FEATHER = 44;
    for (let d = 0; d < FEATHER; d++) {
      g.fillStyle(0xf2b13c, 0.013);
      g.fillRoundedRect(d, d, GW - 2 * d, GH - 2 * d, 24);
    }
    // A little more heat through the middle of the slab.
    g.fillStyle(0xffd98a, 0.07);
    g.fillRoundedRect(FEATHER, FEATHER, GW - 2 * FEATHER, GH - 2 * FEATHER, 14);
    g.generateTexture('doorglow', GW, GH);
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
  // The key is a parameter so the debug sandbox can subclass this scene and
  // inherit the entire kit — movement, weapons, enemies, damage, HUD — rather
  // than duplicating it and drifting out of sync.
  constructor(key) { super(key || 'GameScene'); }

  create() {
    stopMusic(200);
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
      // Scaled from the floor, not the height: the painted street has to meet
      // the physics ground. What hangs below the street is a dark strip and
      // falls off the bottom of the camera.
      const s = COMBAT_FLOOR_ROW < img.height ? GROUND_Y / COMBAT_FLOOR_ROW : WORLD_H / img.height;
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

    // Vertical faces a crawler can cling to. The street has none by default;
    // the sandbox puts one up to test with, and a level can push its own.
    this.walls = [];
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

    // ---------- player (enters the level from the LEFT) ----------
    // The story always plays Eterwolf; the sandbox sets castId before this
    // runs, which is the whole of what switching a character costs.
    const SPAWN_X = 160;
    this.castId = this.castId || DEFAULT_CAST;
    this.hero = castById(this.castId);
    this.realHero = !!this.hero;
    if (this.realHero) {
      this.player = this.physics.add.sprite(SPAWN_X, GROUND_Y - 80, this.hero.pre + '_idle_0');
      const B = this.hero.art.body;
      this.player.body.setSize(B.w, B.h).setOffset(B.x, B.y);
      // ~132px tall in combat, whatever the source art measures — level with
      // the alien's head, which is the tallest thing he fights on foot
      this.player.setScale(heroScale(this.hero, 132, 0.55));
      this.player.play(this.hero.pre + '-idle');
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
    this.dashAnimUntil = 0;
    this.airSince = 0;
    this.landUntil = 0;
    this.restSince = 0;
    this.weapon = 'pistol';
    this.weaponOutUntil = 0;     // while now < this, it is already in his hand
    this.weaponReadyAt = 0;      // the draw has to finish before the first shot
    this.swordCombo = 0;
    this.comboUntil = 0;
    this.crouching = false;
    this.longIdleDone = false;
    this.dashDir = 0;
    this.dashLanded = true;
    this.nextGhostAt = 0;
    this._executing = false;     // scene instances are reused across restart()
    this.walkMode = false;       // X toggles; combat runs by default
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
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,F,R,M,J,K,Q,E,X');
    this.input.mouse.disableContextMenu();
    const wake = () => Sfx.ensure();
    this.input.on('pointerdown', wake);
    this.input.keyboard.on('keydown', wake);
    this.input.keyboard.on('keydown-N', () => Sfx.toggleMute());
    this.input.keyboard.on('keydown-R', () => { if (this.dead) this.scene.restart(); });
    this.input.keyboard.on('keydown-ESC', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
    });
    this.input.on('pointerdown', (p) => {
      if (p.rightButtonDown()) this.swordAttack();
    });
    this.input.keyboard.on('keydown-F', () => this.swordAttack());
    this.input.keyboard.on('keydown-Q', () => this.useNuke());
    this.input.keyboard.on('keydown-J', () => this.swordAttack());
    this.input.keyboard.on('keydown-SHIFT', () => this.dash());
    this.input.keyboard.on('keydown-X', () => this.toggleWalk());
    this.input.keyboard.on('keydown-E', () => this.swapWeapon());
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
    // UP is the up-aim in combat, not a second jump key.

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
    this.modeText = this.add.text(1250, 70, '', tstyle).setOrigin(1, 0).setScrollFactor(0).setDepth(60)
      .setColor('#9fc3d9').setAlpha(0);
    this.weaponText = this.add.text(1250, 96, '', tstyle).setOrigin(1, 0).setScrollFactor(0).setDepth(60)
      .setColor('#e0a24a').setAlpha(0.45);

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
      'A/D · W jump ×2 · S crouch · Shift dash · X walk · LMB fire · UP+fire 45° · E weapon · RMB/F sword · Q nuke · N mute',
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
    if (type === 'crawler' && window.ENEMIES && window.ENEMIES.crawler) {
      const E = window.ENEMIES.crawler;
      // It belongs on a wall, so it is placed on the nearest one rather than
      // wherever the wave director would have put a walker.
      const wall = this._nearestWall(x);
      const wx = wall ? wall.faceX : x;
      const wy = wall ? Phaser.Math.Between(wall.top + 40, wall.bottom - 40) : GROUND_Y - 200;
      z = this.physics.add.sprite(wx, wy, 'mob_crawler_walk_0');
      z.setScale(CRAWLER_HEIGHT / E.charH);
      z.body.setSize(E.body.w, E.body.h).setOffset(E.body.x, E.body.y);
      z.setData({ hp: 4, speed: CRAWLER_SPEED, dmg: 1, type: type });
      z.setData('wall', wall || null);
      z.setData('climbDir', Math.random() < 0.5 ? 1 : -1);
      z.setData('nextSpitAt', this.time.now + 700 + Math.random() * 900);
      z.setData('spitUntil', 0);
      z.play('crawler-walk');
      z.setData('alive', true);
      z.setDepth(8);
      this.zombies.add(z);
      // AFTER the group takes it: adding to a physics group re-applies the
      // group's own body defaults, so setting this before the add left gravity
      // switched back on and dropped the creature into the street.
      z.body.allowGravity = false;          // it clings; nothing pulls it off
      z.body.setGravityY(0);
      z.body.immovable = true;
      return z;
    }

    if (type === 'alien' && window.ENEMIES && window.ENEMIES.alien) {
      const E = window.ENEMIES.alien;
      z = this.physics.add.sprite(x, GROUND_Y - 90, 'mob_alien_walk_0');
      z.setScale(ALIEN_HEIGHT / E.charH);
      z.body.setSize(E.body.w, E.body.h).setOffset(E.body.x, E.body.y);
      // Shambles in slowly. Shooting it is what wakes it up — see damageZombie.
      z.setData({ hp: 6, speed: this.waveSpeed * 0.55 * speedJitter, dmg: 2, type: type });
      z.setData('faceLeft', true);            // the art is drawn facing west
      z.setData('nextLungeAt', this.time.now + 900);
      z.setData('lungeUntil', 0);
      z.setData('enraged', false);
      z.play('alien-walk');
    } else if (type === 'zomba' && this.textures.exists('mob_zomba')) {
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

  // A wall a crawler can live on: a solid vertical face, plus the side of it
  // the creature sits on and the stretch it may creep along.
  addWall(x, top, bottom, width) {
    const w = width || 26;
    const h = bottom - top;
    const img = this.add.rectangle(x, top + h / 2, w, h, 0x1a1512)
      .setDepth(-1).setStrokeStyle(2, 0x2c241c);
    this.physics.add.existing(img, true);
    this.solids.push(img);
    // The creature hangs clear of the brick: its own body is ~34px wide, and
    // overlapping the wall would have the solids collider shove it off the face
    // every frame.
    const wall = { x: x, top: top, bottom: bottom, w: w,
                   faceX: x - w / 2 - 32, img: img };
    this.walls.push(wall);
    return wall;
  }

  // The wall a crawler spawning near x should end up on.
  _nearestWall(x) {
    if (!this.walls || !this.walls.length) return null;
    let best = null, bd = Infinity;
    this.walls.forEach(w => {
      const d = Math.abs(w.x - x);
      if (d < bd) { bd = d; best = w; }
    });
    return best;
  }

  // A glob of acid, lobbed rather than fired: it arcs, so standing still under
  // one is the mistake and moving out is the answer.
  spitAcid(z) {
    const t = this.time.now;
    const shot = this.enemyShots.create(z.x, z.y + 8, 'acid');
    shot.body.allowGravity = true;
    shot.body.setGravityY(ACID_GRAVITY);
    shot.setDepth(9).setData('bornAt', t).setData('acid', true);
    // Lob it so it lands where he is standing. The horizontal speed is a real
    // speed, and the flight time follows from it; solving the other way round
    // — taking the speed from the distance — makes the glob crawl at a target
    // 13px away and fall short of one past the clamp.
    const dx = this.player.x - z.x;
    const dy = this.player.y - z.y;
    const dir = dx >= 0 ? 1 : -1;
    const vx = dir * Phaser.Math.Clamp(Math.abs(dx) / 0.85, 90, ACID_SPEED);
    const tFlight = Math.max(0.12, Math.abs(dx) / Math.abs(vx));
    const vy = (dy - 0.5 * ACID_GRAVITY * tFlight * tFlight) / tFlight;
    shot.setVelocity(vx, Phaser.Math.Clamp(vy, -460, 380));
    this.tweens.add({ targets: shot, angle: 360, duration: 700, repeat: -1 });
    Sfx.ensure(); Sfx.blip(180, 0.12, 'sawtooth', 0.22, 90);
  }

  // How many are still on their feet. A corpse stays in the group for the
  // length of its 380ms topple, so countActive() keeps seeing it — and the
  // wave-clear check runs 60ms after the kill, long before that. Counting the
  // living is what lets the last kill of a wave actually end the wave.
  aliveEnemies() {
    let n = 0;
    this.zombies.getChildren().forEach(e => {
      if (e.active && e.getData('alive') !== false) n++;
    });
    return n;
  }

  checkWaveCleared() {
    if (!this.waveActive || this.dead) return;
    if (this.spawnQueue.length > 0) return;
    if (this.aliveEnemies() > 0) return;
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
    const W = WEAPONS[this.weapon] || WEAPONS.pistol;
    // Drawing takes as long as the draw animation and no longer. The first
    // shot waits for the weapon to actually be in his hand; after that it
    // stays out, so holding fire is not a stutter of re-draws.
    if (time > this.weaponOutUntil) {
      const drawKey = heroAnim(this.hero, this.gunAction(false) + 'in', this.facing);
      const da = this.anims.get(drawKey);
      this.weaponReadyAt = time + (da ? da.duration : 0);
    }
    this.weaponOutUntil = time + WEAPON_HOLSTER_MS;
    if (time < this.weaponReadyAt) return;        // still clearing the holster

    const cd = surge ? Math.round(W.cd * 0.4) : W.cd;
    if (time < this.nextFireAt || this.dead) return;
    this.nextFireAt = time + cd;
    Sfx.ensure(); Sfx.shoot();

    // Left and right only. The pointer still picks which way he turns, but the
    // shot leaves flat — there is one firing pose per weapon and it points
    // straight ahead, so a bullet on any other line left a barrel that was not
    // pointing there.
    const base = this.facing > 0 ? 0 : Math.PI;
    // Up-aim tilts the line to match the pose. Screen Y runs down, so up is
    // negative going right and positive going left.
    const up45 = this.aimUp && this.weapon === 'pistol' && heroHas(this.hero, 'shoot45');
    const tilt = up45 ? (this.facing > 0 ? -Math.PI / 4 : Math.PI / 4) : 0;
    const angle = base + tilt + (Math.random() - 0.5) * W.spread;
    let muzzleX, muzzleY;
    if (this.realHero) {
      // The barrel itself, measured off the frame this weapon fires on and
      // stored in canvas pixels. Turning it into a world position against the
      // sprite's own origin keeps it right whatever the origin is set to.
      const art = this.hero.art;
      // By the POSE he is in, not just the weapon he is holding. The gun sits
      // in a different place standing, running and shooting up at 45 degrees,
      // and every one of those was firing from the standing muzzle — which is
      // why the bullet did not leave the barrel. The weapon is the fallback for
      // a pose that was never measured.
      const mp = art.muzzles &&
        (art.muzzles[this.player._curAction] || art.muzzles[this.weapon]);
      if (mp && art.canvasW) {
        muzzleX = this.player.x +
          this.facing * (mp.x - art.canvasW / 2) * this.player.scaleX;
        muzzleY = this.player.y +
          (mp.y - this.player.originY * art.canvasH) * this.player.scaleY;
      } else {
        muzzleX = this.player.x + this.facing * art.muzzle.dx * this.player.scaleX;
        muzzleY = this.player.y + art.muzzle.dy * this.player.scaleY;
      }
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

    // Keep swinging and the chain advances; let it lapse and the next swing
    // opens from the draw again. The blade is only out during the chain, so
    // hit one is the unsheathing cut and the rest are already-drawn swings.
    // The chain wraps rather than sticking on its heaviest swing, so holding
    // the attack reads as a rhythm — cut, cut, flourish — and the finisher
    // always lands on the beat the chain was built towards.
    if (time > this.comboUntil) this.swordCombo = 0;
    else this.swordCombo = (this.swordCombo + 1) % COMBO_ACTIONS.length;
    this.comboUntil = time + COMBO_WINDOW_MS;
    const action = COMBO_ACTIONS[this.swordCombo];

    Sfx.ensure(); Sfx.sword();

    // the swing owns the sprite for exactly as long as its own clip runs
    let swingMs = 340;
    if (this.realHero) {
      const swordKey = heroAnim(this.hero, action, this.facing);
      this.player.play(swordKey);
      this.curAnim = swordKey;
      const sa = this.anims.get(swordKey);
      if (sa) swingMs = sa.duration;
      this.swordAnimUntil = time + swingMs + 40;
      this.weaponOutUntil = 0;      // the gun goes away while the blade is out
    }
    // A heavier swing leaves you open for longer, which is what makes the
    // third beat of the chain a commitment rather than a free hit.
    this.nextSwordAt = time + Math.max(260, swingMs * 0.72);

    // No drawn-on slash: the clips carry their own arc, and a second one
    // painted over the top only fought it.
    const dir = this.facing;
    // the chain builds: later swings are wider and hit harder
    const reach = 95 + this.swordCombo * 22;
    const dmg = 3 + this.swordCombo;
    let hitAny = false;
    this.zombies.getChildren().forEach(z => {
      if (!z.active || !z.getData('alive')) return;
      const dx = z.x - this.player.x;
      const dy = Math.abs(z.y - this.player.y);
      if (dy < 70 && dx * dir > -12 && Math.abs(dx) < reach) {
        hitAny = true;
        this.damageZombie(z, dmg, dir * 320, true);
      }
    });
    if (hitAny) this.cameras.main.shake(this.swordCombo >= 2 ? 140 : 70, 0.004 + this.swordCombo * 0.002);
  }

  damageZombie(z, dmg, knockX, fromSword) {
    const type = z.getData('type');
    // staggered boss takes double damage — reward punishing the missed charge
    let finalDmg = dmg;
    if (type === 'boss' && z.getData('state') === 'stagger') finalDmg = dmg * 2;

    const hp = z.getData('hp') - finalDmg;
    z.setData('hp', hp);
    Sfx.hit();

    // Shooting the alien is what makes it dangerous: the first hit enrages it
    // for good and it stops shambling.
    if (type === 'alien' && !z.getData('enraged')) {
      z.setData('enraged', true);
      z.setData('nextLungeAt', this.time.now + 260);   // it reacts immediately
      Sfx.roar();
    }

    z.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!z.active) return;
      z.clearTint();
      if (z.getData('enraged')) z.setTint(ALIEN_RAGE_TINT);   // rage outlives the hit flash
    });

    z.setData('knockUntil', this.time.now + 160);
    const resist = type === 'brute' ? 0.35 : (type === 'boss' ? 0 : 1);
    if (resist > 0) z.setVelocityX(knockX * resist);

    if (type === 'boss') {
      this.bossBarFill.setScale(Math.max(0, hp / z.getData('hpMax')), 1);
    }

    if (hp <= 0) {
      if (this.finisherEnabled !== false && this._finisherEarned(fromSword) && this._isLastEnemy(z))
        this.executeKill(z, fromSword);
      else this.killZombie(z, fromSword);
    }
  }

  // True when this is the only one left standing and nothing more is queued —
  // the game had no notion of a final enemy before, only a zero/non-zero count
  // checked after a kill.
  // A finisher is a sword flourish, so it is only offered when the sword set
  // the kill up: the killing blow is a swing AND the chain is already going.
  // Shooting something to its last hit and then poking it once plays a
  // flourish the fight never earned, which is exactly what this rules out.
  _finisherEarned(fromSword) {
    if (!fromSword) return false;
    return this.swordCombo >= COMBO_FOR_DEATHBLOW &&
           this.time.now <= this.comboUntil;
  }

  _isLastEnemy(z) {
    if (this._executing || this.dead) return false;
    if (this.spawnQueue && this.spawnQueue.length > 0) return false;
    if (z.getData('alive') === false) return false;
    return this.aliveEnemies() <= 1;
  }

  // Single-player finisher: the last one standing dies to a solo execution.
  // Physics is slowed rather than the scene clock, so the tweens and timers
  // driving the sequence keep running at full speed and it always resolves.
  executeKill(z, fromSword) {
    this._executing = true;
    const cam = this.cameras.main;
    this.physics.world.timeScale = 2.6;
    this.invulnUntil = this.time.now + 1600;
    this.player.setVelocityX(0);

    z.setData('alive', false);
    z.body.enable = false;
    z.setTintFill(0xffe9b0);
    this.tweens.killTweensOf(z);

    // The finisher is its own animation where a character has one — Eterwolf's
    // is drawn facing the camera, which is where the pan and zoom put him.
    if (this.realHero && heroHas(this.hero, 'deathblow')) {
      const key = heroAnim(this.hero, 'deathblow', this.facing);
      this.player.play(key);
      this.curAnim = key;
      const da = this.anims.get(key);
      this.swordAnimUntil = this.time.now + (da ? da.duration : 600) + 60;
    }

    cam.stopFollow();
    cam.pan(z.x, z.y - 30, 420, 'Sine.easeInOut');
    cam.zoomTo(1.4, 420, 'Sine.easeInOut');
    Sfx.ensure(); Sfx.roar();
    this.showBanner('DEATH BLOW', '', 900);

    this.time.delayedCall(560, () => {
      // The camera, the physics clock and the flag are handed back whatever
      // happened to the target: the sandbox's clear key can destroy it in the
      // middle of this, and a world left at 2.6x with the camera parked on a
      // dead sprite strands the scene.
      this.physics.world.timeScale = 1;
      cam.zoomTo(1, 300, 'Sine.easeInOut');
      // Follow resumes on the pan's own completion rather than a timer: a pan
      // overrides the scroll every frame while it runs, so handing control back
      // on a guess either fights the pan or never lands.
      cam.pan(this.player.x, this.player.y, 300, 'Sine.easeInOut', false,
        (camera, progress) => {
          if (progress === 1) camera.startFollow(this.player, true, 0.12, 0.1);
        });
      this._executing = false;
      if (!z.active || !z.scene) return;      // cleared out from under us
      cam.shake(260, 0.016);
      cam.flash(180, 255, 240, 200);
      Sfx.squelch();
      z.clearTint();
      z.body.enable = true;          // killZombie disables it again and tidies up
      this.killZombie(z, fromSword);
    });
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

  // A glob hitting the ground leaves a mark and a hiss — cheap, but it tells
  // you where the next one is going to land.
  splashAcid(b) {
    const sp = this.add.image(b.x, GROUND_Y - 4, 'acid_splat').setDepth(1).setAlpha(0.85);
    this.tweens.add({ targets: sp, alpha: 0, scaleX: 1.5, duration: 1400,
      onComplete: () => sp.destroy() });
    Sfx.ensure(); Sfx.blip(120, 0.14, 'sawtooth', 0.14, 60);
    b.destroy();
  }

  onEnemyShotHit(player, shot) {
    if (shot.getData('acid')) {
      const sp = this.add.image(shot.x, shot.y, 'acid_splat').setDepth(14).setAlpha(0.9);
      this.tweens.add({ targets: sp, alpha: 0, scaleX: 1.6, duration: 700,
        onComplete: () => sp.destroy() });
    }
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
    if (this.player) { this.tweens.killTweensOf(this.player); this.player.setRotation(0); }
    this.dead = true;
    this.player.setVelocityX(0);
    // Real death art if the character has it — knocked off his feet, ending
    // flat on his back, and the clip holds on that last frame because the
    // update loop stops driving the sprite once he is down. A character with
    // no death clip keeps the old red silhouette.
    if (this.realHero && heroHas(this.hero, 'death')) {
      playAction(this.player, this.hero, 'death', this.facing);
      this.curAnim = heroAnim(this.hero, 'death', this.facing);
    } else {
      this.player.setTintFill(0x661a10);
    }
    this.arm.setVisible(false);
    this.bossBarBg.setVisible(false);
    this.bossBarFill.setVisible(false);
    this.bossBarLabel.setVisible(false);
    this.zombies.getChildren().forEach(z => { if (z.active) { z.setVelocityX(0); z.anims.stop(); } });

    const ov = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.62).setScrollFactor(0).setDepth(80);
    ov.setAlpha(0);
    this.tweens.add({ targets: ov, alpha: 1, duration: 600 });
    this.add.text(640, 300, ((this.hero && this.hero.name) || 'ETERWOLF') + ' DOWN', {
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
  // Walking is a mode rather than a held key because the held keys are
  // spoken for: Shift is the dash here, and Ctrl and Alt reach browser
  // shortcuts the page cannot swallow. The badge under the kill count says
  // which mode you are in.
  toggleWalk() {
    if (this.dead) return;
    this.walkMode = !this.walkMode;
    this.modeText.setText(this.walkMode ? 'WALK' : 'RUN');
    this.tweens.killTweensOf(this.modeText);
    this.modeText.setAlpha(1);
    if (!this.walkMode) {
      this.tweens.add({ targets: this.modeText, alpha: 0, delay: 900, duration: 400 });
    }
    Sfx.ensure(); Sfx.blip(this.walkMode ? 520 : 760, 0.06, 'square', 0.18, this.walkMode ? 380 : 900);
  }

  // Ducking shortens the body so shots pass over, and the sprite's feet have
  // to stay on the ground while it does — a shorter box measured from the same
  // top would leave him hovering, so the offset moves down by what was cut.
  setCrouch(on) {
    if (!this.realHero || !this.player.body) return;
    this.crouching = on;
    const B = this.hero.art.body;
    const h = on ? Math.round(B.h * CROUCH_BODY) : B.h;
    this.player.body.setSize(B.w, h).setOffset(B.x, B.y + (B.h - h));
    this.curAnim = '';                  // let the state machine pick the stance
  }


  // E cycles the guns he is carrying. Swapping puts the new one away, so the
  // next shot draws it — which is the point of the animation.
  swapWeapon() {
    if (this.dead || !this.realHero) return;
    const usable = WEAPON_IDS.filter(w => heroHas(this.hero, WEAPONS[w].shootAction));
    if (usable.length < 2) return;
    const n = usable.indexOf(this.weapon);
    this.weapon = usable[(n + 1) % usable.length];
    this.weaponOutUntil = 0;     // holster it; the next shot draws the new one
    this.weaponReadyAt = 0;
    this.curAnim = '';
    if (this.weaponText) {
      this.weaponText.setText(WEAPONS[this.weapon].name).setAlpha(1);
      this.tweens.killTweensOf(this.weaponText);
      this.tweens.add({ targets: this.weaponText, alpha: 0.45, delay: 1100, duration: 400 });
    }
    Sfx.ensure(); Sfx.blip(300, 0.05, 'square', 0.2, 520);
  }

  // The weapon action for the gun in his hand, falling back to the pistol's
  // when a character has no art for the rifle.
  gunAction(moving) {
    const w = WEAPONS[this.weapon] || WEAPONS.pistol;
    // Holding UP points the gun up and forward. There is one 45-degree pose per
    // character and it is drawn with the pistol, so the rifle falls back to its
    // own flat cycle rather than borrowing a pose holding the wrong gun.
    if (this.aimUp && this.weapon === 'pistol' && heroHas(this.hero, 'shoot45')) {
      return 'shoot45';
    }
    const want = moving ? w.runAction : w.shootAction;
    return heroHas(this.hero, want) ? want : (moving ? 'runshoot' : 'shoot');
  }

  // A puff of ground dust, used at both ends of a dash.
  dashDust(x, dir, big) {
    const n = big ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const d = this.add.image(x - dir * i * 13, GROUND_Y - 6 - Math.random() * 10, 'puff')
        .setDepth(6).setAlpha(0.5).setScale(big ? 1.5 : 1.1).setTint(0x9a8b7a);
      this.tweens.add({ targets: d, alpha: 0, scale: (big ? 3.2 : 2.3),
        x: d.x - dir * (20 + Math.random() * 26), duration: 340 + Math.random() * 160,
        onComplete: () => d.destroy() });
    }
  }

  // Streaks of torn air behind him, at the height of his body.
  dashLines(x, y, dir) {
    for (let i = 0; i < 5; i++) {
      const ln = this.add.image(x - dir * (30 + Math.random() * 70),
                                y - 46 + Math.random() * 78, 'speedline')
        .setDepth(9).setAlpha(0.6).setFlipX(dir < 0)
        .setScale(0.7 + Math.random() * 0.9, 1);
      this.tweens.add({ targets: ln, alpha: 0, x: ln.x - dir * 130,
        duration: 220 + Math.random() * 140, onComplete: () => ln.destroy() });
    }
  }

  // One frame of motion blur: the sprite exactly as it is now, smeared along
  // the direction it is travelling and left behind to fade.
  dashGhost() {
    const p = this.player;
    const g = this.add.image(p.x, p.y, p.texture.key, p.frame.name)
      .setDepth(7).setAlpha(0.42).setFlipX(p.flipX)
      .setOrigin(p.originX, p.originY)
      .setRotation(p.rotation)
      .setTint(0x8fc4ee)
      .setScale(p.scaleX * DASH_STRETCH, p.scaleY * (2 - DASH_STRETCH));
    this.tweens.add({ targets: g, alpha: 0, scaleX: p.scaleX * (DASH_STRETCH + 0.5),
      duration: DASH_GHOST_FADE, onComplete: () => g.destroy() });
  }

  dash() {
    const time = this.time.now;
    if (time < this.nextDashAt || this.dead) return;
    // The dash lasts exactly as long as its own clip, so the burst ends on the
    // frame the art ends on instead of playing over a normal run afterwards.
    // Taking the length from the animation means the two cannot drift apart
    // when the clip is recut.
    const da = this.realHero && this.anims.get(heroAnim(this.hero, 'dash', this.facing));
    const ms = da ? da.duration : 280;
    this.nextDashAt = time + ms + 560;
    this.dashUntil = time + ms;        // invulnerable for the whole burst
    this.dashAnimUntil = time + ms;
    Sfx.ensure(); Sfx.dash();

    let dir = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) dir = -1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) dir = 1;
    if (dir === 0) dir = this.facing;

    this.player.setVelocityX(dir * 760);
    this.player.setVelocityY(0);

    // he goes in leaning, and the blur trail starts on the next frame
    this.dashDir = dir;
    this.dashLanded = false;
    this.nextGhostAt = 0;
    if (this.realHero) this.player.setRotation(dir * DASH_LEAN);
    this.dashDust(this.player.x, dir, false);
    this.dashLines(this.player.x, this.player.y, dir);
    this.cameras.main.shake(90, 0.003);
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
    // Touching down after real air time plays the landing squash for a beat.
    // A step off a kerb is not a landing, so it needs to have been airborne
    // long enough to have visibly left the ground.
    if (onGround && this.airSince && time - this.airSince > 160 && heroHas(this.hero, 'land')) {
      this.landUntil = time + LAND_MS;
    }
    this.airSince = onGround ? 0 : (this.airSince || time);
    if (onGround) { this.lastGrounded = time; this.jumpsUsed = 0; resetAirPhase(this.player); }

    // ----- aim -----
    const pointer = this.input.activePointer;
    const world = cam.getWorldPoint(pointer.x, pointer.y);
    this.aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 14, world.x, world.y);

    // Holding UP tips the shot 45 degrees up — Contra's control, and the pose
    // is drawn for it. Jump stays on W and SPACE, so UP costs nothing here.
    // UP on the keyboard, or the right stick shoved up on a pad. Gated to the
    // pistol downstream, where shoot45 already lives.
    this.aimUp = this.keys.UP.isDown || Pad.rsUp;

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
    // Down is both crouch and the drop-through modifier: held on its own he
    // ducks, held with jump he falls through the ledge he is standing on.
    // Crouching is a ground stance, so leaving it airborne stands him up.
    this.dropThrough = (this.keys.S.isDown || this.keys.DOWN.isDown);
    const wantCrouch = this.dropThrough && onGround && heroHas(this.hero, 'crouch');
    if (wantCrouch !== this.crouching) this.setCrouch(wantCrouch);

    // Motion blur while he travels: a copy of the frame he is actually on,
    // smeared along the direction of travel, left behind to fade. Laid down on
    // a short interval rather than per frame so the trail looks the same
    // whatever rate the display runs at.
    if (this.realHero) {
      if (time < this.dashAnimUntil) {
        if (time >= (this.nextGhostAt || 0)) {
          this.nextGhostAt = time + DASH_GHOST_MS;
          this.dashGhost();
        }
      } else if (this.dashDir && !this.dashLanded) {
        // out the far end: plant, kick up dust, and let the lean unwind
        this.dashLanded = true;
        this.dashDust(this.player.x, this.dashDir, true);
        this.tweens.add({ targets: this.player, rotation: 0, duration: 130, ease: 'Sine.easeOut' });
        this.dashDir = 0;
      }
    }

    const dashing = time < this.dashUntil;
    if (!dashing) {
      const ground = this.crouching ? CROUCH_SPEED
                   : boostActive    ? 580
                   : this.walkMode  ? WALK_SPEED : COMBAT_SPEED;
      this.player.setVelocityX(move * ground);

      // ----- jump: buffered + coyote time + DOUBLE JUMP -----
      const wantsJump = time - this.jumpBufferedAt < 130 && !this.crouching;
      const coyoteOk = time - this.lastGrounded < 100;
      const canGroundJump = coyoteOk && this.jumpsUsed === 0;
      const canAirJump = !coyoteOk && this.jumpsUsed < 2;
      if (wantsJump && (canGroundJump || canAirJump) && !this.dropThrough) {
        const second = canAirJump && !canGroundJump;
        this.player.setVelocityY(second ? -560 : -640);
        this.jumpsUsed = second ? 2 : 1;
        this.curAnim = '';                 // replay the lift-off, even mid-rise
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
    heroFlip(this.player, this.hero, this.facing);
    const moving = Math.abs(this.player.body.velocity.x) > 20;
    if (this.realHero) {
      // Standing about with nothing left to shoot, he finds something to do
      // with his hands. Only with the street clear — strumming or eating in
      // the middle of a wave would read as a bug, not a flourish.
      if (moving || !onGround || firing || this.dead || this.crouching) {
        this.restSince = 0;
        this.longIdleDone = false;
      } else if (!this.restSince) this.restSince = time;
      // A one-off long idle is finished when its clip stops; after that he
      // just stands there until something moves him again.
      if (this.hero.longIdleOnce && this.curAnim &&
          this.curAnim.indexOf('-' + this.hero.longIdle) === 2 &&
          !this.player.anims.isPlaying) {
        this.longIdleDone = true;
      }

      // sword swing owns the sprite until it finishes
      if (time < this.swordAnimUntil) {
        // let it play
      } else {
        let want;
        if (time < this.dashAnimUntil) want = 'dash';   // the burst owns the sprite
        else if (!onGround) want = airAction(this.hero, this.player.body.velocity.y, this.player);
        else if (time < this.landUntil) want = 'land';
        else if (this.crouching) want = 'crouch';
        else if (firing) want = this.gunAction(moving);
        // The blade stays out for the length of the chain rather than snapping
        // back to an empty-handed idle between swings.
        else if (time < this.comboUntil && heroHas(this.hero, 'swordguard')) want = 'swordguard';
        else if (moving) want = this.walkMode ? 'walk' : 'run';
        // Nothing left to shoot and he finds something to do with his hands;
        // with the street still live he only gets the quiet poses.
        else want = idlePose(this.hero, this.restSince, time, this.longIdleDone,
                             this.aliveEnemies() === 0);
        const key = heroAnim(this.hero, want, this.facing);
        // There is no armed walk in the art, so walking and firing borrows the
        // run-and-gun cycle slowed to the ground speed, which keeps the feet
        // landing where they should instead of skating.
        const slowFire = this.walkMode && firing && moving && onGround &&
                         time >= this.dashAnimUntil && want === 'runshoot';
        this.player.anims.timeScale = slowFire ? WALK_SPEED / COMBAT_SPEED : 1;
        if (this.curAnim !== key) {
          playAction(this.player, this.hero, want, this.facing);
          this.curAnim = key;
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
      // acid that reaches the street burns out there rather than falling on
      if (b.getData('acid') && b.y >= GROUND_Y - 6) { this.splashAcid(b); return; }
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

      // the wall crawler: it never chases, it creeps and spits
      if (type === 'crawler') {
        const wall = z.getData('wall');
        if (time < z.getData('spitUntil')) { z.setVelocity(0, 0); return; }

        // creep up and down its stretch, turning at the ends
        let cd = z.getData('climbDir');
        if (wall) {
          if (z.y < wall.top + 30) { cd = 1; z.setData('climbDir', 1); }
          else if (z.y > wall.bottom - 30) { cd = -1; z.setData('climbDir', -1); }
          z.x = wall.faceX;                      // stays welded to the face
        }
        z.setVelocity(0, cd * z.getData('speed'));
        z.setFlipX(this.player.x < z.x);         // the mouth follows the player

        if (Math.abs(dx) < CRAWLER_RANGE && time > z.getData('nextSpitAt')) {
          z.setData('spitUntil', time + CRAWLER_SPIT_MS);
          z.setData('nextSpitAt', time + CRAWLER_SPIT_CD + Math.random() * 900);
          z.play('crawler-spit');
          z.setVelocity(0, 0);
          // the glob leaves part-way in, when the spray does in the art
          this.time.delayedCall(240, () => {
            if (z.active && z.getData('alive') !== false && !this.dead) this.spitAcid(z);
          });
          return;
        }
        if (z.anims.getName() !== 'crawler-walk' && time > z.getData('spitUntil')) {
          z.play('crawler-walk');
        }
        return;
      }

      // the alien: a slow shamble that turns into a committed lunge
      if (type === 'alien') {
        if (time < z.getData('lungeUntil')) return;        // a lunge owns the sprite
        const grounded = z.body.blocked.down || z.body.touching.down;
        const speed = z.getData('speed') * (z.getData('enraged') ? ALIEN_ENRAGE : 1);

        if (grounded && Math.abs(dx) < ALIEN_LUNGE_NEAR && time > z.getData('nextLungeAt')) {
          const which = Math.random() < 0.5 ? 'lungeA' : 'lungeB';
          z.play('alien-' + which);
          z.setData('lungeUntil', time + ALIEN_LUNGE_MS);
          z.setData('nextLungeAt', time + ALIEN_LUNGE_CD + Math.random() * 700);
          z.setVelocity(dir * speed * 4.2, -250);
          Sfx.swoop();
          return;
        }
        z.setVelocityX(dir * speed);
        if (grounded && z.anims.getName() !== 'alien-walk') z.play('alien-walk');
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
// targetH is the on-screen height in pixels. Backdrops are painted at
// different scales, so each scene states the height that reads life-size
// against its own art rather than sharing one number.
function makeWalker(scene, x, groundY, targetH, castId) {
  const H = targetH || 190;
  const hero = castById(castId || DEFAULT_CAST);
  let p;
  // How far the bottom of the physics body sits below the sprite's centre.
  // Arcade scales a body with its sprite, so this is the declared offset plus
  // height, measured from the origin, times the scale. Derived rather than read
  // back off body.bottom: the body's own position is only recomputed on the
  // next physics step, so reading it during construction gives a stale answer.
  let footDrop;
  if (hero) {
    const B = hero.art.body, sc = heroScale(hero, H, H / 224);
    p = scene.physics.add.sprite(x, groundY, hero.pre + '_idle_0');
    p.body.setSize(B.w, B.h).setOffset(B.x, B.y);
    p.setScale(sc);
    p.play(hero.pre + '-idle');
    p._real = true;
    p._hero = hero;
    footDrop = (B.y + B.h - p.originY * hero.art.canvasH) * sc;
  } else {
    p = scene.physics.add.sprite(x, groundY, 'hero_idle_0');
    p.body.setSize(22, 60).setOffset(10, 6);
    p.play('hero-idle');
    p._real = false;
    footDrop = (6 + 60 - p.originY * p.frame.height);
  }
  // Standing on the floor, not dropped onto it. He used to spawn three quarters
  // of his own height up and fall in, which the scene fades in on: the stage
  // opens with the character dropping before you can move him. That height was
  // guarding against something real — a fixed offset put a taller character's
  // feet INSIDE the slab, and arcade separation then shoved him out through the
  // bottom and he fell out of the room — but the answer is to put his feet
  // exactly on the floor line rather than to fall in from above it. The extra
  // pixel keeps him resting on the slab instead of touching it, since a body
  // that starts flush can still register as overlapping.
  p.setPosition(x, groundY - footDrop - 1);
  p.setCollideWorldBounds(true);
  p.setDepth(10);
  p._facing = 1;
  p._curAnim = '';
  p._curAction = '';
  return p;
}

// Starting to run plays the lean-in once and then hands over to the looping
// tail, which is how the run art is cut. Turning around mid-run skips the
// lean — he is already leaning — and every other animation plays straight.
// Several cycles are preceded by a one-shot: he leans into the run, pulls the
// guitar off his back, draws the pistol. Playing that intro and chaining the
// loop behind it is what makes the action read. Turning on the spot keeps the
// action, so only a CHANGE of action replays the intro.
const ACTION_INTRO = {
  run:      'runin',
  guitar:   'guitarin',
  shoot:    'shootin',
  runshoot: 'runshootin',
  shoot45:  'shoot45in',
  burger:   'burgerin'      // Wolffel digs it out of his side pocket first
};

// Airborne, the frame follows the vertical speed: lift-off and rise on the
// way up, the tucked apex while he hangs, the fall once gravity wins. With
// the art built this way a short hop and a full jump both read correctly,
// and a second jump restarts the rise. Anything without the phase art gets
// the plain jump frame.
const AIR_APEX_VY = 140;
const AIR_PHASE = ['jump', 'jumpapex', 'jumpfall'];
// The phase only ever moves FORWARD through one airborne period. Picking it
// from the vertical speed alone lets it flip back and forth whenever that speed
// wobbles across a threshold — clipping a ledge, a collision resolving, the
// forward push at take-off — and because switching phase restarts the clip from
// frame 0, every wobble showed as a stutter in mid-air. A jump is one arc:
// rise, hang, fall. Ratcheting it guarantees at most two clean cuts.
function airAction(hero, vy, p) {
  if (!heroHas(hero, 'jumpapex')) return 'jump';
  const want = vy < -AIR_APEX_VY ? 0 : vy > AIR_APEX_VY ? 2 : 1;
  if (!p) return AIR_PHASE[want];
  p._airPhase = p._airPhase === undefined ? want : Math.max(p._airPhase, want);
  return AIR_PHASE[p._airPhase];
}
// Cleared the moment he is back on the floor, so the next jump starts at the
// rise again instead of inheriting the last one's fall.
function resetAirPhase(p) { if (p) p._airPhase = undefined; }
// How long the landing squash holds before he stands or runs. Long enough for
// a three-frame landing to actually play.
const LAND_MS = 150;

// ---- guns ----------------------------------------------------------------
// Two weapons, same bullet, different feel: the pistol is quick and precise,
// the rifle faster still and heavier but it sprays.
const WEAPONS = {
  pistol: { name: 'PISTOL', cd: 150, dmg: 1, spread: 0.05, shootAction: 'shoot',   runAction: 'runshoot' },
  ak:     { name: 'AK47',   cd: 85,  dmg: 1, spread: 0.11, shootAction: 'akshoot', runAction: 'akrunshoot' }
};
const WEAPON_IDS = ['pistol', 'ak'];
// Once it is out it stays out; the draw only replays after this much quiet.
const WEAPON_HOLSTER_MS = 2600;

// ---- melee ---------------------------------------------------------------
// Swinging again before this expires carries the combo on; letting it lapse
// drops you back to the opening cut.
const COMBO_WINDOW_MS = 1400;
// Four beats where the art allows: the katana comes out and cuts, cuts again
// with the blade already drawn, the energy blade opens up, and the last turns
// him to face the camera. A character with fewer clips falls back down the
// chain and simply repeats what it has.
const COMBO_ACTIONS = ['sword', 'sword2', 'sword3', 'sword4'];
// The execution is a sword flourish, so it has to be earned with the sword.
// Shooting something down to its last hit and then poking it once would play
// a finisher the fight never set up, which is exactly what it should not do.
const COMBO_FOR_DEATHBLOW = COMBO_ACTIONS.length - 1;

// Going down is a stance, not a way to travel: he plants on his hands and
// stays there, and standing up is how you move again. The crouch-walk clip
// that was here covered only HALF a stride — one foot contact against the
// walk's two — so looping it stepped the same leg every time, which is
// exactly what it looked like. A real crouch-walk needs a clip with both
// legs in it; until there is one, prone holds still.
const CROUCH_SPEED = 0;

// ---- how a dash reads ----------------------------------------------------
// The move itself is 280ms of travel, which on its own looks like the sprite
// teleporting. What sells it is the trail: copies of the very frames he passed
// through, stretched along the direction of travel and fading behind him, which
// is what motion blur actually is. Plus the lean going in and the dust coming
// out the other end.
// The dash in a walking stage. A flat burst that ignores gravity for its own
// length, which is what makes it a traversal move rather than a faster walk:
// the jump gets you up, the dash gets you across. The numbers are the combat
// burst's, so the move feels the same wherever you meet it.
const WDASH_SPEED = 760;
const WDASH_MS    = 260;
const WDASH_COOL  = 620;      // after it ends, before another is allowed
const WDASH_GHOST = 30;       // one blur copy this often while he travels

const DASH_LEAN     = 0.17;   // ~10 degrees into the run
const DASH_GHOST_MS = 26;     // one blur copy this often while he travels
const DASH_GHOST_FADE = 260;
const DASH_STRETCH  = 1.42;   // ghosts smeared along the dash, squashed across
const CROUCH_BODY  = 0.57;   // measured: the crouch is 128px against a 226px stand

// Plays `action` on `hero`, chaining through its intro when the action is
// changing. Returns the key actually playing, which is what callers cache to
// decide whether anything needs replaying.
function playAction(p, hero, action, facing) {
  const act = heroAction(hero, action);
  const key = heroAnim(hero, act, facing);
  const intro = ACTION_INTRO[act];
  const introKey = heroHas(hero, intro) ? heroAnim(hero, intro, facing) : null;
  if (introKey && p._curAction !== act && p.scene.anims.exists(introKey)) {
    p.play(introKey);
    p.chain(key);
  } else {
    p.play(key);
  }
  p._curAction = act;
  return key;
}

// Ground speeds. He walks by default and sprints on shift, which is also what
// picks between the walk cycle and the run.
const WALK_SPEED   = 300;
// Run is nearly twice the walk. At 430 against a 300 walk the two read as the
// same pace with a different cycle on top, which is not what holding a key
// should feel like.
const RUN_SPEED    = 560;
// Combat runs by default (X drops it to the walk); the exploration sprint is
// faster still because there is nothing there to run into.
const COMBAT_SPEED = 340;
// ------------------------------------------------------------------ //
//  GAMEPAD                                                            //
//  The pad does not get an input path of its own. It types.           //
//                                                                     //
//  Every action in this game is already reachable from the keyboard —  //
//  through polled `key.isDown`, through `JustDown`, and through thirty //
//  or so `keydown-<KEY>` handlers spread across nine scenes. Rather    //
//  than teach all of that about a second input device, the pad reads   //
//  the browser's gamepad each frame and dispatches synthetic           //
//  KeyboardEvents on `window`, which is exactly where Phaser's         //
//  KeyboardManager listens. Phaser does not check `isTrusted`, so one  //
//  dispatch lights up all three mechanisms at once and every scene —   //
//  including the debug sandbox — gets pad support for free.            //
//                                                                     //
//  The alternative, OR-ing a pad check into every read site, needs a   //
//  dozen edits plus a duplicate of every handler body, and any scene   //
//  added later has to remember to do it.                              //
// ------------------------------------------------------------------ //

// keyCode is what Phaser dispatches on; `code` and `key` are filled in so the
// events look like the real thing to anything else listening.
const PAD_KEYS = {
  SPACE: [32, 'Space',      ' '],
  F:     [70, 'KeyF',       'f'],
  K:     [75, 'KeyK',       'k'],
  E:     [69, 'KeyE',       'e'],
  SHIFT: [16, 'ShiftLeft',  'Shift'],
  Q:     [81, 'KeyQ',       'q'],
  ESC:   [27, 'Escape',     'Escape'],
  UP:    [38, 'ArrowUp',    'ArrowUp'],
  DOWN:  [40, 'ArrowDown',  'ArrowDown'],
  LEFT:  [37, 'ArrowLeft',  'ArrowLeft'],
  RIGHT: [39, 'ArrowRight', 'ArrowRight']
};

// Standard-mapping button index -> the key it impersonates. Because it is a
// key and not an action, each button inherits whatever that key means in the
// scene you are in: E swaps weapon in combat and opens a door in a walking
// stage, which is the keyboard's own behaviour rather than a special case.
//
// This table is the whole mapping. Remapping later is editing it and nothing
// else.
const PAD_MAP = {
  0:  'SPACE',   // A      jump / confirm
  1:  'F',       // B      sword
  2:  'K',       // X      fire / open door
  3:  'E',       // Y      swap weapon / open door
  5:  'Q',       // RB     nuke
  8:  'ENTER',   // Back   skip what is being said
  9:  'ESC',     // Start  back to the menu / skip the cutscene
  // Clicking the left stick, where a sprint lives in most games — your thumb is
  // already on the stick that is doing the running. It was LB, which meant
  // moving and sprinting were on opposite hands.
  10: 'SHIFT',   // L3     sprint in the walking stages, dash in combat
  12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT'
};
const PAD_LABEL = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3',
  12: 'D-up', 13: 'D-down', 14: 'D-left', 15: 'D-right', 16: 'Guide'
};

// A stick resting near the threshold would otherwise chatter on and off every
// frame, so it takes more push to latch than to hold.
const PAD_LATCH = 0.35, PAD_RELEASE = 0.25;
// The 45-degree aim is a deliberate shove, not a drift.
const PAD_AIM = 0.5;
// Directions repeat while held, like browser key repeat, so a list scrolls.
// Action buttons must NOT repeat: a repeating A would re-arm the jump buffer
// and a repeating Y would cycle weapons while you held it.
const PAD_REPEAT_DELAY = 400, PAD_REPEAT_EVERY = 120;

const Pad = {
  connected: false,
  id: '',
  mapping: '',
  rsUp: false,          // right stick pushed up — the 45-degree shot
  axes: [0, 0, 0, 0],
  buttons: [],
  _held: {},            // key name -> true while the pad is holding it
  _repeatAt: {},        // key name -> when it may repeat next
  _woke: false,

  read() {
    if (!navigator.getGamepads) return null;
    const list = navigator.getGamepads();
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) return list[i];
    return null;
  },

  // `keyCode` cannot be set through the KeyboardEvent init dictionary — it is a
  // legacy accessor — and Phaser 3 dispatches on exactly that. Defining it after
  // construction is what makes any of this work.
  emit(name, type) {
    const d = PAD_KEYS[name];
    if (!d) return;
    const ev = new KeyboardEvent(type, { code: d[1], key: d[2], bubbles: true });
    Object.defineProperty(ev, 'keyCode', { get: () => d[0] });
    Object.defineProperty(ev, 'which',   { get: () => d[0] });
    window.dispatchEvent(ev);
  },

  // Let go of everything. Called when the pad vanishes and when the window
  // loses focus — without it a key the pad was holding stays down forever and
  // the character walks into a wall until you tap that key yourself.
  release() {
    for (const k in this._held) this.emit(k, 'keyup');
    this._held = {};
    this._repeatAt = {};
    this.rsUp = false;
  },

  update(now) {
    const gp = this.read();
    if (!gp) {
      if (this.connected) { this.connected = false; this.release(); }
      return;
    }
    if (!this.connected) {
      this.connected = true;
      this.id = gp.id || 'gamepad';
      this.mapping = gp.mapping || '(non-standard)';
      PadHUD.flash();
    }
    this.buttons = gp.buttons;
    this.axes = gp.axes;

    const want = {};
    for (const i in PAD_MAP) {
      const b = gp.buttons[i];
      if (b && (b.pressed || b.value > 0.5)) want[PAD_MAP[i]] = true;
    }

    // The left stick folds into the same four direction keys the d-pad uses, so
    // nothing downstream has to know which one you pushed.
    const ax = i => gp.axes[i] || 0;
    const lat = (v, k) => (this._held[k] ? v > PAD_RELEASE : v > PAD_LATCH);
    if (lat(-ax(0), 'LEFT'))  want.LEFT  = true;
    if (lat( ax(0), 'RIGHT')) want.RIGHT = true;
    if (lat(-ax(1), 'UP'))    want.UP    = true;
    if (lat( ax(1), 'DOWN'))  want.DOWN  = true;

    // Right stick is the one thing that cannot be a key: it has to stay analog
    // so it can be gated to the pistol downstream.
    this.rsUp = ax(3) < -PAD_AIM && Math.hypot(ax(2), ax(3)) > PAD_AIM;

    for (const k in want) {
      if (!this._held[k]) {
        this.emit(k, 'keydown');
        this._repeatAt[k] = now + PAD_REPEAT_DELAY;
      } else if (PAD_KEYS[k] && (k === 'UP' || k === 'DOWN' || k === 'LEFT' || k === 'RIGHT')
                 && now >= this._repeatAt[k]) {
        this.emit(k, 'keydown');
        this._repeatAt[k] = now + PAD_REPEAT_EVERY;
      }
      if (!this._woke) { this._woke = true; padWake(); }
    }
    for (const k in this._held) if (!want[k]) this.emit(k, 'keyup');
    this._held = want;

    if (PadHUD.on) PadHUD.draw();
  }
};

// A synthetic keydown reaches the audio-unlock listeners, but an untrusted
// event confers no user activation, so the browser may still refuse to start
// sound for someone playing on the pad alone from a cold load. Retrying costs
// nothing and catches the case where the page was already activated.
function padWake() {
  try { Sfx.ensure(); } catch (e) {}
  try { startMusic(); } catch (e) {}
}

// ---- the tester ----------------------------------------------------------
// Every button and both sticks, live, with the key each one is typing. The
// point is that "is my controller working" answers itself: press something and
// watch it light up, instead of deducing a mis-binding from how the game plays.
const PadHUD = {
  on: false, scene: null, box: null, txt: null, _hideAt: 0,

  scn() {
    const g = window.__game;
    if (!g) return null;
    const live = g.scene.getScenes(true);
    return live.length ? live[live.length - 1] : null;
  },

  toggle() { this.on ? this.hide() : this.show(); },

  show() {
    const s = this.scn();
    if (!s || !s.add) return;
    this.hide();
    this.scene = s;
    this.box = s.add.rectangle(14, 14, 470, 250, 0x070605, 0.90)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(200)
      .setStrokeStyle(1, 0xf2b13c, 0.7);
    this.txt = s.add.text(26, 24, '', {
      fontFamily: 'Courier New, monospace', fontSize: '12px', color: '#d9c7a8'
    }).setScrollFactor(0).setDepth(201);
    this.on = true;
    this.draw();
  },

  hide() {
    if (this.box) this.box.destroy();
    if (this.txt) this.txt.destroy();
    this.box = this.txt = this.scene = null;
    this.on = false;
  },

  // Shown for a moment when a pad first appears, so you know it was seen.
  flash() {
    if (this.on) return;
    this.show();
    this._hideAt = Date.now() + 3200;
  },

  draw() {
    // The scene can change underneath it (a stage transition), and Phaser
    // destroys its objects with it, so rebuild on a different scene.
    if (this.scene !== this.scn()) { const was = this.on; this.hide(); if (was) this.show(); return; }
    if (!this.txt) return;
    if (this._hideAt && Date.now() > this._hideAt) { this._hideAt = 0; this.hide(); return; }

    const L = [];
    if (!Pad.connected) {
      L.push('NO CONTROLLER SEEN YET');
      L.push('');
      L.push('Press any button on the pad.');
      L.push('A connected controller stays invisible to');
      L.push('the browser until a button is pressed, so');
      L.push('plugged in but untouched looks like absent.');
    } else {
      L.push('PAD  ' + Pad.id.slice(0, 44));
      L.push('mapping: ' + Pad.mapping);
      L.push('');
      let row = '';
      for (let i = 0; i < Pad.buttons.length; i++) {
        const b = Pad.buttons[i];
        const down = b && (b.pressed || b.value > 0.5);
        const name = PAD_LABEL[i] || ('b' + i);
        const key = PAD_MAP[i] ? '>' + PAD_MAP[i] : '';
        row += (down ? '[' + name + key + ']' : ' ' + name + key + ' ');
        if ((i + 1) % 4 === 0) { L.push(row); row = ''; }
      }
      if (row) L.push(row);
      L.push('');
      const f = v => (v < 0 ? '' : '+') + v.toFixed(2);
      L.push('L stick ' + f(Pad.axes[0] || 0) + ' , ' + f(Pad.axes[1] || 0) +
             '   -> move / crouch');
      L.push('R stick ' + f(Pad.axes[2] || 0) + ' , ' + f(Pad.axes[3] || 0) +
             '   -> 45' + String.fromCharCode(176) + ' aim ' + (Pad.rsUp ? '** ON **' : '(push up)'));
      L.push('');
      L.push('holding: ' + (Object.keys(Pad._held).join(' ') || '-'));
    }
    L.push('');
    L.push('F10 closes this');
    this.txt.setText(L.join('\n'));
  }
};

// Collision that follows what is actually painted, rather than one flat box.
//
// A ruined wall does not have a level top: the blue wall has a raised section
// at the left, a long capstone across the middle, and a slope into rubble at
// the right end, spanning about 60px of height between them. A single rectangle
// can only ever match one of those, so the brothers stood correctly on one part
// and hovered over the rest — which is exactly what they did across 83% of its
// width. This reads the top edge of the picture and lays a short solid under
// each slice of it, so the surface they stand on is the surface you can see.
//
// The texture ships as a data URI, so it is same-origin and readable; the scan
// is a few tens of thousands of pixel tests, once, cached by texture key.
const _profileCache = {};
function surfaceProfile(scene, texKey, segments) {
  const cacheKey = texKey + '@' + segments;
  if (_profileCache[cacheKey]) return _profileCache[cacheKey];
  let out = null;
  try {
    const src = scene.textures.get(texKey).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    const d = cx.getImageData(0, 0, src.width, src.height).data;
    const tops = new Array(src.width).fill(-1);
    for (let x = 0; x < src.width; x++) {
      for (let y = 0; y < src.height; y++) {
        if (d[(y * src.width + x) * 4 + 3] > 40) { tops[x] = y; break; }
      }
    }
    out = [];
    for (let i = 0; i < segments; i++) {
      const x0 = Math.floor(src.width * i / segments);
      const x1 = Math.floor(src.width * (i + 1) / segments);
      const col = [];
      for (let x = x0; x < x1; x++) if (tops[x] >= 0) col.push(tops[x]);
      if (!col.length) { out.push(null); continue; }
      col.sort((a, b) => a - b);
      // the median, not the highest: a single spike of debris should not lift
      // the whole slice
      out.push({ x0: x0 / src.width, x1: x1 / src.width,
                 topFrac: col[Math.floor(col.length / 2)] / src.height });
    }
  } catch (e) { out = null; }   // tainted or missing: caller falls back
  _profileCache[cacheKey] = out;
  return out;
}

function driveWalker(scene, p, keys, onGround) {
  let move = 0;
  if (keys.A.isDown || keys.LEFT.isDown)  move -= 1;
  if (keys.D.isDown || keys.RIGHT.isDown) move += 1;
  if (move !== 0) p._facing = move;
  // A stage can take the sprint away. The bridge does, and has to: a
  // sprinting single jump carries 452px here and a walking double only 416,
  // so with the sprint available there is no gap width that a double jump can
  // cross and a single cannot — the stage would teach nothing.
  const canDash = !!(scene.cfg && scene.cfg.dash);
  // A stage has one or the other on Shift, never both: holding it to sprint
  // would fire a dash on every first frame of the hold.
  const sprint = !canDash && !!(keys.SHIFT && keys.SHIFT.isDown) &&
                 !(scene.cfg && scene.cfg.noSprint);
  // Everything here is in the stage's own scale: a bigger man takes bigger
  // strides and a bigger leap, so the motion reads the same at any size.
  const k = scene.playScale || 1;
  const now = scene.time.now;

  // ---- dash ----------------------------------------------------------
  // One in the air per trip off the ground, so a crossing is jump, jump,
  // dash — and not an indefinite glide across any gap at all.
  if (onGround) p._airDashUsed = false;
  if (canDash && keys.SHIFT && Phaser.Input.Keyboard.JustDown(keys.SHIFT) &&
      now >= (p._dashReadyAt || 0) && (onGround || !p._airDashUsed)) {
    p._dashDir = move || p._facing || 1;
    p._dashUntil = now + WDASH_MS;
    p._dashReadyAt = now + WDASH_MS + WDASH_COOL;
    p._dashGhostAt = 0;
    if (!onGround) p._airDashUsed = true;
    Sfx.ensure(); Sfx.dash();
    scene.cameras.main.shake(90, 0.003);
  }
  const dashing = now < (p._dashUntil || 0);
  if (dashing) {
    // Flat: gravity off for the burst, so it carries the same distance
    // whether it is started on the floor or at the top of a jump.
    if (p.body.allowGravity) p.body.setAllowGravity(false);
    p.setVelocity(p._dashDir * WDASH_SPEED * k, 0);
    if (p._real && now >= (p._dashGhostAt || 0)) {
      p._dashGhostAt = now + WDASH_GHOST;
      const gh = scene.add.image(p.x, p.y, p.texture.key, p.frame.name)
        .setOrigin(p.originX, p.originY).setDepth(p.depth - 1)
        .setFlipX(p.flipX).setAlpha(0.42)
        .setScale(p.scaleX * DASH_STRETCH, p.scaleY * (2 - DASH_STRETCH));
      scene.tweens.add({ targets: gh, alpha: 0, duration: DASH_GHOST_FADE,
                         onComplete: () => gh.destroy() });
    }
  } else {
    if (!p.body.allowGravity) p.body.setAllowGravity(true);
    p.setVelocityX(move * (sprint ? RUN_SPEED : WALK_SPEED) * k);
  }

  const wantJump = !dashing &&
                  (Phaser.Input.Keyboard.JustDown(keys.W)
                || Phaser.Input.Keyboard.JustDown(keys.SPACE)
                || Phaser.Input.Keyboard.JustDown(keys.UP));
  // Touching down clears the count, so the second jump is only ever available
  // once he has left the floor.
  if (onGround) p._jumpsUsed = 0;
  const maxJumps = (scene.cfg && scene.cfg.doubleJump) ? 2 : 1;
  if (wantJump && (p._jumpsUsed || 0) < maxJumps) {
    // The air jump starts from a standstill vertically rather than adding to
    // whatever he had left, or a jump tapped at the top of the arc barely
    // registers while one tapped while falling throws him miles.
    p.setVelocityY(-640 * k);
    // Forward momentum during jump: natural platformer feel
    p.setVelocityX((move || p._facing) * 140 * k);
    p._jumpsUsed = (p._jumpsUsed || 0) + 1;
    Sfx.ensure(); Sfx.jump();
    // Restart the jump art on the second one so it reads as a fresh push
    // rather than continuing the fall.
    if (p._jumpsUsed > 1 && p._real) { p._airPhase = undefined; p._curAnim = ''; }
  }

  const hero = p._hero;
  // same landing beat as combat: only after real air time
  if (onGround && p._airSince && now - p._airSince > 160 && heroHas(hero, 'land')) {
    p._landUntil = now + LAND_MS;
  }
  if (onGround) resetAirPhase(p);
  p._airSince = onGround ? 0 : (p._airSince || now);

  heroFlip(p, hero, p._facing);
  const moving = Math.abs(p.body.velocity.x) > 20;

  // Left standing long enough he finds something to do with his hands —
  // Eterwolf the guitar off his back, Wolffel a burger out of his side pocket.
  // Each character names its own and how long it takes to get bored.
  if (moving || !onGround) { p._restSince = 0; p._longIdleDone = false; }
  else if (!p._restSince) p._restSince = now;
  // A tutorial stage says what it teaches and nothing else — no taking the
  // guitar off his back halfway through learning to jump.
  const allowLong = !(scene.cfg && scene.cfg.noLongIdle);
  if (hero && hero.longIdleOnce && p._curAnim &&
      p._curAnim.indexOf('-' + hero.longIdle) === 2 && !p.anims.isPlaying) {
    p._longIdleDone = true;
  }

  if (p._real) {
    // picking himself up owns the sprite until it finishes
    if (now < (p._downUntil || 0)) { p.setVelocityX(0); return move; }

    const want = dashing ? 'dash'
               : !onGround ? airAction(hero, p.body.velocity.y, p)
               : now < (p._landUntil || 0) ? 'land'
               : moving    ? (sprint ? 'run' : 'walk')
               : idlePose(hero, p._restSince, now, p._longIdleDone, allowLong);
    const key = heroAnim(hero, want, p._facing);
    if (p._curAnim !== key) { playAction(p, hero, want, p._facing); p._curAnim = key; }
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
// ================================================================== //
//  START GATE — "press any button"                                    //
//                                                                     //
//  This exists for two reasons, both of them browser rules rather than //
//  design choices.                                                    //
//                                                                     //
//  A controller is invisible to the page until a button on it has been //
//  pressed — navigator.getGamepads() returns four nulls no matter how  //
//  plugged in it is. And a page cannot start sound until it has had a  //
//  real interaction, which a synthetic event from the pad does not     //
//  count as. One screen that waits for a press solves both: whatever   //
//  you press, the page is now activated and the pad is now visible.    //
//                                                                     //
//  It also reports what it can see, because "my controller does not    //
//  work" has several possible causes and they are not distinguishable  //
//  from inside the game without saying which one applies.              //
// ================================================================== //
class StartScene extends Phaser.Scene {
  constructor() { super('StartScene'); }

  create() {
    const W = 1280, H = 720;
    this.cameras.main.setBackgroundColor('#0a0807');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    if (this.textures.exists('scene_bunker')) {
      const bg = this.add.image(W / 2, H / 2, 'scene_bunker').setDepth(-20);
      bg.setScale(Math.max(W / bg.width, H / bg.height)).setTint(0x2a241e);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0807, 0.62).setDepth(-10);

    this.add.text(W / 2, 250, 'ATOMHOWL', {
      fontFamily: F_UI, fontSize: '82px', fontStyle: '700', color: '#f0e6d4',
      stroke: '#070605', strokeThickness: 8
    }).setOrigin(0.5).setDepth(10);

    this.add.rectangle(W / 2, 306, 360, 2, 0xf2b13c, 0.85).setDepth(10);

    this._prompt = this.add.text(W / 2, 372, 'PRESS ANY BUTTON', {
      fontFamily: F_UI, fontSize: '26px', fontStyle: '700', color: '#f2b13c',
      stroke: '#070605', strokeThickness: 5
    }).setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: this._prompt, alpha: 0.35, yoyo: true, repeat: -1, duration: 780 });

    this.add.text(W / 2, 414, 'keyboard, mouse or controller', {
      fontFamily: F_UI, fontSize: '13px', fontStyle: '600', color: '#8a7660'
    }).setOrigin(0.5).setDepth(10);

    // The controller read-out. Live, so plugging in or pressing a pad button
    // changes it while you watch — which is the whole point.
    this._pad = this.add.text(W / 2, 560, '', {
      fontFamily: 'Courier New, monospace', fontSize: '14px', color: '#7d6c55',
      align: 'center', lineSpacing: 5
    }).setOrigin(0.5).setDepth(10);

    const go = () => this._go();
    this.input.keyboard.on('keydown', go);
    this.input.on('pointerdown', go);
    this._t0 = this.time.now;
  }

  // What the page can and cannot see, in the order the causes are worth
  // ruling out.
  _diagnose() {
    const api = typeof navigator.getGamepads === 'function';
    if (!api) {
      return ['CONTROLLER: this browser exposes no gamepad API',
              'Try Chrome or Edge.'];
    }
    let pads = [];
    try { pads = Array.from(navigator.getGamepads()).filter(Boolean); } catch (e) {
      return ['CONTROLLER: the page is not allowed to read gamepads',
              'Open the game in its own tab rather than embedded.'];
    }
    if (Pad.connected || pads.length) {
      const name = (Pad.id || (pads[0] && pads[0].id) || 'controller').slice(0, 46);
      return ['CONTROLLER FOUND', name, 'Press a button on it to continue.'];
    }
    const framed = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
    const out = ['CONTROLLER: none seen yet'];
    out.push('A pad stays invisible to the browser until you');
    out.push('press one of its buttons. Press one now.');
    if (framed) {
      out.push('');
      out.push('Still nothing? This page is embedded. Open it in');
      out.push('its own tab, or use the downloaded atomhowl.html.');
    }
    return out;
  }

  update() {
    if (this._pad) this._pad.setText(this._diagnose().join('\n'));
  }

  _go() {
    if (this._done) return;
    this._done = true;
    // A real press is what grants the page permission to make noise.
    Sfx.ensure();
    startMusic();
    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
  }
}

class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const W = 1280, H = 720;
    this.cameras.main.setBackgroundColor('#0a0807');

    // No still art behind the video. The old painted menu used to sit there
    // to cover the frames before the clip decodes, and what it actually did
    // was show through — its own title and layout bleeding past the edges of
    // the new one. The dark camera fill covers that gap instead.
    this._buildVideo(W, H);

    // The type sits in the left third, so the plate is darkened as a gradient
    // band on that side only — the city and the brothers stay clear.
    const band = this.add.graphics().setDepth(-5);
    for (let i = 0; i < 60; i++) {
      band.fillStyle(0x070605, 0.80 * (1 - i / 60));
      band.fillRect(i * 10, 0, 10, H);
    }

    startMusic();

    const LX = 86;                                   // shared left margin
    this.add.text(LX, 158, 'ATOMHOWL', {
      fontFamily: F_UI, fontSize: '76px', fontStyle: '700', color: '#f0e6d4',
      stroke: '#070605', strokeThickness: 7
    }).setOrigin(0, 0.5).setDepth(10);

    this.add.rectangle(LX, 205, 330, 2, 0xf2b13c, 0.85).setOrigin(0, 0.5).setDepth(10);

    this.add.text(LX, 233, '2076', {
      fontFamily: F_UI, fontSize: '21px', fontStyle: '700', color: '#f2b13c',
      stroke: '#070605', strokeThickness: 3
    }).setOrigin(0, 0.5).setDepth(10);
    this.add.text(LX, 262, "TWO BROTHERS. APPARENTLY WE'RE CHOSEN TO SAVE HUMANITY.", {
      fontFamily: F_UI, fontSize: '15px', fontStyle: '600', color: '#cbbba1',
      stroke: '#070605', strokeThickness: 3
    }).setOrigin(0, 0.5).setDepth(10);

    const items = [
      ['NEW GAME', () => this._newGame()],
      ['CONTINUE', () => this._toast('No save file found.')],
      ['SETTINGS', () => this._toast('Settings — coming soon.')],
      ['CREDITS',  () => this._toast('Credits — coming soon.')]
    ];
    // Development builds only — a release build drops this entry entirely.
    if (window.ATOMHOWL_DEV) items.push(['DEBUG SANDBOX', () => enterSandbox(this)]);
    this._btns = items.map(([label, act], i) => this._button(LX, 348 + i * 56, label, act));
    this._cursor = 0;
    this._highlight(0);

    const move = d => {
      this._cursor = (this._cursor + d + this._btns.length) % this._btns.length;
      Sfx.ensure(); Sfx.hover();
      this._highlight(this._cursor);
    };
    this.input.keyboard.on('keydown-DOWN', () => move(1));
    this.input.keyboard.on('keydown-UP', () => move(-1));
    // SPACE as well as ENTER: the other two menus already take both, and the
    // pad's A button types SPACE, so without this it could not confirm here.
    const activate = () => { Sfx.ensure(); Sfx.select(); items[this._cursor][1](); };
    this.input.keyboard.on('keydown-ENTER', activate);
    this.input.keyboard.on('keydown-SPACE', activate);
    this.input.on('pointerdown', () => Sfx.ensure());

    this._toastTxt = this.add.text(86, 604, '', {
      fontFamily: F_UI, fontSize: '17px', fontStyle: '600', color: '#c93b2a',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0, 0.5).setDepth(10).setAlpha(0);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  // Phaser's video loader fetches over XHR, which file:// blocks — loadURL()
  // assigns the element's src instead, so the same page works unserved.
  _buildVideo(W, H) {
    const list = mediaList('menuVideo');
    if (!list.length || typeof this.add.video !== 'function') return;
    try {
      const vid = this.add.video(W / 2, H / 2).setDepth(-10);
      vid.setMute(true);              // muted playback is what autoplay allows

      // Size only once the texture carries the real frame: until then the
      // object still reports Phaser's 256px placeholder and would scale wrong.
      // The clip is wider than the canvas, and the brothers stand at its right
      // edge, so the surplus is trimmed off the left instead of both sides —
      // centring it would cut the far brother in half.
      const fit = () => {
        const w = vid.width, h = vid.height;
        if (w <= 1 || h <= 1) return;
        vid.setScale(Math.max(W / w, H / h));                       // cover
        vid.x = W - vid.displayWidth / 2;                           // right-align
      };
      vid.on('textureready', fit);
      vid.on('created', () => { fit(); vid.play(true); });

      vid.loadURL(list, true);        // Phaser keeps the first decodable entry
      vid.play(true);
      this._video = vid;
    } catch (e) { /* still art already covers this */ }
  }

  _button(x, y, label, act) {
    const txt = this.add.text(x + 26, y, label, {
      fontFamily: F_UI, fontSize: '29px', fontStyle: '600', color: '#f2b13c',
      stroke: '#070605', strokeThickness: 5
    }).setOrigin(0, 0.5).setDepth(10).setInteractive({ useHandCursor: true });
    // a caret marks the row instead of a centred underline
    const rule = this.add.text(x, y, '▸', {
      fontFamily: F_UI, fontSize: '22px', color: '#f2b13c'
    }).setOrigin(0, 0.5).setDepth(10).setAlpha(0);
    const btn = { txt, rule, act };

    txt.on('pointerover', () => {
      this._cursor = this._btns.indexOf(btn);
      Sfx.ensure(); Sfx.hover();
      this._highlight(this._cursor);
    });
    txt.on('pointerdown', () => { Sfx.ensure(); Sfx.select(); act(); });
    return btn;
  }

  _highlight(idx) {
    this._btns.forEach((b, i) => {
      const on = i === idx;
      b.txt.setColor(on ? '#fff2c8' : '#f2b13c');
      b.rule.setAlpha(on ? 1 : 0);
    });
  }

  _newGame() {
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('CharSelectScene'));
  }

  _toast(msg) {
    this._toastTxt.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this._toastTxt, alpha: 0, duration: 500, delay: 1700 });
  }

  shutdown() {
    if (this._video) { try { this._video.destroy(); } catch (e) {} this._video = null; }
  }
}

// ================================================================== //
//  CHARACTER SELECT                                                  //
//  Eterwolf is shown as the live Idle_v3 loop — the same art the      //
//  player controls — rather than a separate portrait that could drift //
//  out of sync with the sprite.                                       //
// ================================================================== //
class CharSelectScene extends Phaser.Scene {
  constructor() { super('CharSelectScene'); }

  create() {
    const W = 1280, H = 720;
    this.cameras.main.setBackgroundColor('#0a0807');
    this.cameras.main.fadeIn(600, 0, 0, 0);
    // The menu theme belongs to the menu. Leaving it — even as far as the
    // character select — fades it out; coming back to MenuScene starts it again.
    stopMusic(600);

    if (this.textures.exists('scene_bunker')) {
      const bg = this.add.image(W / 2, H / 2, 'scene_bunker').setDepth(-20);
      bg.setScale(Math.max(W / bg.width, H / bg.height)).setTint(0x4a4038);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0807, 0.5).setDepth(-10);

    const head = this.add.text(W / 2, 68, 'SELECT YOUR CHARACTER', {
      fontFamily: F_UI, fontSize: '34px', fontStyle: '700', color: '#f0e6d4',
      stroke: '#070605', strokeThickness: 6
    }).setOrigin(0.5);

    // HUD dressing: rules running out from the heading with end ticks, and a
    // scanline wash over the whole screen to read as a readout rather than a
    // menu sitting on a photograph.
    const deco = this.add.graphics().setDepth(1);
    const hw = head.width / 2 + 26;
    [[-1, W / 2 - hw], [1, W / 2 + hw]].forEach(([dir, from]) => {
      deco.lineStyle(2, 0xf2b13c, 0.55);
      deco.beginPath(); deco.moveTo(from, 68); deco.lineTo(from + dir * 230, 68); deco.strokePath();
      deco.lineStyle(2, 0xf2b13c, 0.85);
      deco.beginPath(); deco.moveTo(from + dir * 230, 58); deco.lineTo(from + dir * 230, 78); deco.strokePath();
    });
    const scan = this.add.graphics().setDepth(1);
    scan.fillStyle(0x000000, 0.22);
    for (let y = 0; y < H; y += 3) scan.fillRect(0, y, W, 1);

    this.slots = [
      this._slot(370, 390, 'PLAYER 1', 'ETERWOLF', 'eterwolf', true),
      this._slot(910, 390, 'PLAYER 2', 'WOLFFEL', 'wolffel', true)
    ];
    this._cursor = 0;
    this._paint();

    this._hint = this.add.text(W / 2, 652, '◄  ►   CHOOSE        ENTER   CONFIRM', {
      fontFamily: 'Courier New, monospace', fontSize: '19px', color: '#f2b13c',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5);
    this.tweens.add({ targets: this._hint, alpha: 0.45, yoyo: true, repeat: -1, duration: 850 });

    this._note = this.add.text(W / 2, 606, '', {
      fontFamily: 'Courier New, monospace', fontSize: '17px', color: '#c93b2a',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0);

    const move = d => {
      this._cursor = (this._cursor + d + this.slots.length) % this.slots.length;
      Sfx.ensure(); Sfx.hover(); this._paint();
    };
    this.input.keyboard.on('keydown-LEFT', () => move(-1));
    this.input.keyboard.on('keydown-RIGHT', () => move(1));
    this.input.keyboard.on('keydown-ENTER', () => this._confirm());
    this.input.keyboard.on('keydown-SPACE', () => this._confirm());
  }

  // An angular plate with the corners cut off, plus brackets that light up on
  // the active slot — closer to a targeting readout than a picture frame.
  _plate(g, x, y, w, h, colour, alpha, fill) {
    const c = 26, L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2;
    const pts = [
      { x: L + c, y: T }, { x: R - c, y: T }, { x: R, y: T + c }, { x: R, y: B - c },
      { x: R - c, y: B }, { x: L + c, y: B }, { x: L, y: B - c }, { x: L, y: T + c }
    ];
    if (fill != null) { g.fillStyle(fill, 0.9); g.fillPoints(pts, true); }
    g.lineStyle(2, colour, alpha);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();
  }

  _brackets(g, x, y, w, h, colour, alpha) {
    const L = x - w / 2, R = x + w / 2, T = y - h / 2, B = y + h / 2, a = 34;
    // Glow layer — outer halo
    g.lineStyle(10, colour, alpha * 0.25);
    [[L, T, 1, 1], [R, T, -1, 1], [L, B, 1, -1], [R, B, -1, -1]].forEach(([px, py, dx, dy]) => {
      g.beginPath(); g.moveTo(px + dx * a, py); g.lineTo(px, py);
      g.lineTo(px, py + dy * a); g.strokePath();
    });
    // Main bracket — bright core
    g.lineStyle(5, colour, alpha);
    [[L, T, 1, 1], [R, T, -1, 1], [L, B, 1, -1], [R, B, -1, -1]].forEach(([px, py, dx, dy]) => {
      g.beginPath(); g.moveTo(px + dx * a, py); g.lineTo(px, py);
      g.lineTo(px, py + dy * a); g.strokePath();
    });
  }

  _slot(x, y, role, name, id, unlocked) {
    const BW = 330, BH = 430;
    const panel = this.add.graphics().setDepth(2);
    this.add.text(x, y - BH / 2 + 26, role, {
      fontFamily: F_UI, fontSize: '15px', fontStyle: '700', color: '#8a6f4a'
    }).setOrigin(0.5).setDepth(3);

    // The 8-direction turntable is the idle stance here: it reads as the
    // character presenting themselves rather than standing in profile.
    // Above the plate: the plate is a filled shape, so anything left on the
    // default layer ends up painted over and the character vanishes into it.
    let art = null;
    if (this.anims.exists('turn-' + id)) {
      art = this.add.sprite(x, y + 150, `rot_${id}_0`).setOrigin(0.5, 1).setDepth(3);
      art.play('turn-' + id);
      art.setScale(Math.min(250 / art.width, 320 / art.height));
    }

    const label = this.add.text(x, y + BH / 2 - 34, name, {
      fontFamily: F_UI, fontSize: '27px', fontStyle: '700', color: '#f2b13c',
      stroke: '#070605', strokeThickness: 5
    }).setOrigin(0.5).setDepth(4);

    let lock = null;
    if (!unlocked) {
      lock = this.add.text(x, y - 24, '\u25A0 LOCKED', {
        fontFamily: F_UI, fontSize: '19px', fontStyle: '700', color: '#8a7660',
        stroke: '#070605', strokeThickness: 6
      }).setOrigin(0.5).setDepth(4);
    }

    const zone = this.add.zone(x, y, BW, BH).setInteractive({ useHandCursor: true });
    const self = { panel, art, label, lock, unlocked, id, x, y, w: BW, h: BH };
    zone.on('pointerover', () => {
      this._cursor = this.slots.indexOf(self);
      Sfx.ensure(); Sfx.hover(); this._paint();
    });
    zone.on('pointerdown', () => this._confirm());
    return self;
  }

  _paint() {
    this.slots.forEach((s, i) => {
      const on = i === this._cursor;
      const edge = on ? (s.unlocked ? 0xf2b13c : 0xa5673c) : 0x4a3d30;
      s.panel.clear();
      this._plate(s.panel, s.x, s.y, s.w, s.h, edge, on ? 1 : 0.7, 0x140f0b);
      if (on) {
        this._plate(s.panel, s.x, s.y, s.w - 10, s.h - 10, edge, 0.25);
        this._brackets(s.panel, s.x, s.y, s.w + 12, s.h + 12, edge, 0.95);
      }
      s.label.setColor(on ? '#fff2c8' : (s.unlocked ? '#f2b13c' : '#6b5a48'));
      // A locked character is dimmed but still legible — you should be able to
      // see who is coming, so the tint darkens instead of fading them out.
      if (!s.art) return;
      s.art.setAlpha(1);
      s.art.setTint(s.unlocked ? 0xffffff : (on ? 0x9a8f82 : 0x6e6660));
    });
  }

  _confirm() {
    const slot = this.slots[this._cursor];
    Sfx.ensure();
    if (!slot.unlocked) {
      Sfx.deny();
      this._note.setText(slot.label.text + ' is not available yet.').setAlpha(1);
      this.tweens.add({ targets: this._note, alpha: 0, duration: 500, delay: 1900 });
      return;
    }
    Sfx.select();
    // Carry the choice forward. Without this the screen was decorative — every
    // stage still started whoever GameState happened to be holding.
    if (slot.id && castById(slot.id)) GameState.castId = slot.id;
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('IntroDialogueScene'));
  }
}

// ================================================================== //
//  INTRO DIALOGUE — the two brothers in the bunker                   //
//  Portraits sit either side of a framed panel, blink on their own    //
//  random clocks, and the line types itself out one glyph at a time.  //
// ================================================================== //
const SPEAKER_SIDE = { WOLFFEL: 'left', ETERWOLF: 'right' };
const SLEEPER = 'WOLFFEL';        // out cold until the line that wakes him

// The bunker wake-up. Eterwolf calls his brother "Feli"; the plate shows his
// name, WOLFFEL. A line marked wake is where the brother comes round — until
// then he is slumped and unlit.
// `vox` names this line's own recording. The scene was recorded as one
// continuous take and is cut into a clip per line at build time — seeking into
// the single take looked tidier but does not work: a plain <audio> reports
// seekable [0,0] unless the host answers range requests, so every seek snapped
// back to 0 and played the top of the take over whichever line was on screen.
// A file per line needs no seeking, and dropping the gaps between lines makes
// it smaller than the take was.
//
// The scene ends on the last line of the recording, so every spoken line here
// is voiced; the two "..." beats carry no audio by design.
const INTRO_LINES = [
  { who: 'ETERWOLF', text: "Mk, what happened? Where are we?" },
  { who: 'ETERWOLF', text: "Wake up, Feli." },
  { who: 'WOLFFEL',  text: "Hmm, what's going on? I'm hungry.", wake: true },
  { who: 'ETERWOLF', text: "Do you remember how we got here?" },
  { who: 'WOLFFEL',  text: "No..." },
  { who: 'WOLFFEL',  text: "..." },
  { who: 'ETERWOLF', text: "..." },
  { who: 'ETERWOLF', text: "Ok, let's get out." }
];
// No line names a recording any more — the takes were not worth keeping and
// the scene reads better typed. Nothing below has been torn out: put a
// `vox: 'bunker_01'` back on a line and it speaks again, paced to the clip,
// and the recordings are still in public/assets/voice.

// ---- dialogue voice ------------------------------------------------------
// One element per clip, kept after first use: re-creating an Audio per line
// re-downloads it on some browsers, and the clips are small enough to hold.
const _voxPool = {};
let _voxNow = null;
function stopVoice() {
  if (_voxNow) { try { _voxNow.pause(); _voxNow.currentTime = 0; } catch (e) {} _voxNow = null; }
  duckMusic(false);
}
// Returns the clip's length in seconds so the typewriter can be paced to it,
// or 0 when there is no voice for this line.
function playVoice(id) {
  stopVoice();
  if (!id) return 0;
  const map = window.VOICE || {};
  const src = map[id];
  if (!src) return 0;
  let a = _voxPool[id];
  if (!a) {
    try { a = _voxPool[id] = new Audio(src); a.preload = 'auto'; } catch (e) { return 0; }
  }
  try {
    a.currentTime = 0;                       // from the top; no seeking involved
    const pr = a.play();
    if (pr && pr.catch) pr.catch(() => {});  // autoplay may still be blocked
  } catch (e) { return 0; }
  _voxNow = a;
  duckMusic(true);
  a.addEventListener('ended', () => { if (_voxNow === a) stopVoice(); }, { once: true });
  // Durations are measured at build time, so the pacing does not have to wait
  // for metadata to arrive before the first character is drawn.
  const d = (window.VOICE_MS || {})[id];
  return d ? d / 1000 : (isFinite(a.duration) ? a.duration : 0);
}

class IntroDialogueScene extends Phaser.Scene {
  constructor() { super('IntroDialogueScene'); }

  create() {
    const W = 1280, H = 720;
    this.cameras.main.setBackgroundColor('#0a0807');
    this.cameras.main.fadeIn(900, 0, 0, 0);
    stopMusic(400);

    if (this.textures.exists('scene_bunker')) {
      const bg = this.add.image(W / 2, H / 2, 'scene_bunker').setDepth(-20);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0807, 0.5).setDepth(-15);

    this._ui = [];                       // bar + figures, faded in after the beat
    this._buildPanel(W, H);

    this.portraits = {
      WOLFFEL:     this._portrait('WOLFFEL', 238),
      ETERWOLF: this._portrait('ETERWOLF', 1042)
    };
    Object.keys(this.portraits).forEach(k => this._scheduleBlink(k));

    // He is still out cold when the scene opens, so he holds his eyes shut and
    // sits lower and unlit until the line that wakes him.
    this._awake = false;
    const sleeper = this.portraits[SLEEPER];
    if (sleeper && sleeper.img && this.textures.exists(sleeper.closedKey)) {
      sleeper.img.setTexture(sleeper.closedKey);
    }

    // Hold on the bunker first so the room is actually seen — the
    // frame covers that corner once it rises.
    this._ui.forEach(o => o.setAlpha(0));
    this._idx = 0;
    this._started = false;
    this.time.delayedCall(1500, () => this._begin());

    // A click on the SKIP button also reaches the scene's own pointer handler,
    // so this bails once the scene is on its way out rather than stepping a
    // line forward underneath the fade.
    const next = () => { if (this._done) return;
                         return this._started ? this._advance() : this._begin(); };
    this.input.on('pointerdown', next);
    this.input.keyboard.on('keydown-SPACE', next);
    this.input.keyboard.on('keydown-ENTER', next);
    this.input.keyboard.on('keydown-ESC', () => this._finish());
  }

  _begin() {
    if (this._started) return;
    this._started = true;
    this._ui.forEach(o => this.tweens.add({ targets: o, alpha: 1, duration: 420 }));
    this._show();
  }


  _buildPanel(W, H) {
    // A narrow bar sits between the two figures rather than spanning the
    // screen, so the scene and both characters stay visible around it.
    const w = 620, h = Math.round(w * 724 / 2172);       // frame art is 3:1
    const x = Math.round((W - w) / 2), y = H - h - 26;
    this._panel = { x, y, w, h };

    const first = this.textures.exists('ui_panel_l') ? 'ui_panel_l' : 'ui_panel_r';
    if (this.textures.exists(first)) {
      this._frame = this.add.image(x + w / 2, y + h / 2, first)
        .setDisplaySize(w, h).setDepth(20);
      this._ui.push(this._frame);
    } else {
      const g = this.add.graphics().setDepth(20);
      g.fillStyle(0x0d0a08, 0.93); g.fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(3, 0xf2b13c, 0.75); g.strokeRoundedRect(x, y, w, h, 10);
      this._ui.push(g);
    }

    // Measured off the artwork, then checked against a render: the name plate is
    // the raised badge at the top, and the name sits on the centre of its face.
    // The old left value, 0.192, sat the name 40px off its own plate.
    this._nameX = { l: x + w * 0.2489, r: x + w * 0.7727 };

    this._name = this.add.text(this._nameX.l, y + h * 0.18, '', {
      fontFamily: F_UI, fontSize: '19px', fontStyle: '700', color: '#f5c169',
      stroke: '#070605', strokeThickness: 4
    }).setOrigin(0.5, 0.5).setDepth(22);
    if (this._name.setLetterSpacing) this._name.setLetterSpacing(2);

    // The line sits on dark scratched metal, so it gets a soft drop shadow to
    // lift it off the plate — a stroke would thicken type this small.
    // Vertically centred in the band between the name plate (0.18) and the
    // advance arrow (0.86) rather than sitting up against the top edge.
    this._body = this.add.text(x + w / 2, y + h * 0.52, '', {
      fontFamily: F_TXT, fontSize: '23px', color: '#f3ecdf', align: 'center',
      wordWrap: { width: w * 0.8 }, lineSpacing: 7
    }).setOrigin(0.5, 0.5).setDepth(22);
    this._body.setShadow(0, 2, '#000000', 4, false, true);

    // The advance marker is drawn, not a font glyph: it has to match the gold
    // triangle the panel art already carries in its corner, and a '\u25bc' at
    // any font size is a different shape sitting in the middle of the bar. Both
    // panels were measured for it — the triangle is 32x16 at x0.862/y0.814 in
    // the 880px-wide left panel and 35x17 at x0.798/y0.782 in the right — so
    // this lands on top of it and reads as that triangle lifting.
    this._more = this.add.graphics().setDepth(23).setAlpha(0);
    this._drawMore('l');
    this.tweens.add({ targets: this._more, y: -4, yoyo: true, repeat: -1, duration: 620 });

    this._hint = this.add.text(W / 2, H - 8, 'SPACE / CLICK — NEXT', {
      fontFamily: F_UI, fontSize: '9px', fontStyle: '500', color: '#6b5a48'
    }).setOrigin(0.5, 1).setDepth(22);

    // Out of the conversation altogether. ESC has always done this, but only a
    // line of grey text along the bottom said so, which is not something
    // anyone reads while two brothers are talking at them. The pad's Start
    // reaches it too, because Start is ESC.
    //
    // Just above the panel's right corner rather than away in the top of the
    // screen: it belongs to the conversation, so it sits where the
    // conversation is and where the eye already is.
    this._skip = this.add.text(x + w, y - 10, 'SKIP  ▸', {
      fontFamily: F_UI, fontSize: '13px', fontStyle: '700', color: '#f5c169',
      backgroundColor: '#1a1410', padding: { x: 13, y: 7 }
      // Depth 30, above the two of them at 25 — at 24 it was drawing behind
      // Wolffel's shoulder, which is exactly where it now sits.
    }).setOrigin(1, 1).setDepth(30).setAlpha(0.9);
    this._skip.setInteractive({ useHandCursor: true })
      .on('pointerover', () => this._skip.setColor('#ffffff'))
      .on('pointerout',  () => this._skip.setColor('#f5c169'))
      .on('pointerdown', () => this._finish());

    // Not in _ui: everything in there is faded up when the conversation
    // starts, and the way out should be there before it does.
    this._ui.push(this._name, this._body, this._hint);
  }

  // Where the panel art's own corner triangle sits, per side: centre as a
  // fraction of the panel and size in the source art's pixels.
  static get MORE_TRI() {
    return { l: { xf: 0.862, yf: 0.814, w: 32, h: 16 },
             r: { xf: 0.798, yf: 0.782, w: 35, h: 17 } };
  }

  _drawMore(side) {
    const t = IntroDialogueScene.MORE_TRI[side] || IntroDialogueScene.MORE_TRI.l;
    const P = this._panel;
    const sc = P.w / 880;                       // panel art is 880px wide
    const cw = t.w * sc, ch = t.h * sc;
    const cx = P.x + P.w * t.xf, cy = P.y + P.h * t.yf;
    this._more.clear();
    this._more.fillStyle(0xffd98a, 1);
    this._more.fillTriangle(cx - cw / 2, cy - ch / 2,
                            cx + cw / 2, cy - ch / 2,
                            cx,          cy + ch / 2);
  }

  // Figures stand at the screen edges at full height and run off the bottom
  // of the frame, like stage flats — the body is never cropped through. They
  // sit in front of the bar so they overlap its ends.
  _portrait(id, x) {
    const openKey = 'portrait_' + id.toLowerCase();
    const closedKey = openKey + '_closed';
    let img = null;

    if (this.textures.exists(openKey)) {
      img = this.add.image(x, 232, openKey).setOrigin(0.5, 0).setDepth(25);
      img.setScale(560 / img.height);
      this._ui.push(img);
    } else {
      const g = this.add.graphics().setDepth(25);          // stand-in figure
      g.fillStyle(0x2a2118); g.fillCircle(x, 300, 62);
      g.fillStyle(0x3b3228); g.fillRoundedRect(x - 96, 370, 192, 350, 26);
      this._ui.push(g);
    }

    return { img, x, openKey, closedKey };
  }

  // Every 3–6s a portrait shuts its eyes for ~0.15s. The closed art is a
  // separate texture; until one is supplied the swap is skipped, but the clock
  // keeps running so dropping the file in is the only change needed.
  _scheduleBlink(id) {
    const p = this.portraits[id];
    if (!p) return;
    this.time.delayedCall(3000 + Math.random() * 3000, () => {
      if (!this.scene.isActive()) return;
      if (id === SLEEPER && !this._awake) { this._scheduleBlink(id); return; }   // still out
      if (p.img && this.textures.exists(p.closedKey)) {
        p.img.setTexture(p.closedKey);
        this.time.delayedCall(150, () => { if (p.img) p.img.setTexture(p.openKey); });
      }
      this._scheduleBlink(id);
    });
  }

  _show() {
    if (this._idx >= INTRO_LINES.length) return this._finish();
    const line = INTRO_LINES[this._idx];
    this._name.setText(line.who);

    // The plate goes on the SPEAKER'S side, so the bar points back at whoever
    // is talking rather than at the brother listening to them.
    const side = SPEAKER_SIDE[line.who] === 'left' ? 'l' : 'r';
    if (this._frame && this.textures.exists('ui_panel_' + side)) {
      this._frame.setTexture('ui_panel_' + side).setDisplaySize(this._panel.w, this._panel.h);
    }
    this._name.setX(this._nameX[side]);
    this._drawMore(side);        // the corner triangle moves with the panel art

    if (line.wake) this._awake = true;

    // The speaker is lit and steps forward; the listener darkens and drops
    // back. Darkening uses tint rather than alpha so the idle character stays
    // solid instead of turning into a ghost over the scene behind. A sleeper
    // sits lower still and stays dark until he is woken.
    Object.keys(this.portraits).forEach(k => {
      const p = this.portraits[k];
      if (!p.img) return;
      const asleep = k === SLEEPER && !this._awake;
      const on = !asleep && k === line.who;
      this.tweens.add({
        targets: p.img, y: asleep ? 272 : (on ? 232 : 244),
        duration: line.wake && k === SLEEPER ? 500 : 220, ease: 'Sine.easeOut'
      });
      p.img.setTint(asleep ? 0x4a443e : (on ? 0xffffff : 0x6e6660));
      if (line.wake && k === SLEEPER && this.textures.exists(p.openKey)) p.img.setTexture(p.openKey);
    });

    this._more.setAlpha(0);
    this._body.setText('');
    this._typing = true;
    let i = 0;
    if (this._typeEv) this._typeEv.remove();

    // A voiced line paces its typing to the recording so the last glyph lands
    // as the line is finished being spoken — text racing ahead of the voice and
    // then waiting is what makes dubbed dialogue feel wrong. The 0.88 leaves
    // the text complete slightly before the audio tail, which reads as the
    // speaker finishing rather than the text lagging.
    const spoken = playVoice(line.vox);
    const delay = spoken
      ? Math.max(12, Math.round((spoken * 1000 * 0.88) / Math.max(1, line.text.length)))
      : 26;

    this._typeEv = this.time.addEvent({
      delay: delay,
      repeat: line.text.length - 1,
      callback: () => {
        this._body.setText(line.text.slice(0, ++i));
        // The keyclick is the stand-in for a voice; with a real one it is just
        // noise over the top of it.
        if (!spoken && i % 3 === 0) Sfx.type();
        if (i >= line.text.length) { this._typing = false; this._more.setAlpha(0.8); }
      }
    });
  }

  _advance() {
    if (this._typing) {                       // first press completes the line
      if (this._typeEv) this._typeEv.remove();
      this._body.setText(INTRO_LINES[this._idx].text);
      this._typing = false;
      this._more.setAlpha(0.8);
      return;                                 // the voice keeps playing out
    }
    this._idx++;
    this._show();
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    if (this._typeEv) this._typeEv.remove();
    stopVoice();                 // ESC out of the scene should not keep talking
    stopMusic(900);
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('BunkerScene'));
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
    let groundY = cfg.groundY;
    let WW = cfg.worldW;
    // Painting the backdrop larger than the view is what makes a room reveal
    // itself as you walk instead of sitting there whole: the world grows with
    // the art, so the camera has further to travel. The extra height is taken
    // off the TOP, since the floor has to stay in frame and the ceiling is the
    // part nobody needs to see.
    const zoom = cfg.bgZoom || 1;

    // The stage's scale. `pxPerM` is measured off the painting — pick something
    // in it whose real size you know and count its pixels — and everything that
    // has a real-world size follows from it: the brothers, how far they jump,
    // how fast they walk, how tall a wall is. A stage that does not declare one
    // keeps the old hand-tuned charH.
    this.pxPerM = cfg.pxPerM || null;
    // Motion scales with them unless a stage pins it. The bunker pins it,
    // because its pacing was already right and nothing there is jumped over.
    this.playScale = cfg.playScale != null ? cfg.playScale
                   : (this.pxPerM ? this.pxPerM / PHYS_BASE_PX_PER_M : 1);
    // Gravity has to scale with the velocities or the arc changes shape rather
    // than just getting bigger.
    this.physics.world.gravity.y = GRAVITY * this.playScale;

    this.cameras.main.setBackgroundColor('#0a0807');

    // background art scaled to fill 720 height; world width follows the art
    if (this.textures.exists(cfg.bgKey)) {
      const img = this.add.image(0, 0, cfg.bgKey).setOrigin(0, 0).setDepth(-20);
      // Some paintings carry dead space along the bottom — the village road has
      // 121 near-black rows under the picture, 15.8% of its height. Pinning the
      // image's bottom edge to the screen put that band across the lower fifth
      // of the frame. `bgContentFrac` says where the picture actually stops, and
      // the scale is taken from THAT rather than the file's height, so the
      // content fills the view and the dead rows fall off below it.
      const cf = cfg.bgContentFrac || 1;
      const s = (H / (img.height * cf)) * zoom;
      img.setScale(s);
      img.y = H - img.height * s * cf;
      // Where the painting ended up, so anything that belongs to a painted
      // feature — the blast door's glow — can be placed as a fraction of the
      // art rather than as a pixel count that goes wrong the moment the zoom
      // changes.
      this.bgGeom = { x: 0, y: img.y, w: img.width * s, h: img.height * s };
      this.bgWidth = Math.round(img.width * s);
      if (cfg.worldW === 'auto') WW = this.bgWidth;
      if (this.bgWidth < WW) {
        this.add.image(this.bgWidth, img.y, cfg.bgKey)
          .setOrigin(0, 0).setDepth(-20).setScale(s).setFlipX(true);
      }
      // The floor line is given as a fraction of the art so it follows the
      // zoom instead of needing a new pixel value every time it changes.
      if (cfg.groundFrac != null) groundY = Math.round(img.y + img.height * s * cfg.groundFrac);
    } else {
      if (cfg.worldW === 'auto') WW = 2200;
      if (cfg.drawFallback) cfg.drawFallback.call(this, WW);
    }
    // With no art there is nothing to take the floor line off, and every stage
    // that leans on groundFrac was ending up with an undefined floor — which
    // makes a NaN slab, drops the player through the world and takes his
    // physics body with him. The fraction is of the view instead.
    if (groundY == null || !isFinite(groundY)) {
      groundY = Math.round(H * (cfg.groundFrac != null ? cfg.groundFrac : 0.83));
    }
    this.worldW = WW;
    this.cfg.worldW = WW;

    this.physics.world.setBounds(0, 0, WW, H);
    this.cameras.main.setBounds(0, 0, WW, H);

    this.groundY = groundY;

    // The floor is built in segments so a stage can open holes in it. With no
    // gaps declared that is one slab across the world, exactly as before.
    this.solidsW = [];
    const gaps = (cfg.gaps || []).map(g => ({
      x0: g.atFrac * WW, x1: (g.atFrac + g.wFrac) * WW
    })).sort((a, b) => a.x0 - b.x0);
    let cursor = 0;
    const slab = (x0, x1) => {
      if (x1 - x0 < 4) return;
      const f = this.add.rectangle((x0 + x1) / 2, groundY + 40, x1 - x0, 80, 0x000000, 0).setDepth(-1);
      this.physics.add.existing(f, true);
      this.solidsW.push(f);
    };
    gaps.forEach(g => { slab(cursor, g.x0); cursor = g.x1; });
    slab(cursor, WW);
    // A gap needs an edge you can see, or it is an invisible pit — unless the
    // stage has painted what is down there, in which case the hole should show
    // it rather than a black slab laid over the top of it.
    if (cfg.gapShade !== false) gaps.forEach(g => {
      [g.x0, g.x1].forEach((x, i) => {
        const e = this.add.rectangle(x, groundY + 30, 10, 64, 0x0b0907, 0.9).setDepth(2);
        e.setOrigin(i === 0 ? 1 : 0, 0.5);
      });
      const dark = this.add.rectangle((g.x0 + g.x1) / 2, groundY + 46, g.x1 - g.x0, 96, 0x050403, 0.92).setDepth(1);
      dark.setOrigin(0.5, 0);
    });


    // Ledges. The floor is one line across the world, which is all a street
    // needs; a stage that is climbed needs surfaces at several heights. Each
    // one is given as fractions of the BACKDROP — the painting is what says
    // where the stonework is, and fractions survive a change of zoom the way
    // a pixel count would not.
    //
    // They are one-way by default: only the top face collides, so a jump from
    // underneath passes through and lands on it instead of cracking his head
    // on the underside. `solid: true` makes a ledge block from every side.
    this.ledges = (cfg.ledges || []).map(L => {
      const bg = this.bgGeom;
      const x0 = bg ? bg.x + L.x0 * bg.w : L.x0 * WW;
      const x1 = bg ? bg.x + L.x1 * bg.w : L.x1 * WW;
      const top = bg ? bg.y + L.y * bg.h : L.y * H;
      const h = L.h || 420;                     // deep enough not to fall through
      const box = this.add.rectangle((x0 + x1) / 2, top + h / 2, x1 - x0, h,
                                     0x000000, 0).setDepth(-1);
      this.physics.add.existing(box, true);
      if (!L.solid) {
        const c = box.body.checkCollision;
        c.down = false; c.left = false; c.right = false;
      }
      this.solidsW.push(box);
      return box;
    });

    // Props. A wall is solid, so it is something to climb onto and cross;
    // 'fg'/'log' sit in front of everything at a touch more than world speed,
    // which is what makes them read as being close to the camera rather than
    // in the scene — the player draws at depth 10, so anything past that
    // depth covers him where the two overlap, which is the whole trick.
    this.propImages = [];
    (cfg.props || []).forEach((pr, prIdx) => {
      const x = pr.xFrac * WW;
      if (pr.kind === 'log' || pr.kind === 'fg') {
        // 'fg' takes any scene-loaded image by name (pr.tex, e.g. 'deadlog' for
        // the texture 'scene_deadlog') so a custom upload drops in the same way
        // the built-in log prop does — position with xFrac, size with scale,
        // nudge the footing with yOff. No collision: it is a painted layer, not
        // an obstacle.
        const texKey = pr.tex ? ('scene_' + pr.tex) : 'log_prop';
        const im = this.add.image(x, groundY + (pr.yOff || 26), texKey)
          .setOrigin(0.5, 1).setDepth(pr.depth != null ? pr.depth : 34)
          .setScale(pr.scale || 1.7);
        if (pr.flip) im.setFlipX(true);
        im.setScrollFactor(pr.scrollFactor != null ? pr.scrollFactor : 1.08, 1);
        this.propImages.push({ im, pr, idx: prIdx, groundY, WW });
        return;
      }
      // The painted wall if it is in the build, the drawn stand-in if not. The
      // art is sized by the height it should stand rather than by a raw scale
      // factor, since the source painting's own pixel size is not meaningful
      // here.
      const painted = this.textures.exists('scene_wallblue');
      // `m` is the wall's height in metres, which is the honest way to say it —
      // it then stands the same against the brothers whatever the stage's
      // scale. `h` in raw pixels still works for a stage without a scale.
      const wantH = pr.m != null && this.pxPerM ? Math.round(pr.m * this.pxPerM)
                                                : (pr.h || 130);
      let sc;
      let im;
      if (painted) {
        im = this.add.image(x, groundY + 6, 'scene_wallblue').setOrigin(0.5, 1).setDepth(3);
        sc = wantH / im.height;
        im.setScale(sc);
      } else {
        sc = wantH / 80;
        im = this.add.image(x, groundY + 4, 'wall_prop').setOrigin(0.5, 1).setDepth(3).setScale(sc);
      }
      this.propImages.push({ im, pr, idx: prIdx, groundY, WW });
      if (pr.solid !== false) {
        // A separate invisible box rather than a body on the image. Giving a
        // STATIC body an offset moves the body instead of insetting it, so the
        // collision ended up somewhere the wall was not and he fell straight
        // through. A rectangle placed by hand is the same thing the floor
        // slabs do, and it lands where it is put.
        //
        // Climbed onto and walked across, not cleared in one bound. The solid
        // follows the painted top edge slice by slice, so the surface they
        // stand on is the one you can see — see surfaceProfile for why a single
        // rectangle could not do this.
        const prof = painted ? surfaceProfile(this, 'scene_wallblue', 16) : null;
        const left = x - im.displayWidth / 2;
        if (prof) {
          // Following the painted top slice by slice put the surface where the
          // eye expects it, and made a mess to walk on.
          //
          // The wall's ends taper into rubble. Its first slice sits 65px below
          // the capstone — low enough to stand on — so he walks onto the toe
          // and then meets the deck's face. Arcade cannot step up, and it
          // separates a body from a static box along whichever axis overlaps
          // least, so instead of being stopped he gets squeezed upward: the
          // jitter. And a body wider than one slice rests on two tops at once
          // and is resolved against both every frame, which is why Wolffel
          // (42px across 1.34 slices) shook harder than Eterwolf (21px, 0.68).
          //
          // So the collision keeps only the slices near the crown — the deck —
          // and gives each run of them ONE flat surface at its median height.
          // The rubble toe stays painted and stops being standable, which is
          // how a wall reads anyway: you jump onto it, you do not walk up it.
          const live = prof.filter(Boolean);
          const crown = Math.min.apply(null, live.map(g => g.topFrac));
          // how far below the crown still counts as deck rather than rubble
          const DECK_BAND = 0.35;
          const onDeck = prof.map(g => !!g && g.topFrac <= crown + DECK_BAND);
          const put = (x0f, x1f, topF) => {
            const segX = left + x0f * im.displayWidth;
            const segW = (x1f - x0f) * im.displayWidth;
            const topY = (im.y - im.displayHeight) + topF * im.displayHeight;
            const bh = (groundY + 4) - topY;
            if (bh < 6 || segW < 2) return;      // nothing worth standing on
            const box = this.add.rectangle(segX + segW / 2, topY + bh / 2,
                                           segW, bh, 0x000000, 0).setDepth(-1);
            this.physics.add.existing(box, true);
            this.solidsW.push(box);
          };
          // one box per contiguous run of deck slices, flat across the run
          let i = 0;
          while (i < prof.length) {
            if (!onDeck[i]) { i++; continue; }
            let j = i;
            while (j + 1 < prof.length && onDeck[j + 1]) j++;
            const tops = prof.slice(i, j + 1).map(g => g.topFrac).sort((a, b) => a - b);
            put(prof[i].x0, prof[j].x1, tops[tops.length >> 1]);
            i = j + 1;
          }
        } else {
          // No readable art: one box, sized off the declared surface height.
          const bw = im.displayWidth * 0.94;
          const bh = wantH * (1 - (pr.topFrac != null ? pr.topFrac : 0.19));
          const box = this.add.rectangle(x, groundY + 4 - bh / 2, bw, bh, 0x000000, 0).setDepth(-1);
          this.physics.add.existing(box, true);
          this.solidsW.push(box);
        }
      }
    });

    // player — a scene transition can override the spawn point (e.g. re-enter at the hole)
    const data = this.sys.settings.data || {};
    const spawnFrac = data.spawnXFrac != null ? data.spawnXFrac : cfg.startXFrac;
    const startX = spawnFrac != null ? spawnFrac * WW : (cfg.startX || 160);
    // The cast scales with the room, or he would shrink as the art grows.
    // Derived from the stage's own scale where it has one, so the brothers are
    // the size the painting says a person is.
    const charH = this.pxPerM ? Math.round(HUMAN_M * this.pxPerM)
                              : (cfg.charH || 190) * zoom;
    this.castId = data.cast || GameState.castId || DEFAULT_CAST;
    GameState.castId = this.castId;
    this.player = makeWalker(this, startX, groundY, charH, this.castId);
    this._buildBeats(cfg);
    this.solidsW.forEach(f => this.physics.add.collider(this.player, f));
    this._safeX = startX;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(160, 100);

    // input
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,M,E,ENTER,R,K');
    this.input.keyboard.on('keydown-N', () => Sfx.toggleMute());
    if (cfg.canReset) this.input.keyboard.on('keydown-R', () => this.resetStage());
    if (cfg.castSwitch) this._buildCastSwitch();
    const wake = () => Sfx.ensure();
    this.input.on('pointerdown', wake);
    this.input.keyboard.on('keydown', wake);

    // Level editor: drag props and export config
    this._editorMode = false;
    this._draggedProp = null;
    this.input.keyboard.on('keydown-M', () => {
      this._editorMode = !this._editorMode;
      console.log(`Editor mode ${this._editorMode ? 'ON' : 'OFF'}`);
      this.propImages.forEach(p => {
        p.im.setAlpha(this._editorMode ? 1 : 1);
        p.im.setInteractive(this._editorMode ? { draggable: true, useHandCursor: true } : { enabled: false });
      });
    });
    this.propImages.forEach(p => {
      p.im.on('pointerdown', (ptr, localX, localY, evt) => {
        if (!this._editorMode) return;
        this._draggedProp = p;
        evt.stopPropagation();
      });
    });
    this.input.on('pointermove', (ptr) => {
      if (!this._draggedProp) return;
      const p = this._draggedProp;
      p.im.x = Phaser.Math.Clamp(ptr.worldX, 0, p.WW);
      p.pr.xFrac = p.im.x / p.WW;
    });
    this.input.on('pointerup', () => {
      if (!this._draggedProp) return;
      const p = this._draggedProp;
      console.log(`Moved prop ${p.idx} to xFrac: ${p.pr.xFrac.toFixed(3)}`);
      this._draggedProp = null;
    });
    this.input.keyboard.on('keydown-O', () => {
      if (!this._editorMode) return;
      const cfg = this.cfg;
      const exported = {
        ...cfg,
        props: this.propImages.map(p => ({ ...p.pr, xFrac: p.pr.xFrac }))
      };
      console.log('/* Exported props config: */');
      console.log(JSON.stringify(exported.props, null, 2));
      console.log('/* Paste into scene config as: props: [ ... ] */');
    });

    // ESC returns to menu
    this.input.keyboard.on('keydown-ESC', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
    });

    // exit zones (xFrac → world x)
    // Markers float above the player's head, so the clearance has to come from
    // how tall he actually is. A flat 250px was fine when he was 200px and put
    // the label across his chest the moment he grew to 300.
    this.markerY = groundY - charH - 46;
    this.exits = (cfg.exits || []).map(ex => ({ ...ex, x: ex.xFrac != null ? ex.xFrac * WW : ex.x }));
    this.exitMarkers = this.exits.map(ex => {
      // `glow` lights the doorway itself instead of hanging a marker over it —
      // the door is the thing you walk into, so it is the thing that should
      // read as live. `silent` is for an exit that is just the edge of the
      // stage: nothing is drawn and you simply walk off it.
      //
      // The glow is the size and shape of the painted door, which is why it is
      // given as `glowFrac` — the door's box as fractions of the backdrop,
      // read off the picture with a ruler. Fractions rather than pixels
      // because the backdrop is scaled to the view and to the stage's zoom, so
      // any pixel count written here would be wrong the next time either
      // changed. `glowW`/`glowH`/`glowY` in world pixels remain for a stage
      // with no backdrop to measure against.
      let glow = null;
      if (ex.glow) {
        let gx = ex.x, gy, gw, gh;
        const f = ex.glowFrac, bg = this.bgGeom;
        if (f && bg) {
          gw = (f.x1 - f.x0) * bg.w;
          gh = (f.y1 - f.y0) * bg.h;
          gx = bg.x + (f.x0 + f.x1) / 2 * bg.w;
          gy = bg.y + (f.y0 + f.y1) / 2 * bg.h;
        } else {
          gw = ex.glowW || 150; gh = ex.glowH || 260;
          gy = groundY - (ex.glowY != null ? ex.glowY : gh / 2);
        }
        glow = this.add.image(gx, gy, 'doorglow')
          .setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
          .setDisplaySize(gw, gh);
      }
      if (ex.silent) return { m: null, lbl: null, glow, ex };
      // A glowing door does not also need a caret bobbing over it; noArrow keeps
      // the label and drops the marker.
      const m = ex.noArrow ? null : this.add.text(ex.x, this.markerY, ex.arrow || '▲', {
        fontFamily: 'Courier New, monospace', fontSize: '34px', color: '#f2b13c',
        stroke: '#0d0a08', strokeThickness: 5
      }).setOrigin(0.5).setDepth(30).setAlpha(0);
      const lbl = this.add.text(ex.x, this.markerY + 34, ex.label, {
        fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
        stroke: '#0d0a08', strokeThickness: 4
      }).setOrigin(0.5).setDepth(30).setAlpha(0);
      return { m, lbl, glow, ex };
    });

    // Phaser reuses a scene instance, so these survive a restart and leave
    // `this.pickup` pointing at a destroyed sprite — which reads as truthy and
    // makes the room look like it still has a weapon in it.
    this.pickup = null;
    this.pickupGlow = null;
    this.pickupHint = null;
    this.pickGot = false;

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

    // title + controls hint — same face as the menu shell so the hand-off
    // from the intro into play does not change typeface mid-scene
    this.add.text(640, 34, cfg.title, {
      fontFamily: F_UI, fontSize: '15px', fontStyle: '700', color: '#d9c7a8',
      stroke: '#070605', strokeThickness: 4
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(40);
    this.add.text(640, 692, 'A/D WALK   ·   SHIFT RUN   ·   W JUMP   ·   E ENTER   ·   N MUTE   ·   M EDIT',
      { fontFamily: F_UI, fontSize: '10px', fontStyle: '500', color: '#8a6f4a' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(40).setAlpha(0.85);

    // film grain
    if (this.textures.exists('grain_0')) {
      this.grain = this.add.tileSprite(640, 360, 1280, 720, 'grain_0')
        .setScrollFactor(0).setDepth(48).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD);
      this._gf = 0;
    }
    this._transitioning = false;
  }

  // Put the stage back the way it started, keeping whoever you are playing.
  resetStage() {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.restart({ cast: this.castId }));
  }

  // Two buttons to swap brother, so the same stage can be walked as either
  // without going back through the menu. Switching restarts the stage: the
  // character is chosen when the sprite is built.
  _buildCastSwitch() {
    if (CAST.length < 2) return;
    // Up under the title rather than along the bottom. A stage whose floor sits
    // low in the frame — the village road puts it at y646 — had these buttons
    // landing on the character's own feet.
    let x = 22;
    this.add.text(x, 63, 'PLAY', {
      fontFamily: F_UI, fontSize: '11px', fontStyle: '700', color: '#7d6c55'
    }).setScrollFactor(0).setDepth(45);
    x += 40;
    this._castBtns = [];
    CAST.forEach(c => {
      const t = this.add.text(x + 10, 59, c.name, {
        fontFamily: F_UI, fontSize: '13px', fontStyle: '700'
      }).setScrollFactor(0).setDepth(46);
      const box = this.add.rectangle(x, 56, t.width + 20, 22, 0x1b1611, 0.95)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(45)
        .setStrokeStyle(1, 0x4a3b2a).setInteractive({ useHandCursor: true });
      box.on('pointerover', () => { if (c.id !== this.castId) t.setColor('#f2b13c'); });
      box.on('pointerout', () => this._paintCast());
      box.on('pointerdown', () => {
        if (c.id === this.castId) return;
        Sfx.ensure(); Sfx.select();
        GameState.castId = c.id;
        this.cameras.main.fadeOut(180, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ cast: c.id }));
      });
      this._castBtns.push({ c, t, box });
      x += t.width + 26;
    });
    this._paintCast();
    this.add.text(x + 14, 59, 'R  RESTART STAGE', {
      fontFamily: F_UI, fontSize: '11px', fontStyle: '600', color: '#7d6c55'
    }).setScrollFactor(0).setDepth(45);
  }

  _paintCast() {
    (this._castBtns || []).forEach(({ c, t, box }) => {
      const on = c.id === this.castId;
      t.setColor(on ? '#0a0807' : '#cbbba1');
      box.setFillStyle(on ? 0xf2b13c : 0x1b1611, on ? 1 : 0.95);
      box.setStrokeStyle(1, on ? 0xf2b13c : 0x4a3b2a);
    });
  }

  // Missing a jump drops him back on the near side of whatever he fell into,
  // rather than ending anything — this is a tutorial, not a punishment.
  _catchFall() {
    if (this._transitioning || this.player.y < 820) return;
    this.player.setVelocity(0, 0);
    this.player.setPosition(this._safeX, this.groundY - 120);
    this.cameras.main.flash(160, 0, 0, 0);
    // He lands badly and picks himself up. The clip is the one that used to
    // stand in for a crouch — it was always a man going down, not ducking.
    const hero = this.player._hero;
    if (heroHas(hero, 'falldown')) {
      const key = heroAnim(hero, 'falldown', this.player._facing);
      const a = this.anims.get(key);
      this.player._downUntil = this.time.now + (a ? a.duration : 450) + 180;
      this.player.play(key);
      this.player._curAnim = key;
      this.player._curAction = 'falldown';
    }
  }

  // ---- scripted beats ----------------------------------------------------
  // A beat fires once, when the player first reaches its point in the scene
  // (as a fraction of world width; 0 means on arrival). It can post spoken
  // lines, which queue and auto-advance, and a tutorial prompt.
  _buildBeats(cfg) {
    this._beats = (cfg.beats || []).map(b => Object.assign({ fired: false }, b));
    this._sayQueue = [];
    this._sayUntil = 0;

    // Speech floats over the speaker's head rather than sitting in a bar along
    // the bottom of the screen. Only one of the brothers is ever on stage out
    // here, so the line belongs to him and should read as coming from him — a
    // caption pinned to the viewport does not. These follow the player in
    // world space (no scrollFactor 0), and _runBeats keeps them over his head.
    this._sayName = this.add.text(0, 0, '', {
      fontFamily: F_UI, fontSize: '11px', fontStyle: '700', color: '#f5c169',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(41).setAlpha(0);

    this._sayText = this.add.text(0, 0, '', {
      fontFamily: F_TXT, fontSize: '19px', color: '#efe6d6', align: 'center',
      wordWrap: { width: 420 }, lineSpacing: 5
    }).setOrigin(0.5, 1).setDepth(41).setAlpha(0);
    this._sayText.setShadow(0, 2, '#000000', 5, false, true);

    this._tip = this.add.text(640, 96, '', {
      fontFamily: F_UI, fontSize: '13px', fontStyle: '700', color: '#0f0c09',
      backgroundColor: '#f2b13c', padding: { x: 14, y: 7 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(41).setAlpha(0);

    // A way past the talking. The lines hold long enough to read at a first
    // pass, which is exactly the wrong length once you have heard them — so
    // there is a button, and it only exists while someone is speaking.
    //
    // It sits in the corner rather than next to the speech: the speech moves
    // with whoever said it, and a button that follows a walking man around is
    // a thing to chase rather than a thing to press.
    this._skip = this.add.text(1264, 690, 'SKIP  ▸', {
      fontFamily: F_UI, fontSize: '12px', fontStyle: '700', color: '#f5c169',
      backgroundColor: '#1a1410', padding: { x: 12, y: 7 }
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(41).setAlpha(0);
    this._skip.setInteractive({ useHandCursor: true })
      .on('pointerover', () => this._skip.setColor('#ffffff'))
      .on('pointerout',  () => this._skip.setColor('#f5c169'))
      .on('pointerdown', () => this._skipSay());
    // And on the keyboard, where ENTER is already the "get on with it" key in
    // the menus and the opening cutscene. It is not bound to anything in a
    // stage, so it cannot make him jump or swing while skipping a line.
    this.input.keyboard.on('keydown-ENTER', () => this._skipSay());
  }

  _say(lines) { this._sayQueue.push.apply(this._sayQueue, lines); }

  // Drop the rest of what is being said and clear the bubble. Everything the
  // lines were going to do has already happened — they are commentary on the
  // stage, never a gate in front of it — so there is nothing to fast-forward
  // through, only something to stop showing.
  _skipSay() {
    if (!this._sayQueue) return;
    if (!this._sayQueue.length && !(this._sayText && this._sayText.alpha > 0)) return;
    this._sayQueue.length = 0;
    this._sayUntil = 0;
    this.tweens.add({ targets: [this._sayName, this._sayText], alpha: 0, duration: 160 });
  }

  _showTip(text) {
    if (!this._tip) return;
    this._tip.setText(text).setAlpha(0);
    this.tweens.killTweensOf(this._tip);
    this.tweens.add({ targets: this._tip, alpha: 1, duration: 220 });
    this.tweens.add({ targets: this._tip, alpha: 0, duration: 400, delay: 5200 });
  }

  _runBeats() {
    if (!this._beats) return;
    const frac = this.worldW ? this.player.x / this.worldW : 0;
    for (const b of this._beats) {
      if (b.fired || frac < (b.at || 0)) continue;
      // A beat can name something that has to still be true when the player
      // gets there. The weapon prompt is the reason: the pickup only exists
      // while he has no weapon, so once he has one the beat would otherwise
      // tell him to collect something that is not in the room.
      if (b.needs === 'pickup' && !this.pickup) { b.fired = true; continue; }
      b.fired = true;
      if (b.say) this._say(b.say);
      if (b.tip) this._showTip(b.tip);
    }

    // spoken lines hold for long enough to read, then hand over to the next
    const now = this.time.now;
    if (now >= this._sayUntil) {
      if (this._sayQueue.length) {
        const [who, text] = this._sayQueue.shift();
        // 'PLAYER' is whichever brother was chosen, so a line that either of
        // them would say does not have to be written twice.
        const speaker = who === 'PLAYER'
          ? ((castById(this.castId) || {}).name || 'ETERWOLF')
          : who;
        // Kill the fade first. A line that lands while the previous one is
        // still fading out would otherwise be set to full alpha and then
        // driven straight back to nothing by that tween still running — the
        // line is there, correct and on the right spot over his head, and
        // completely invisible.
        this.tweens.killTweensOf(this._sayName);
        this.tweens.killTweensOf(this._sayText);
        this._sayName.setText(speaker).setAlpha(1);
        this._sayText.setText(text).setAlpha(1);
        this._sayUntil = now + 1600 + text.length * 45;
      } else if (this._sayText.alpha > 0) {
        this.tweens.add({ targets: [this._sayName, this._sayText], alpha: 0, duration: 300 });
      }
    }

    // The skip button is only there while there is something to skip.
    if (this._skip) {
      const talking = this._sayQueue.length > 0 || this._sayText.alpha > 0.05;
      if (talking !== this._skipShown) {
        this._skipShown = talking;
        this.tweens.killTweensOf(this._skip);
        this.tweens.add({ targets: this._skip, alpha: talking ? 0.85 : 0,
                          duration: talking ? 200 : 160 });
      }
    }

    // Keep the line over his head. Clamped to the camera so a line spoken near
    // either end of the room does not run off the side of the screen.
    if (this._sayText.alpha > 0 || this._sayName.alpha > 0) {
      const cam = this.cameras.main;
      const head = this.player.y - this.player.displayHeight * 0.52;
      const half = Math.max(this._sayText.width, this._sayName.width) / 2 + 12;
      const x = Phaser.Math.Clamp(this.player.x,
                                  cam.scrollX + half, cam.scrollX + cam.width - half);
      this._sayText.setPosition(x, head);
      this._sayName.setPosition(x, head - this._sayText.height - 4);
    }
  }

  update() {
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    // the last place he stood, to put him back if he misses a jump
    if (onGround && Math.abs(this.player.body.velocity.x) < 40) this._safeX = this.player.x;
    this._catchFall();
    // A stage can take the controls for a scripted beat — the bridge does it
    // while the span comes down, so the earthquake happens TO him rather than
    // being something he can walk through and out the other side of.
    if (this._holdInput) this.player.setVelocityX(0);
    else if (!this._transitioning) driveWalker(this, this.player, this.keys, onGround);
    this._runBeats();

    if (this.grain && this.game.loop.frame % 3 === 0) {
      this._gf = (this._gf + 1) % 3;
      this.grain.setTexture('grain_' + this._gf);
      this.grain.tilePositionX = Math.random() * 256;
    }

    // Weapon pickup on contact — and contact means contact. Testing the
    // horizontal gap alone collected it from a ledge overhead or mid-jump, so
    // it wanted walking into rather than merely passing above.
    if (this.pickup && !this.pickGot &&
        Math.abs(this.player.x - this.pickup.x) < 46 &&
        Math.abs(this.player.y - this.pickup.y) < 84) {
      this.pickGot = true;
      GameState.hasWeapon = true;
      this.tweens.killTweensOf(this.pickup);
      this.tweens.killTweensOf(this.pickupGlow);
      this.pickup.destroy(); this.pickupGlow.destroy(); this.pickupHint.destroy();
      this.pickup = null; this.pickupGlow = null; this.pickupHint = null;
      this.acquireWeapon(this.cfg.pickup.name);
    }

    // exit prompts + trigger
    // K as well, so the pad's X — the button that does things in combat —
    // also opens a door out here.
    const enterPressed = Phaser.Input.Keyboard.JustDown(this.keys.E)
                      || Phaser.Input.Keyboard.JustDown(this.keys.K)
                      || Phaser.Input.Keyboard.JustDown(this.keys.UP)
                      || Phaser.Input.Keyboard.JustDown(this.keys.W);
    this.exitMarkers.forEach(({ m, lbl, glow, ex }) => {
      // a combat exit that needs the weapon stays locked until it's picked up
      const locked = ex.needWeapon && !GameState.hasWeapon;
      // hideLocked exits don't exist at all until unlocked (no marker, no message)
      if (locked && ex.hideLocked) {
        if (m) m.setAlpha(0);
        if (lbl) lbl.setAlpha(0);
        if (glow) glow.setAlpha(0);
        return;
      }
      const near = Math.abs(this.player.x - ex.x) < (ex.w || 90);
      const a = near ? 1 : 0;
      if (m) m.setAlpha(a);
      if (lbl) lbl.setAlpha(a);
      // The doorway breathes the whole time so it reads as the way on even
      // from across the room, and brightens as he reaches it.
      if (glow) {
        const pulse = 0.5 + Math.sin(this.time.now * 0.0035) * 0.16;
        glow.setAlpha(near ? pulse + 0.30 : pulse * 0.62);
      }
      if (near) {
        if (m) m.y = this.markerY + Math.sin(this.time.now * 0.006) * 6;
        if (lbl) {
          lbl.setText(locked ? 'GRAB THE WEAPON FIRST' : ex.label);
          lbl.setColor(locked ? '#c93b2a' : '#d9c7a8');
        }
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
    // Stop the stride too, or he pedals on the spot for the whole fade.
    if (this.player._real) {
      playAction(this.player, this.player._hero, 'idle', this.player._facing);
      this.player._curAnim = heroAnim(this.player._hero, 'idle', this.player._facing);
    }
    Sfx.ensure(); Sfx.dash();
    this.cameras.main.fadeOut(ex.fadeMs || 450, 0, 0, 0);
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
    stopMusic(200);
    this.cameras.main.fadeIn(450, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_bunker',
      // The scale this painting is drawn at. The bunks measure ~205px between
      // mattresses with the art shown at zoom 1.35, which made it 210 px/m
      // then; at zoom 1 the room is 74% of that and so is its metre — 156. A
      // brother at 280px stands against these bunks the way a man stands
      // against a bunk, which he did not at 225.
      //
      // 1.24x magnification, so he is a little soft here. Drawing the room
      // smaller instead is not on offer: zoom 1 is the floor, and below it the
      // painting stops covering the view and leaves a black band above the
      // pipes.
      //
      // playScale 1 keeps the pacing this stage always had; nothing in here is
      // jumped over, so the walk does not have to scale with him.
      worldW: 'auto', groundFrac: 0.872, startXFrac: 0.06, bgZoom: 1.0,
      pxPerM: 156, playScale: 1,
      title: 'THE BUNKER — quarantine shelter',
      castSwitch: true, canReset: true, noLongIdle: true,
      beats: [
        { at: 0,    tip: 'HOLD  A  TO GO LEFT,  D  TO GO RIGHT' },
        { at: 0.22, tip: 'HOLD  SHIFT  WHILE WALKING TO RUN' },
        { at: 0.72, say: [['ETERWOLF', 'Look, Feli, a door.']],
                    tip: 'PRESS  E  AT THE DOOR' }
      ],
      exits: [
        // The blast door's box, measured off bunker_wide.png: the slab runs
        // x 0.838-0.952 and y 0.264-0.775 of the painting. The whole door
        // lights up rather than a puddle of light pooling at its foot.
        { xFrac: 0.90, w: 180, label: 'EXIT THE BUNKER', target: 'ExitScene',
          glow: true, noArrow: true,
          glowFrac: { x0: 0.838, x1: 0.952, y0: 0.264, y1: 0.775 } }
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
// ================================================================== //
//  TUTORIAL 1 — OUTSIDE THE BUNKER (learn to walk)                   //
//  The first thing past the blast door. Nothing to fight and nothing //
//  to fall into: the whole stage is there to teach the two keys that //
//  move him, and it reveals itself as he walks, like the bunker.     //
// ================================================================== //
class ExitScene extends WalkScene {
  constructor() { super('ExitScene'); }
  create() {
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_exit',
      // The painting's bottom 15.8% is dead black, so the scale is taken from
      // the picture instead of the file and zoom drops to 1 — the content then
      // fills the frame exactly and the brothers walk low in it, the way a road
      // is usually framed.
      // 167 px/m is this painting's true scale, measured off the blast doorway
      // they walk out of: 345px from road to lintel, a 2.07m door. Drawn any
      // smaller they are children standing in their own street, so 167, and
      // the third of magnification that comes with it.
      worldW: 'auto', groundFrac: 0.755, bgContentFrac: 0.8411,
      startXFrac: 0.135, bgZoom: 1.0, pxPerM: 167,
      title: 'OUTSIDE — the village road',
      castSwitch: true, canReset: true, noLongIdle: true,
      // Foreground dressing, placed close to the bunker door where the scene
      // is darkest and nobody actually walks. 'fg' draws above the player
      // (depth 34 against his 10) and scrolls a touch faster than the world
      // (scrollFactor 1.08), which is what sells "closer to the camera" — the
      // two together are why he passes behind it instead of in front. xFrac
      // moves it, scale sizes it, yOff settles it into the ground; tune freely.
      // ------------------------------------------------------------------
      //  FOREGROUND DRESSING — add your own here
      //
      //    { kind: 'fg', tex: '<name>', xFrac: 0..1, scale: n, yOff: n }
      //
      //  tex     which picture, by the name it is registered under (see the
      //          foreground list in tools/build_html.js). Right now:
      //          'deadplant', 'deadlog'
      //  xFrac   where along the stage, 0 = far left, 1 = far right
      //  scale   size. 1 is the picture's own size, 0.5 is half
      //  yOff    push it down into the ground, in pixels. Bigger = lower
      //  flip    true to mirror it left-to-right (optional)
      //
      //  These draw IN FRONT of the brothers, so they walk behind them. Drop a
      //  new PNG into public/assets, add one line to the foreground list in
      //  tools/build_html.js, and it can be used here straight away.
      // ------------------------------------------------------------------
      props: [
        // (nothing here yet — the dead plant that used to sit at 0.10 was
        //  hanging off the ground and in the way of the door, so it is gone)
      ],
      beats: [
        // 'PLAYER' so the line belongs to whichever brother was chosen.
        { at: 0,    say: [['PLAYER', '¡Hijole! What happened out here?']],
                    tip: 'HOLD  A  OR  D  TO WALK' },
        { at: 0.30, tip: 'HOLD  SHIFT  WHILE WALKING TO RUN — it is much faster' },
        { at: 0.70, say: [['PLAYER', 'Road keeps going. Come on.']],
                    tip: 'KEEP GOING RIGHT' }
      ],
      exits: [
        // The end of the stage is just the end of the road: no caret, no label,
        // walk into it and it fades on.
        { xFrac: 0.985, w: 90, target: 'JumpScene', auto: true,
          silent: true, fadeMs: 320 }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x241814, 1); g.fillRect(0, 0, WW, 420);
        g.fillStyle(0x7a3a1c, 1); g.fillRect(0, 300, WW, 130);
        g.fillStyle(0x2c2018, 1); g.fillRect(0, 430, WW, 160);
        for (let x = 120; x < WW; x += 420) {
          g.fillStyle(0x181310, 1); g.fillRect(x, 300, 190, 240);
          g.fillStyle(0xf2b13c, 0.5); g.fillRect(x + 40, 380, 34, 40);
        }
        g.fillStyle(0x15100c, 1); g.fillRect(0, 576, WW, 144);
      }
    });
  }
}

// ================================================================== //
//  TUTORIAL 2 — THE BURNT STREET (learn to jump)                     //
//  Rubble to climb and two holes in the road. Missing a jump puts    //
//  him back on the near side rather than killing him.                //
// ================================================================== //
class JumpScene extends WalkScene {
  constructor() { super('JumpScene'); }
  create() {
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_jump',
      // The same scale as the village road, because the brothers walk straight
      // from one into the other and any change in their size pops on the cut.
      //
      // The wall below is given in metres and the jump scales with px/m too,
      // so the whole stage moves together with this number and plays the same
      // at any of them.
      //
      // He starts clear of the growth at the left end. At 0.04 he spawned
      // inside the dead plant, which draws in front of him — so the stage
      // opened on a man you could not see.
      worldW: 'auto', groundFrac: 0.755, startXFrac: 0.14, bgZoom: 1.2,
      pxPerM: 167,
      title: 'THE BURNT STREET',
      castSwitch: true, canReset: true, noLongIdle: true,
      // No holes: this stage teaches one thing. A single broken wall sits near
      // the middle of the road — tall enough that he cannot just walk through
      // it, low enough that a jump lands him cleanly on top. He climbs on,
      // crosses it, and jumps down the far side, rather than needing to clear
      // it in one bound the way the old rubble heaps did.
      props: [
        // 0.72m — about thigh height on a 1.8m man. Came down from 1.17m and
        // then 0.9m, both of which still dominated the street.
        { xFrac: 0.5, kind: 'wall', m: 0.72, topFrac: 0.19 },

        // ---- FOREGROUND DRESSING -------------------------------------------
        // Dead growth at both ends of the street, close enough to the camera
        // that the brothers pass BEHIND it — depth 34 against the player's 10,
        // and 8% faster than the world, which is what sells the distance.
        //
        // yOff 212 stands them on the bottom edge of the frame rather than on
        // the road: the floor line is at 508 and the view ends at 720, and a
        // thing in front of the camera should run off the bottom of the shot.
        //
        // Placed for where you are standing when you see them, not for where
        // they sit on the painting. Phaser draws a prop at x - scrollX*factor,
        // so at 1.08 the camera drags it an extra 8% of however far it has
        // travelled: by the far end of this street that is 82px of leftward
        // drift, and the log has to be written further RIGHT than the picture
        // puts it to land at the edge of the frame when you arrive. The plant
        // needs no such correction — you see it with the camera still at zero.
        //
        // The plant twice, the second one mirrored and smaller at the very
        // edge, so it reads as a clump rather than one repeated cutout.
        { kind: 'fg', tex: 'deadplant', xFrac: 0.045, scale: 1.55, yOff: 212 },
        { kind: 'fg', tex: 'deadplant', xFrac: 0.012, scale: 1.25, yOff: 212,
          flip: true },
        // Mirrored: the asset's splintered end points up-left, and the
        // reference has it pointing up-right, out of the corner of the frame.
        { kind: 'fg', tex: 'deadlog',   xFrac: 0.985, scale: 1.31, yOff: 212,
          flip: true }
        // Add your own the same way:
        //   { kind: 'fg', tex: '<name>', xFrac: 0..1, scale: n, yOff: n, flip: true }
        // The name is whatever you listed in tools/build_html.js; xFrac moves
        // it, scale sizes it, yOff settles it, flip mirrors it.
      ],
      beats: [
        { at: 0,    say: [['ETERWOLF', 'Road is buried. We go over it.']],
                    tip: 'PRESS  W  OR  SPACE  TO JUMP' },
        { at: 0.35, tip: 'JUMP ONTO THE WALL, WALK ACROSS, JUMP DOWN THE OTHER SIDE' },
        { at: 0.65, say: [['ETERWOLF', 'Good. That is as far as it goes.']],
                    tip: 'THAT IS EVERYTHING BUILT SO FAR' }
      ],
      exits: [
        { xFrac: 0.99, w: 90, target: 'BridgeScene', auto: true,
          silent: true, fadeMs: 320 }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x1a0f0b, 1); g.fillRect(0, 0, WW, 560);
        g.fillStyle(0x8a2c10, 0.75); g.fillRect(0, 250, WW, 190);
        for (let x = 60; x < WW; x += 330) {
          g.fillStyle(0x141010, 1); g.fillRect(x, 190, 230, 330);
          g.fillStyle(0xd85a1c, 0.55); g.fillRect(x + 30, 260, 40, 52);
          g.fillStyle(0xd85a1c, 0.35); g.fillRect(x + 140, 320, 40, 52);
        }
        g.fillStyle(0x120d0a, 1); g.fillRect(0, 560, WW, 160);
      }
    });
  }
}
// Where the painted bridge actually is inside its picture.
//
// The two pictures are drawn on one canvas: the ends art carries the roadway
// on each side with an empty band between them, and the span art carries the
// middle section that fills that band. Rather than transcribe their
// coordinates into constants that quietly rot the next time the art is
// redrawn, this reads them back off the texture — the lip of each roadway, the
// row the road surface sits on, and how far the stonework hangs below it.
//
// The textures ship as data URIs, so they are same-origin and readable. One
// scan per texture, cached by key.
const _bridgeArt = {};
function bridgeArt(scene, key) {
  if (_bridgeArt[key] !== undefined) return _bridgeArt[key];
  let out = null;
  try {
    const src = scene.textures.get(key).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    const d = cx.getImageData(0, 0, src.width, src.height).data;
    const tops = new Array(src.width).fill(-1);
    let bottom = -1;
    for (let x = 0; x < src.width; x++) {
      for (let y = 0; y < src.height; y++)
        if (d[(y * src.width + x) * 4 + 3] > 60) { tops[x] = y; break; }
      for (let y = src.height - 1; y >= 0; y--)
        if (d[(y * src.width + x) * 4 + 3] > 60) { if (y > bottom) bottom = y; break; }
    }
    // The empty band across the middle, if there is one.
    let g0 = -1, g1 = -1;
    for (let x = 0; x < src.width; x++) if (tops[x] < 0) { if (g0 < 0) g0 = x; g1 = x; }
    // Where the paint actually starts and stops. A picture is not its canvas —
    // the span carries transparent margin on every side, and scaling by the
    // canvas would leave the painted slab short of the roadway it is meant to
    // reach by however much margin the exporter happened to leave.
    let px0 = src.width, px1 = -1, py0 = src.height;
    for (let x = 0; x < src.width; x++) if (tops[x] >= 0) {
      if (x < px0) px0 = x; if (x > px1) px1 = x;
      if (tops[x] < py0) py0 = tops[x];
    }
    // The road surface: the median painted top over a strip of real roadway.
    // The median, not the highest — a lamp post or a parapet should not be
    // mistaken for the deck.
    const med = a => { if (!a.length) return 0; a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const strip = (x0, x1) => {
      const col = [];
      for (let x = Math.max(0, x0); x < Math.min(src.width, x1); x++)
        if (tops[x] >= 0) col.push(tops[x]);
      return med(col);
    };
    const deck = g0 > 0
      ? Math.round((strip(g0 - 220, g0) + strip(g1 + 1, g1 + 221)) / 2)  // both lips
      : strip(Math.round(src.width * 0.35), Math.round(src.width * 0.65));
    out = { w: src.width, h: src.height, g0, g1, deck, bottom,
            px0, px1, py0, pw: px1 - px0 + 1, ph: bottom - py0 + 1 };
  } catch (e) { out = null; }   // tainted or missing: the caller falls back
  _bridgeArt[key] = out;
  return out;
}
// ================================================================== //
//  TUTORIAL 3 — THE BRIDGE (learn the double jump)                   //
//                                                                    //
//  The painting is the bridge. Both roadways, their railings, the     //
//  arches and the ivy are all in it, and the stage reads where they   //
//  are rather than drawing a second bridge over the top — which is    //
//  what it used to do, and why there were two of them at two heights. //
//                                                                    //
//  The only thing added is the span across the gap, laid ON the two   //
//  roadways rather than let into them, which is how it is drawn in    //
//  the reference. It shakes, breaks in two, and goes.                 //
// ================================================================== //
class BridgeScene extends WalkScene {
  constructor() { super('BridgeScene'); }

  create() {
    this.cameras.main.fadeIn(600, 0, 0, 0);
    const H = 720;

    // Measured off bridge_bg: the roadway runs to x 0.321, picks up again at
    // 0.646, and its surface sits on y 0.522 of the picture.
    const GAP0 = 0.321, GAP1 = 0.646, DECK = 0.522;

    // The gap is the painting's and cannot be moved, so the brothers are
    // sized to IT rather than the other way round: a ravine wants to be 2.4 of
    // a man's heights — past one jump, inside two — and 0.325 of this picture
    // works out at 144 px/m. That puts him at 259px, which is also why he is
    // so much bigger here than he was.
    const PX_PER_M = 144;

    this.buildWalk({
      bgKey: 'scene_bridgebg',
      worldW: 'auto', bgZoom: 1.0, startXFrac: 0.02,
      groundFrac: DECK,
      pxPerM: PX_PER_M,
      title: 'THE BRIDGE',
      castSwitch: true, canReset: true, noLongIdle: true,
      // The whole point of the stage, and the reason the sprint is off: a
      // sprinting single jump outreaches a walking double, so with it there is
      // no ravine width that needs two jumps and not one.
      doubleJump: true, noSprint: true,
      gaps: [{ atFrac: GAP0, wFrac: GAP1 - GAP0 }],
      // The painting has already drawn what is down there — a black slab over
      // the top of it would hide the one thing worth seeing.
      gapShade: false,
      beats: [
        { at: 0, say: [['PLAYER', 'Bridge is still standing. Come on.']],
                 tip: 'CROSS THE BRIDGE' }
      ],
      exits: [
        { xFrac: 0.985, w: 90, target: 'DashScene', auto: true,
          silent: true, fadeMs: 320 }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x1b1410, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x7a2c10, 0.6); g.fillRect(0, 260, WW, 200);
      }
    });

    this._gapL = Math.round(GAP0 * this.worldW);
    this._gapR = Math.round(GAP1 * this.worldW);
    this._armSpan();
  }

  // The span: the whole picture, scaled evenly, laid across the gap and
  // sitting ON the two roadways — its slab proud of the deck by its own
  // thickness, the way a plank laid over a hole sits on the ground either
  // side rather than flush with it.
  _armSpan() {
    if (!this.textures.exists('scene_bridgespan')) return;
    const art = bridgeArt(this, 'scene_bridgespan');
    if (!art) return;

    // Onto each roadway far enough that the joins are covered.
    const OVERLAP = Math.round(0.014 * this.worldW);
    const x0 = this._gapL - OVERLAP, wantW = (this._gapR + OVERLAP) - x0;
    // Off the PAINTED box, not the canvas — the picture carries transparent
    // margin, and scaling by the canvas would leave the slab short.
    const s = wantW / art.pw;
    this._spanScale = s;
    this._spanW = wantW;
    // How far its road surface stands above the roadway either side.
    this._proud = Math.round(0.022 * 720);

    const mk = (cropX, cropW, originXpx) => {
      const im = this.add.image(0, 0, 'scene_bridgespan')
        .setOrigin(originXpx / art.w, art.deck / art.h)
        .setScale(s)
        // Above the two edges buildWalk draws down every hole in the floor —
        // while the span is there the hole is covered. Below the player at 10.
        .setDepth(3);
      im.setCrop(cropX, 0, cropW, art.h);
      return im;
    };
    this.span = mk(art.px0, art.pw, art.px0 + art.pw / 2);
    this.span.setPosition((this._gapL + this._gapR) / 2, this.groundY - this._proud);

    // Solid across its own deck, and only as deep as the roadway.
    this.spanBody = this.add.rectangle(x0 + wantW / 2, this.groundY - this._proud + 30,
                                       wantW, 60, 0x000000, 0).setDepth(-1);
    this.physics.add.existing(this.spanBody, true);
    this.solidsW.push(this.spanBody);
    this.physics.add.collider(this.player, this.spanBody);

    this.bridgeState = 'intact';
    this.halves = null;
    this._holdInput = false;
    // It goes while he is still on solid road. This painting gives a short
    // approach — the left roadway is barely two of his own widths — so the
    // trip line is one body-height back from the lip rather than three.
    this._triggerX = this._gapL - 1.0 * HUMAN_M * (this.pxPerM || 144);
    if (this._triggerX < 30) this._triggerX = 30;
  }

  update() {
    super.update();
    if (!this.span || this.bridgeState !== 'intact' || this._transitioning) return;
    if (this.player.x >= this._triggerX) this._collapse();
  }

  // Take the controls, or give them back. Taking them drops him to a stand so
  // he is not frozen mid-stride for the length of the set piece.
  _hold(on) {
    this._holdInput = on;
    if (!on || !this.player) return;
    this.player.setVelocity(0, 0);
    const hero = this.player._hero;
    if (hero) {
      playAction(this.player, hero, 'idle', this.player._facing);
      this.player._curAnim = heroAnim(hero, 'idle', this.player._facing);
    }
  }

  // It breaks in the middle, the two halves hinge down off the roadway they
  // are still resting on, and then they let go. Each half keeps its own end of
  // the painted slab, so the break is the picture coming apart.
  _makeHalves() {
    const art = bridgeArt(this, 'scene_bridgespan');
    const mid = art.px0 + Math.floor(art.pw / 2);
    const s = this._spanScale, y = this.groundY - this._proud;
    const half = (cropX, cropW, originXpx, atX) => {
      const im = this.add.image(0, 0, 'scene_bridgespan')
        .setOrigin(originXpx / art.w, art.deck / art.h)
        .setScale(s).setDepth(3);
      im.setCrop(cropX, 0, cropW, art.h);
      im.setPosition(atX, y);
      return im;
    };
    const o = Math.round(0.014 * this.worldW);
    return [
      half(art.px0, mid - art.px0, art.px0, this._gapL - o),
      half(mid, art.px1 - mid + 1, art.px1 + 1, this._gapR + o)
    ];
  }

  _collapse() {
    if (this.bridgeState !== 'intact') return;     // only ever once
    this.bridgeState = 'shaking';
    Sfx.ensure();
    const sx = this.span.x;

    // He stops where he is and watches. Without this he walks on through the
    // shudder and ends up out over the ravine on a span about to stop
    // existing, which is the one place the stage is built to keep him out of.
    this._hold(true);
    this.cameras.main.shake(1100, 0.007);

    this.tweens.add({
      targets: this.span, x: sx + 5, duration: 55, yoyo: true, repeat: 17,
      onComplete: () => {
        if (!this.span) return;                    // scene restarted under us
        this.span.x = sx;
        this.bridgeState = 'breaking';
        this.cameras.main.shake(420, 0.011);

        if (this.spanBody) {
          const body = this.spanBody;
          this.spanBody = null;
          const i = this.solidsW.indexOf(body);
          if (i >= 0) this.solidsW.splice(i, 1);
          body.body.enable = false;
          body.destroy();
        }

        // Swap the slab for its two halves in the same frame and the same
        // place, so nothing jumps: the break is the only change.
        this.span.destroy(); this.span = null;
        this.halves = this._makeHalves();
        this._dust();

        const [L, R] = this.halves;
        this.tweens.add({ targets: L, rotation: 0.20, y: L.y + 14,
                          duration: 620, ease: 'Quad.easeIn' });
        this.tweens.add({ targets: R, rotation: -0.20, y: R.y + 14,
                          duration: 620, ease: 'Quad.easeIn',
          onComplete: () => {
            if (!this.halves) return;
            this.bridgeState = 'falling';
            this.halves.forEach((h, i) => this.tweens.add({
              targets: h, y: h.y + 520, alpha: 0,
              rotation: h.rotation + (i === 0 ? 0.30 : -0.30),
              duration: 1100, ease: 'Quad.easeIn',
              onComplete: () => h.destroy()
            }));
            this.time.delayedCall(900, () => {
              this.halves = null;
              this.bridgeState = 'gone';
              this._hold(false);
              this._say([['PLAYER', 'Looks like we have to jump it.']]);
              this._showTip('JUMP, THEN JUMP AGAIN IN MID-AIR TO CLEAR THE GAP');
            });
          }
        });
      }
    });
  }

  // Dust off the broken ends while it goes. Seeded off the index rather than
  // a random number, so a replay of the stage looks the same.
  _dust() {
    const gY = this.groundY, W = this._gapR - this._gapL;
    for (let i = 0; i < 16; i++) {
      const f = (i * 2654435761 % 1000) / 1000;
      const g = ((i * 40503) % 997) / 997;
      const p = this.add.circle(this._gapL + f * W, gY + 10 + g * 40,
                                14 + g * 26, 0x6b5f52, 0.5).setDepth(5);
      this.tweens.add({
        targets: p, y: p.y - 60 - f * 90, alpha: 0, scale: 1.8 + g,
        duration: 1100 + f * 700, delay: g * 600, ease: 'Sine.easeOut',
        onComplete: () => p.destroy()
      });
    }
  }
}


// ================================================================== //
//  TUTORIAL 4 — THE DROP (double jump into a dash)                   //
//                                                                    //
//  Three surfaces at three heights, read off the painting: the        //
//  roadway he starts on, a ledge below and ahead of it, and the deck  //
//  above and beyond that. Walk off the first, drop to the second,     //
//  and leave the second with everything he has — jump, jump again,    //
//  and dash out of the top of the arc, because the double jump alone  //
//  runs out of height before it runs out of distance.                 //
// ================================================================== //
class DashScene extends WalkScene {
  constructor() { super('DashScene'); }
  create() {
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_dashstage',
      worldW: 'auto', bgZoom: 1.0, startXFrac: 0.05,
      // The floor line is the roadway he starts on. Nothing else uses it —
      // the whole world is a hole and every surface is a ledge — but a missed
      // jump is put back on solid ground relative to it.
      groundY: Math.round(720 * 0.470),
      // Small, like the bridge: this is a wide shot and the point of it is
      // the distance between the three surfaces, which only reads if they are
      // all in frame at once.
      pxPerM: 58,
      title: 'THE DROP',
      castSwitch: true, canReset: true, noLongIdle: true,
      doubleJump: true, dash: true,
      // No floor anywhere. Everything standable is a ledge, and what is not a
      // ledge is the valley.
      gaps: [{ atFrac: 0, wFrac: 1 }], gapShade: false,
      // Measured off the painting. Each is the top face of a piece of
      // stonework you can see, as a fraction of the picture.
      ledges: [
        { x0: 0.000, x1: 0.335, y: 0.470 },   // the roadway, with the car
        { x0: 0.345, x1: 0.510, y: 0.552 },   // the ledge below it
        { x0: 0.610, x1: 1.000, y: 0.372 }    // the deck above, and walkable
      ],
      beats: [
        { at: 0,    say: [['PLAYER', 'Road stops here.']],
                    tip: 'WALK RIGHT — THE ROAD RUNS OUT' },
        { at: 0.30, tip: 'WALK OFF THE EDGE AND DROP TO THE LEDGE' },
        { at: 0.44, say: [['PLAYER', 'That deck is too high to jump at.']],
                    tip: 'JUMP, JUMP AGAIN, THEN SHIFT TO DASH ACROSS' }
      ],
      exits: [
        { xFrac: 0.985, w: 90, target: 'ShopStreetScene', auto: true,
          silent: true, fadeMs: 320 }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x140f0c, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x6b2a10, 0.5); g.fillRect(0, 300, WW, 220);
      }
    });
  }
}

// ================================================================== //
//  THE SHOP STREET — down to the TIENDA                              //
//                                                                    //
//  A way down rather than a way across: off the high roadway, onto a  //
//  block standing on its own legs over the drop, and down again onto  //
//  the pavement in front of the shop. The way in is the dark opening  //
//  under the sign, and it is lit so it reads as a door and not as a   //
//  shadow.                                                            //
// ================================================================== //
class ShopStreetScene extends WalkScene {
  constructor() { super('ShopStreetScene'); }
  create() {
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_shopstreet',
      worldW: 'auto', bgZoom: 1.0, startXFrac: 0.04,
      // The pavement in front of the shop, read off the painting.
      groundFrac: 0.845,
      // What this picture is drawn at: the shopfront opening is 0.28 of the
      // height, and a roll-up shop door is a shade over two metres, which puts
      // its metre at about 85px. He walks in at 153px and stands under that
      // opening like a man standing in a doorway.
      pxPerM: 85,
      title: 'THE TIENDA',
      castSwitch: true, canReset: true, noLongIdle: true,
      // He arrives able to double jump and dash, and keeps both — there is
      // nothing here that needs them, but taking a move away again reads as a
      // bug rather than as design.
      doubleJump: true, dash: true,
      // No floor under the high roadway: step off it and you are committed.
      gaps: [{ atFrac: 0, wFrac: 0.30 }], gapShade: false,
      ledges: [
        { x0: 0.000, x1: 0.300, y: 0.380 },   // the roadway he arrives on
        { x0: 0.310, x1: 0.460, y: 0.550 }    // the block standing over the drop
      ],
      beats: [
        { at: 0,    say: [['PLAYER', 'There. Still has a roof.']],
                    tip: 'WALK OFF THE EDGE — DROP TO THE BLOCK, THEN TO THE STREET' },
        { at: 0.62, say: [['PLAYER', 'Armas, equipo, reparaciones. Let us hope.']],
                    tip: 'PRESS  E  AT THE OPENING' }
      ],
      exits: [
        // The opening under the sign, measured off the painting. Lit the way
        // the bunker's blast door is lit, so the whole doorway reads as live
        // rather than a patch of shadow you have to guess at.
        { xFrac: 0.823, w: 150, label: 'ENTER THE TIENDA', target: 'ShopScene',
          spawnXFrac: 0.29, glow: true, noArrow: true,
          glowFrac: { x0: 0.772, x1: 0.874, y0: 0.552, y1: 0.836 } }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x15100c, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x3a2a1c, 1); g.fillRect(0, 600, WW, 120);
      }
    });
  }
}

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
      beats: [
        { at: 0,    say: [['ETERWOLF', 'What the hell happened here!'],
                          ['WOLFFEL',  'Idk.'],
                          ['ETERWOLF', "Let's keep moving."]] }
      ],
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
      beats: [
        { at: 0, say: [['ETERWOLF', "What's that blinking over there?"]],
                 tip: 'PRESS  E  TO ENTER THE SHOP' }
      ],
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
      beats: [
        { at: 0.30, tip: 'WALK INTO THE WEAPON TO PICK IT UP', needs: 'pickup' }
      ],
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

// ================================================================== //
//  DEBUG SANDBOX                                                     //
//  A subclass of the combat scene, so every ability, enemy, damage   //
//  rule and HUD element is the real one rather than a copy that      //
//  drifts. It only switches the wave director off and adds spawning. //
// ================================================================== //
const SANDBOX_ENEMIES = [
  ['ONE', 'walker'], ['TWO', 'runner'], ['THREE', 'brute'], ['FOUR', 'flyer'],
  ['FIVE', 'zomba'], ['SIX', 'archer'], ['SEVEN', 'kingo'], ['NINE', 'alien'],
  ['ZERO', 'crawler']
];

class DebugScene extends GameScene {
  constructor() { super('DebugScene'); }

  // Which character to build. Switching restarts the scene, and the choice has
  // to survive that, so it arrives as restart data rather than living on the
  // instance Phaser reuses.
  init(data) {
    this._wantCast = (data && data.cast) || this._wantCast || DEFAULT_CAST;
  }

  create() {
    GameState.hasWeapon = true;        // sandbox starts armed
    this.castId = this._wantCast;      // read by GameScene.create when it builds the player
    super.create();

    // The wave director is the only part of the combat scene the sandbox does
    // not want: enemies come from the keyboard instead.
    this.waveTriggered = true;
    this.waveActive = false;
    this.spawnQueue = [];
    this.waveSpeed = 55;               // enemy speeds derive from this; NaN without it
    this.finisherEnabled = true;

    // A face for the wall crawler to live on, with a gap under it you can walk
    // through — the whole point is being spat at from above while you move.
    this._testWall = this.addWall(760, GROUND_Y - 330, GROUND_Y, 30);
    this.add.text(760, GROUND_Y - 348, 'CRAWLER WALL', {
      fontFamily: F_UI, fontSize: '11px', fontStyle: '700', color: '#6f5c44'
    }).setOrigin(0.5, 1).setDepth(1);

    if (this.advanceHint) this.advanceHint.setVisible(false);
    this.waveText.setText('SANDBOX');
    // The combat scene opens on a "advance to the middle of the street" banner,
    // which is the wave director talking. Nothing here obeys it.
    this.bannerText.setText('').setAlpha(0);
    this.subBannerText.setText('').setAlpha(0);
    this.tweens.killTweensOf([this.bannerText, this.subBannerText]);

    if (this.weaponText) this.weaponText.setText(WEAPONS[this.weapon].name);
    this._buildDebugPanel();
    this._bindDebugKeys();
  }

  // Nothing triggers a wave in here.
  checkWaveTrigger() {}

  _buildDebugPanel() {
    const lines = [
      'SANDBOX                                   F9 / ESC — leave',
      '1 walker   2 runner   3 brute   4 flyer',
      '5 zomba    6 archer   7 kingo   8 boss    9 ALIEN   0 CRAWLER',
      'C clear    P character    O finisher    R reset',
      'A/D move · S crouch · X walk/run · W jump ×2 · Shift dash',
      'LMB/K fire · E swap weapon · F/RMB sword (3-hit chain) · Q nuke'
    ];
    this.add.rectangle(14, 96, 560, 166, 0x0a0807, 0.72)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(70);
    this._dbgText = this.add.text(26, 104, lines.join('\n'), {
      fontFamily: F_UI, fontSize: '13px', fontStyle: '600', color: '#f2b13c', lineSpacing: 4
    }).setScrollFactor(0).setDepth(71);

    this._dbgStatus = this.add.text(26, 232, '', {
      fontFamily: F_UI, fontSize: '13px', fontStyle: '600', color: '#cbbba1'
    }).setScrollFactor(0).setDepth(71);

    // One clickable button per playable character. Clicking rebuilds the arena
    // as that character; P still cycles them from the keyboard.
    this._castBtns = [];
    let x = 26;
    this.add.text(x, 254, 'PLAY', {
      fontFamily: F_UI, fontSize: '12px', fontStyle: '700', color: '#7d6c55'
    }).setScrollFactor(0).setDepth(71);
    x += 42;
    CAST.forEach(c => {
      const t = this.add.text(x + 10, 252, c.name, {
        fontFamily: F_UI, fontSize: '14px', fontStyle: '700', color: '#cbbba1'
      }).setScrollFactor(0).setDepth(72);
      const box = this.add.rectangle(x, 249, t.width + 20, 24, 0x1b1611, 0.95)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(71)
        .setStrokeStyle(1, 0x4a3b2a).setInteractive({ useHandCursor: true });
      box.on('pointerover', () => { if (c.id !== this.castId) t.setColor('#f2b13c'); });
      box.on('pointerout',  () => this._refreshCastBtns());
      box.on('pointerdown', () => { Sfx.ensure(); Sfx.select(); this._setCast(c.id); });
      this._castBtns.push({ c, t, box });
      x += t.width + 28;
    });
    this._refreshCastBtns();
    this._refreshStatus();
  }

  _refreshCastBtns() {
    (this._castBtns || []).forEach(({ c, t, box }) => {
      const on = c.id === this.castId;
      t.setColor(on ? '#0a0807' : '#cbbba1');
      box.setFillStyle(on ? 0xf2b13c : 0x1b1611, on ? 1 : 0.95);
      box.setStrokeStyle(1, on ? 0xf2b13c : 0x4a3b2a);
    });
  }

  _refreshStatus() {
    const n = CAST.findIndex(c => c.id === this.castId);
    this._dbgStatus.setText(
      'PLAYING ' + (this.hero ? this.hero.name : '—') +
      '  (' + (n + 1) + '/' + CAST.length + ')' +
      '     FINISHER ' + (this.finisherEnabled ? 'ON' : 'OFF') +
      '     MOVE ' + (this.walkMode ? 'WALK' : 'RUN') +
      '     GUN ' + WEAPONS[this.weapon].name +
      '     COMBO ' + (this.time.now <= this.comboUntil ? this.swordCombo + 1 : 0) +
      '     ENEMIES ' + this.zombies.countActive(true));
  }

  _bindDebugKeys() {
    SANDBOX_ENEMIES.forEach(([key, type]) => {
      this.input.keyboard.on('keydown-' + key, () => this._spawnNear(type));
    });
    this.input.keyboard.on('keydown-EIGHT', () => {
      if (this.dead || (this.boss && this.boss.active)) return;
      this.spawnBoss();
      this._refreshStatus();
    });
    this.input.keyboard.on('keydown-C', () => this._clearEnemies());
    // The combat scene only honours R once you are dead; in here it always
    // rebuilds the arena.
    this.input.keyboard.on('keydown-R', () => {
      this.physics.world.timeScale = 1;
      this.scene.restart();
    });
    this.input.keyboard.on('keydown-P', () => this._cycleCast());
    this.input.keyboard.on('keydown-O', () => {
      this.finisherEnabled = !this.finisherEnabled;
      this._refreshStatus();
    });
    this.input.keyboard.on('keydown-ESC', () => leaveSandbox(this));
  }

  // spawnZombie places enemies off the camera edge, which is right for a wave
  // but useless when you want to look at one. The newest child is repositioned
  // in front of the player instead.
  _spawnNear(type) {
    if (this.dead) return;
    this.spawnZombie(type);
    const kids = this.zombies.getChildren();
    const z = kids[kids.length - 1];
    // A crawler belongs on the wall, not in front of you — spawnZombie has
    // already put it there and moving it would take it off the brick.
    if (z && type === 'crawler') { this._refreshStatus(); return; }
    if (z) {
      // Fanned out rather than stacked, so spawning several of a kind gives you
      // a row to look at instead of one sprite with the rest hidden behind it.
      const dir = this.facing >= 0 ? 1 : -1;
      const spread = 200 + (this._spawnN = ((this._spawnN || 0) + 1) % 5) * 90;
      z.setPosition(Phaser.Math.Clamp(this.player.x + dir * spread, 40, WORLD_W - 40), z.y);
    }
    this._refreshStatus();
  }

  _clearEnemies() {
    this.zombies.getChildren().slice().forEach(z => { if (z.active) z.destroy(); });
    this.enemyShots.getChildren().slice().forEach(b => { if (b.active) b.destroy(); });
    if (this.boss) {
      this.boss = null;
      this.bossBarBg.setVisible(false);
      this.bossBarFill.setVisible(false);
      this.bossBarLabel.setVisible(false);
    }
    this._executing = false;
    this.physics.world.timeScale = 1;
    this._refreshStatus();
  }

  _cycleCast() {
    if (CAST.length < 2) {
      this.showBanner('ONE CHARACTER BUILT', 'build a second art module to test another', 1600);
      return;
    }
    const n = CAST.findIndex(c => c.id === this.castId);
    this._setCast(CAST[(n + 1) % CAST.length].id);
  }

  // A character is chosen when the player sprite is built, so switching means
  // rebuilding the arena. That also clears whatever was spawned, which is what
  // R does anyway — cheaper and far safer than swapping a live body and every
  // collider that references it.
  _setCast(id) {
    if (id === this.castId || !castById(id)) return;
    this.physics.world.timeScale = 1;
    this.scene.restart({ cast: id });
  }

  update(time, delta) {
    super.update(time, delta);
    if (this.time.now > (this._nextStatusAt || 0)) {
      this._nextStatusAt = this.time.now + 250;
      this._refreshStatus();
    }
  }
}

// ------------------------------------------------------------------ //
//  SANDBOX ENTRY                                                      //
//  Reachable only in a development build. tools/build_html.js sets    //
//  window.ATOMHOWL_DEV, and --release clears it, which drops both the //
//  menu entry and the hotkey without touching this code.              //
// ------------------------------------------------------------------ //
const DEV_BUILD = !!window.ATOMHOWL_DEV;

function enterSandbox(from) {
  if (!DEV_BUILD || !from || from.scene.key === 'DebugScene') return;
  stopMusic(200);
  from.scene.start('DebugScene');
}

function leaveSandbox(from) {
  if (!from) return;
  from.physics.world.timeScale = 1;
  from.scene.start('MenuScene');
}

if (DEV_BUILD) {
  // A plain DOM listener, because no scene owns the hotkey and it has to work
  // from wherever you happen to be. Boot is excluded: the sandbox needs the
  // textures and animations that BootScene.create() registers.
  window.addEventListener('keydown', e => {
    if (e.key !== 'F9' || !window.__game) return;
    const live = window.__game.scene.getScenes(true)[0];
    if (!live || live.scene.key === 'BootScene') return;
    e.preventDefault();
    enterSandbox(live);
  });
}

// ------------------------------------------------------------------ //
//  BOOT THE GAME                                                      //
// ------------------------------------------------------------------ //
window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  // The single-file build has no container and Phaser appends to the body,
  // which is right there. The hosted build wraps the canvas so the page can
  // lay out around it, and names it here.
  parent: (typeof document !== 'undefined' && document.getElementById('game')) ? 'game' : undefined,
  width: 1280,
  height: 720,
  pixelArt: true,
  backgroundColor: '#0a0807',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY }, debug: false } },
  scene: [BootScene, StartScene, MenuScene, CharSelectScene, IntroDialogueScene,
          BunkerScene, ExitScene, JumpScene, BridgeScene, DashScene,
          ShopStreetScene, CityScene, ShopFrontScene, ShopScene,
          GameScene, DebugScene]
});

// ---- gamepad ----
// Exposed so the pad can be inspected from the browser console while tuning a
// mapping — `Pad.connected`, `Pad.axes`, `Pad._held` — and so the tests can
// drive it without reaching into the closure.
window.Pad = Pad;
window.PadHUD = PadHUD;

// One poll for the whole game. `prestep` runs before any scene's update, so a
// button pressed this frame is already "held" by the time driveWalker and
// GameScene.update read the keyboard. No scene has to opt in, which is the
// point — a scene added later gets pad support without knowing it exists.
window.__game.events.on('prestep', (time) => {
  try { Pad.update(time); } catch (e) {}
});

// Letting go of the window while the pad holds a direction would otherwise
// leave that key down forever, and the character walks off on his own when you
// come back.
window.addEventListener('blur', () => { try { Pad.release(); } catch (e) {} });

window.addEventListener('keydown', e => {
  if (e.key !== 'F10') return;
  e.preventDefault();
  try { PadHUD.toggle(); } catch (err) {}
});

})();

