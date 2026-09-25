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
  // A noise burst through a band-pass rather than a low-pass: it gives a
  // transient with a character to it — a tick, a scuff, a knock — where the
  // low-passed version only ever sounds like a puff of air.
  burst(dur, vol, freq, q, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq || 1400; f.Q.value = q || 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  // Boots on broken concrete. The scuff carries it and the low thud gives it
  // weight; both move a little each step so a walk does not tick like a
  // metronome. Running is harder, brighter and closer together.
  step(hard) {
    const v = 0.85 + Math.random() * 0.3;
    this.burst(hard ? 0.075 : 0.055, (hard ? 0.34 : 0.19) * v,
               (hard ? 1500 : 1150) * v, 1.1);
    this.blip((hard ? 96 : 78) * v, 0.05, 'sine', hard ? 0.13 : 0.075, 50);
  },
  land()    { this.burst(0.1, 0.4, 900, 0.9); this.blip(70, 0.11, 'sine', 0.22, 42); },
  shoot()   { this.noise(0.06, 0.5, 2600); this.blip(700, 0.05, 'square', 0.25, 180); },
  // The pistol in the walking stages. The old shot was a puff of noise and a
  // square-wave chirp — a toy. A gunshot is four things at once: the crack
  // (a very short bright transient), the blast (a wide band of noise, driven
  // hard so it has grit), the thump in the chest (a sine falling fast), and
  // the room giving it back a moment later. Then the slide, a click behind it.
  pistol() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime, sr = c.sampleRate;
    if (!this._gunNoise) {
      const len = Math.floor(sr * 0.6);
      const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._gunNoise = b;
      // a soft clipper for the blast
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 3.2); }
      this._gunCurve = curve;
    }
    const v = 0.94 + Math.random() * 0.12;          // no two shots quite alike
    const bus = c.createGain(); bus.gain.value = 1;
    bus.connect(this.master);
    // the room: one early reflection, darkened, dying away
    const dl = c.createDelay(0.4); dl.delayTime.value = 0.072;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1500;
    const fb = c.createGain(); fb.gain.value = 0.3;
    const wet = c.createGain(); wet.gain.value = 0.42;
    bus.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl); damp.connect(wet);
    wet.connect(this.master);
    const noiseInto = (node, at, dur) => {
      const src = c.createBufferSource(); src.buffer = this._gunNoise;
      src.playbackRate.value = v;
      src.connect(node); src.start(at, Math.random() * 0.2, dur + 0.05);
    };
    const env = (g, peak, at, dur) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    };
    // crack
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400 * v;
    const g1 = c.createGain(); env(g1, 1.1, t, 0.045);
    hp.connect(g1); g1.connect(bus); noiseInto(hp, t, 0.05);
    // blast
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200 * v;
    const sh = c.createWaveShaper(); sh.curve = this._gunCurve;
    const g2 = c.createGain(); env(g2, 1.0, t, 0.17);
    lp.connect(sh); sh.connect(g2); g2.connect(bus); noiseInto(lp, t, 0.18);
    // thump
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(165 * v, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g3 = c.createGain(); env(g3, 1.0, t, 0.16);
    o.connect(g3); g3.connect(bus); o.start(t); o.stop(t + 0.2);
    // tail
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.7;
    const g4 = c.createGain(); env(g4, 0.3, t + 0.008, 0.42);
    bp.connect(g4); g4.connect(bus); noiseInto(bp, t + 0.008, 0.45);
    // the slide coming back
    setTimeout(() => this.burst(0.018, 0.22, 4600, 3.5), 70);
    setTimeout(() => this.burst(0.014, 0.16, 3100, 3.0), 98);
  },
  // Acid on skin: a short hiss and something low and unhappy under it.
  sizzle() { this.burst(0.2, 0.28, 3600, 0.6); this.blip(140, 0.12, 'sawtooth', 0.14, 80); },
  // A heart coming back.
  mend()    { this.blip(660, 0.08, 'triangle', 0.16, 880); },

  // ---- sounds that keep going ------------------------------------------
  // A looping noise bed with a handle: setVolume(v, ms) and stop(ms). The
  // radio's static and a burning car's crackle are both this — filtered
  // noise, a slow waver, and random crackle pops riding on top at a rate the
  // caller picks. It goes through master, so N (mute) silences it too.
  // Whoever starts one stops it; scenes stop theirs on shutdown.
  loop(o) {
    this.ensure();
    if (!this.ctx) return null;
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 2);
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 300;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 1600;
    const wav = c.createGain(); wav.gain.value = 1;
    const g = c.createGain(); g.gain.value = 0.0001;
    src.connect(hp); hp.connect(lp); lp.connect(wav); wav.connect(g); g.connect(this.master);
    let lfo = null;
    if (o.waver) {              // the level drifts, the way a weak signal does
      lfo = c.createOscillator(); lfo.frequency.value = o.waver;
      const lg = c.createGain(); lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(wav.gain); lfo.start();
    }
    src.start();
    let vol = 0, dead = false, timer = null;
    const h = {
      setVolume(v, ms) {
        if (dead) return;
        vol = v;
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + Math.max(0.02, (ms || 0) / 1000));
      },
      get volume() { return vol; },
      stop(ms) {
        if (dead) return;
        h.setVolume(0.0001, ms || 200);
        dead = true;
        clearTimeout(timer);
        setTimeout(() => {
          try { src.stop(); if (lfo) lfo.stop(); } catch (e) { /* already stopped */ }
          try { g.disconnect(); } catch (e) { /* gone */ }
        }, (ms || 200) + 80);
      }
    };
    if (o.crackle) {
      const tick = () => {
        if (dead) return;
        if (vol > 0.005) this.burst(0.008 + Math.random() * 0.022, Math.min(0.9, vol * (1.2 + Math.random() * 1.6)),
                                    (o.crackleFreq || 3500) * (0.7 + Math.random() * 0.6), 3);
        timer = setTimeout(tick, 30 + Math.random() * o.crackle);
      };
      tick();
    }
    h.setVolume(o.vol || 0, o.fadeIn || 300);
    return h;
  },

  // A voice through a bad radio: not words, just the rhythm of speech —
  // syllable-length bursts through a narrow band where a voice sits, with the
  // pitch wandering a little. Runs for `ms`, or until stopped.
  radioChatter(ms) {
    this.ensure();
    if (!this.ctx) return { stop() {} };
    let alive = true, t = null;
    const end = Date.now() + ms;
    const syl = () => {
      if (!alive || Date.now() > end) return;
      const f = 650 + Math.random() * 700;
      this.burst(0.05 + Math.random() * 0.09, 0.22 + Math.random() * 0.18, f, 5);
      if (Math.random() < 0.35) this.blip(170 + Math.random() * 90, 0.07, 'sawtooth', 0.035, 150);
      // words, then a gap between them
      t = setTimeout(syl, Math.random() < 0.18 ? 170 + Math.random() * 150 : 70 + Math.random() * 70);
    };
    syl();
    return { stop() { alive = false; clearTimeout(t); } };
  },

  // Somebody eating something they have been thinking about for a while.
  munch() {
    [0, 150, 310, 470].forEach((ms, i) => setTimeout(() => {
      this.burst(0.05, 0.28 - i * 0.03, 900 + Math.random() * 500, 1.4);
      this.blip(120, 0.04, 'sine', 0.06, 90);
    }, ms));
  },

  // A tank letting go: the crack, a chest-deep thump, and a long rumbling
  // tail with metal coming down in it.
  explosion() {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime, sr = c.sampleRate;
    const len = Math.floor(sr * 2.2);
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the body and its tail, low-passed, falling slowly
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 1.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(t);
    // the thump
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.7);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(1.4, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.85);
    // the crack
    this.burst(0.05, 0.9, 3200, 0.7);
    // metal and glass landing
    [380, 520, 700, 860, 1040, 1300].forEach(ms => setTimeout(() =>
      this.burst(0.03 + Math.random() * 0.04, 0.12 + Math.random() * 0.12, 2400 + Math.random() * 2600, 4), ms));
  },

  // Fuel boiling in a tank: a hiss that climbs.
  hissRise(ms) {
    this.ensure();
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime, dur = ms / 1000, sr = c.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(4200, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.02, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t);
    this.blip(260, dur, 'sine', 0.05, 1300);
  },
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
  // ---- menu / dialogue UI ----
  // These were square and triangle waves, which is the sound of a console two
  // generations before the one this game is drawn for. A modern interface
  // clicks and thuds rather than beeping: a noise transient for the contact
  // and a short low body underneath it for the weight.
  hover()   { this.burst(0.028, 0.16, 3200, 1.4); },
  select()  { this.burst(0.055, 0.42, 1700, 1.0);
              this.blip(150, 0.11, 'sine', 0.26, 88);
              setTimeout(() => this.burst(0.04, 0.16, 4200, 2.0), 42); },
  deny()    { this.burst(0.07, 0.3, 500, 1.6);
              this.blip(105, 0.16, 'sawtooth', 0.22, 70); },
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
  stopTrack(400);
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
  stopTrack(ms);
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

// A second track for set pieces — "four enemies" under the first fight. Kept
// apart from the menu bed so starting one never has to know about the other,
// and asked for by key, so a scene that restarts mid-fight (he died, R) asks
// for the track it is already hearing and it simply carries on.
let _track = null, _trackKey = null;
function playTrack(key, vol) {
  if (_track && _trackKey === key) return;
  stopTrack(300);
  const list = mediaList(key);
  if (!list.length) return;
  try {
    const a = new Audio(pickAudio(list));
    a.loop = true;
    a.volume = vol != null ? vol : MUSIC_BED;
    a.preload = 'auto';
    _track = a; _trackKey = key;
    a.play().catch(() => {});
  } catch (e) { _track = null; _trackKey = null; }
}

function stopTrack(ms) {
  if (!_track) return;
  const a = _track;
  _track = null; _trackKey = null;
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
  const t = scene.textures.get(key);
  if (t) t.setFilter(Phaser.Textures.FilterMode.NEAREST);
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
// `seen` is the set of one-off moments that have already played — a
// conversation, a cutscene, a creature waking up. Stages restart constantly
// (a fall, R, walking back through a door), and without this every one of
// them replays its set piece each time you step into the room.
const GameState = { hasWeapon: false, hasSwords: false, hasPistol: false, castId: null, seen: {} };
function once(id) {
  if (GameState.seen[id]) return false;
  GameState.seen[id] = true;
  return true;
}
// The blades come out of the chest in the store. The older route through the
// city hands you a gun before it hands you a fight, so it keeps its sword on
// that instead — nothing that worked before stops working.
function armedWithBlade() { return GameState.hasSwords || GameState.hasWeapon; }
// The control legend under the canvas shows the sword dimmed and marked
// LOCKED until it is real. One place to light it, called from wherever the
// blades actually arrive, so the page can never disagree with the game.
function showBladeUnlocked() {
  try {
    const el = document.querySelector('.legend .sword');
    if (el) el.classList.add('on');
  } catch (e) { /* the legend is page furniture; the game runs without it */ }
}

// A new game starts from nothing. GameState lived for the whole page, so NEW
// GAME after ESC kept the blades, the pistol and every room already cleared.
function resetProgress() {
  GameState.hasWeapon = false;
  GameState.hasSwords = false;
  GameState.hasPistol = false;
  GameState.seen = {};
  try {
    const el = document.querySelector('.legend .sword');
    if (el) el.classList.remove('on');
  } catch (e) { /* page furniture */ }
}

// ---- the checkpoint ------------------------------------------------------
// Every walking stage saves where it starts, with the progress it started
// with, so CONTINUE puts you back at the start of the stage you were on. One
// slot, in this browser's storage; a PC build would move it to a file.
const SAVE_KEY = 'atomhowl.save.v1';
function saveCheckpoint(sceneKey, data) {
  try {
    const d = Object.assign({}, data || {});
    delete d.resumed;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      scene: sceneKey, data: d,
      state: { hasWeapon: GameState.hasWeapon, hasSwords: GameState.hasSwords,
               hasPistol: GameState.hasPistol, castId: GameState.castId,
               seen: Object.assign({}, GameState.seen) }
    }));
  } catch (e) { /* no storage (private window): no checkpoint, the game still runs */ }
}
function loadCheckpoint() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const c = raw && JSON.parse(raw);
    return c && c.scene && c.state ? c : null;
  } catch (e) { return null; }
}

const WORLD_W = 2400;
const WORLD_H = 720;
const GROUND_Y = 648;          // top surface of the street
const GRAVITY = 1500;
// How hard they leave the ground, in the walking stages.
//
// 640 -> 900 -> 740. At 900 a single jump cleared 1.35 of their own height,
// and that is the number that made the levels pointless: if one press puts
// your head a body and a third above where you started, a ledge is scenery
// and the second jump is decoration. 740 puts the apex at 0.91 of a height —
// just under your own head — which is a jump you take to get ON something
// rather than a jump that clears it.
//
// Every gap in the game is measured against this number, so all of them were
// re-checked against the new one rather than left to see what broke:
//   the bridge   ravine 298px; one jump carries 269 across and dies in it,
//                two carry 460 — and at this height the stage no longer needs
//                its pinned motion scale, so the brothers move at the same
//                speed there as everywhere else
//   the drop     261px of rise; one jump gives 166, two give 332
//   the store    the balcony is 270 up and the low ledge 216, both past one
//                jump and inside two; the shelf-to-stairs hop stays a single
//   the street   the wall is 75px against a 214px jump
// One consequence worth having: from the shop floor the high gantry is 320
// up and two jumps now reach 302, so the staircase is the way up rather than
// a thing you can skip.
const JUMP_V = 740;
// The same again, rather than softer. The second jump used to be 0.9 of the
// first, which at the old height still left plenty; at this one the drop's
// crossing came out three pixels short of possible at a walk, and matching
// the two buys back the 34px that makes it a jump rather than a coin toss.
const JUMP_V2 = 740;
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
    // Where the chain picks up again once the flourish has played, and how
    // long it holds there before doing it again. Without these a one-shot
    // flourish happens once and never again, which is right for a man who
    // takes his guitar off his back and wrong for a man eating.
    d.idleLoopFrom = d.art.idleLoopFrom;
    d.idleLoopMs = d.art.idleLoopMs;
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
function idlePose(hero, restSince, now, done, allowLong, looped) {
  const chain = hero && hero.idleChain;
  if (!chain || !chain.length) return 'idle';
  let max = chain.length - 1;
  if (allowLong === false || (done && hero.idleLoopFrom == null))
    while (max > 0 && chain[max] === hero.longIdle) max--;
  const step = hero.idleStepMs || IDLE_LONG_MS;
  const held = restSince ? now - restSince : 0;
  // Once round the chain already: he holds the pose the character names —
  // Wolffel the three-quarter one, not the side-on one he first stopped in —
  // and does the whole thing again when the longer fuse runs out.
  if (looped && hero.idleLoopFrom != null) {
    const from = Math.min(hero.idleLoopFrom, max);
    if (held < (hero.idleLoopMs || step)) return chain[from];
    return chain[max];
  }
  const i = Math.floor(held / step);
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

    // Linear is the game's default now; this stays explicit for the hero
    // frames, which are high-res renders shown at fractional scales. The old
    // pixel zombies go the other way and keep their hard pixels.
    if (window.ZOMBS) {
      for (const S of Object.keys(window.ZOMBS)) {
        (window.ZOMBS[S].frames || []).forEach((_, i) => {
          const t = this.textures.get('zomb_' + S + '_' + i);
          if (t) t.setFilter(Phaser.Textures.FilterMode.NEAREST);
        });
      }
    }
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
    // A combat level can bring its own painting and say where its floor is in
    // it. Both default to the street's, so the street fight is untouched.
    const artKey = this.artKey || 'scene_combat';
    const artRow = this.artFloorRow || COMBAT_FLOOR_ROW;
    this.useCombatArt = this.textures.exists(artKey);
    this.useCustomBg = this.textures.exists('bg_custom');
    this.artImgs = [];
    if (this.useCombatArt) {
      const img = this.add.image(0, 0, artKey).setOrigin(0, 0).setDepth(-25);
      this.artImgs.push(img);
      // Scaled from the floor, not the height: the painted street has to meet
      // the physics ground. What hangs below the street is a dark strip and
      // falls off the bottom of the camera.
      const s = artRow < img.height ? GROUND_Y / artRow : WORLD_H / img.height;
      img.setScale(s);
      img.setScrollFactor(1);                     // scrolls 1:1 with the world
      this.combatArtW = img.width * s;
      // tile a flipped copy if the world is wider than the painting
      if (this.combatArtW < WORLD_W) {
        this.artImgs.push(this.add.image(this.combatArtW, 0, artKey).setOrigin(0, 0)
          .setDepth(-25).setScale(s).setFlipX(true));
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
    // A level with its own painted floor hides the street's tile and keeps its
    // body — the collision is the same line either way, only the picture of it
    // changes.
    if (this.hideStreet) street.setVisible(false);
    this.solids.push(street);

    // Vertical faces a crawler can cling to. The street has none by default;
    // the sandbox puts one up to test with, and a level can push its own.
    this.walls = [];
    this.oneWays = [];
    // stair-stepped: every ledge reachable — 540 from ground, 455 from 540, 370 from 455
    (this.noLedges ? [] : [[620, 540], [1780, 540], [950, 455], [1500, 455], [1200, 370]]).forEach(pos => {
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
    const bufferJump = () => this.bufferJump();
    this.input.keyboard.on('keydown-SPACE', bufferJump);
    this.input.keyboard.on('keydown-W', bufferJump);
    // UP is the up-aim in the street fight, not a second jump key. The
    // sandbox binds it to a jump as well — see DebugScene.

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
  bufferJump() { this.jumpBufferedAt = this.time.now; }

  // `enemiesPass` keeps the wall out of the shared solids list and gives it a
  // collider against the player alone, so it is something to hop over rather
  // than something the wave piles up behind.
  addWall(x, top, bottom, width, enemiesPass) {
    const w = width || 26;
    const h = bottom - top;
    const img = this.add.rectangle(x, top + h / 2, w, h, 0x1a1512)
      .setDepth(-1).setStrokeStyle(2, 0x2c241c);
    this.physics.add.existing(img, true);
    if (enemiesPass) this.physics.add.collider(this.player, img);
    else this.solids.push(img);
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

  // One line, once, rather than a sound and nothing to read. It says where
  // the blades are, because a control that does nothing and does not say why
  // reads as broken rather than as locked.
  _noBlade() {
    if (this._noBladeAt && this.time.now - this._noBladeAt < 2200) return;
    this._noBladeAt = this.time.now;
    const t = this.add.text(640, 150, 'NO BLADE  —  THERE IS A CHEST IN THE TIENDA', {
      fontFamily: 'Courier New, monospace', fontSize: '17px', color: '#c93b2a',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(95);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 22, duration: 1500,
      delay: 500, onComplete: () => t.destroy() });
  }

  swordAttack() {
    const time = this.time.now;
    if (time < this.nextSwordAt || this.dead) return;
    // The blades are taken out of the chest in the store. Anyone who came the
    // older way is already carrying a gun by the time there is anything to
    // fight, and that counts — see armedWithBlade.
    if (!armedWithBlade()) {
      Sfx.ensure(); Sfx.deny();
      this._noBlade();
      return;
    }

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
      // The death blow — the camera pans in on the kill and pulls back out —
      // is off unless a scene asks for it by name. Nothing in the story does:
      // a zoom out on every last kill was the thing asked to go.
      if (this.finisherEnabled === true && this._finisherEarned(fromSword) && this._isLastEnemy(z))
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
        this.idleLooped = false;
      } else if (!this.restSince) this.restSince = time;
      // A one-off long idle is finished when its clip stops; after that he
      // just stands there until something moves him again.
      if (this.hero.longIdleOnce && this.curAnim &&
          this.curAnim.indexOf('-' + this.hero.longIdle) === 2 &&
          !this.player.anims.isPlaying) {
        this.longIdleDone = true;
        if (this.hero.idleLoopFrom != null) { this.idleLooped = true; this.restSince = time; }
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
                             this.aliveEnemies() === 0, this.idleLooped);
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
  // Jumping is taught, not given: none at all until the broken wall on the
  // burnt street (stages set noJump before it), one jump from there, and the
  // second from the bridge (doubleJump).
  const maxJumps = (scene.cfg && scene.cfg.noJump) ? 0
                 : (scene.cfg && scene.cfg.doubleJump) ? 2 : 1;
  if (wantJump && (p._jumpsUsed || 0) < maxJumps) {
    // The air jump starts from a standstill vertically rather than adding to
    // whatever he had left, or a jump tapped at the top of the arc barely
    // registers while one tapped while falling throws him miles.
    p.setVelocityY(-((p._jumpsUsed || 0) === 0 ? JUMP_V : JUMP_V2) * k);
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
    Sfx.ensure(); Sfx.land();
  }

  // Footsteps, paced to the stride rather than to the animation: the walk and
  // the run are different cycles and different lengths, and tying the sound to
  // a frame index would need every character's clips to agree about which
  // frame the foot lands on. A cadence is close enough to read as walking, and
  // it scales with the stage the way the stride does.
  if (onGround && Math.abs(p.body.velocity.x) > 20) {
    const cad = (sprint ? 250 : 370) / Math.max(0.6, k);
    if (now - (p._stepAt || 0) > cad) {
      p._stepAt = now; Sfx.ensure(); Sfx.step(sprint);
    }
  }
  if (onGround) resetAirPhase(p);
  p._airSince = onGround ? 0 : (p._airSince || now);

  heroFlip(p, hero, p._facing);
  const moving = Math.abs(p.body.velocity.x) > 20;

  // Left standing long enough he finds something to do with his hands —
  // Eterwolf the guitar off his back, Wolffel a burger out of his side pocket.
  // Each character names its own and how long it takes to get bored.
  if (moving || !onGround) {
    p._restSince = 0; p._longIdleDone = false; p._idleLooped = false;
  }
  else if (!p._restSince) p._restSince = now;
  // `noLongIdle` still exists for a stage that wants it, but no stage sets it
  // any more. Every walking stage did, on the reasoning that a tutorial says
  // what it teaches and nothing else — which also meant Wolffel never once got
  // the burger out and Eterwolf never played a note, in the entire game. The
  // flourish is most of the character; suppressing it everywhere was throwing
  // out the thing it was written for.
  const allowLong = !(scene.cfg && scene.cfg.noLongIdle);
  if (hero && hero.longIdleOnce && p._curAnim &&
      p._curAnim.indexOf('-' + hero.longIdle) === 2 && !p.anims.isPlaying) {
    p._longIdleDone = true;
    // Round again rather than done forever, if the character asks for it.
    if (hero.idleLoopFrom != null) { p._idleLooped = true; p._restSince = scene.time.now; }
  }

  if (p._real) {
    // picking himself up owns the sprite until it finishes
    if (now < (p._downUntil || 0)) { p.setVelocityX(0); return move; }
    // So does a sword swing. Without this the next frame re-picked idle or
    // walk, saw it differed from the sword clip, and played over it — the
    // swing was cut off a frame after it started, which is why pressing the
    // button looked like it did nothing.
    if (now < (p._swingUntil || 0)) { if (onGround) p.setVelocityX(0); return move; }

    // Off the ground but only just — stepping down a 3px ledge on the bridge's
    // humped road leaves the floor for three frames. That is not a jump, and
    // it flashed the jump pose at every step. The air pose waits for a real
    // jump (going up) or a real fall (90ms off the ground).
    const airborne = !onGround &&
      (p.body.velocity.y < -40 || now - (p._airSince || now) > 90);
    // The gun out: he aims it standing and fires it on the move, and holds it
    // up for a moment after the last shot rather than dropping his arm at once.
    const gunUp = now < (p._gunUntil || 0);
    const want = dashing ? 'dash'
               : airborne ? airAction(hero, p.body.velocity.y, p)
               : now < (p._landUntil || 0) ? 'land'
               : gunUp     ? (moving ? 'runshoot' : 'shoot')
               : moving    ? (sprint ? 'run' : 'walk')
               : idlePose(hero, p._restSince, now, p._longIdleDone, allowLong,
                           p._idleLooped);
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
      ['CONTINUE', () => this._continue()],
      ['FULLSCREEN', () => toggleFullscreen()],
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

  // Back to the start of the last stage you reached, as you were when you
  // reached it.
  _continue() {
    const c = loadCheckpoint();
    if (!c || !this.scene.get(c.scene)) { this._toast('No save file found.'); return; }
    resetProgress();
    Object.assign(GameState, c.state, { seen: Object.assign({}, c.state.seen || {}) });
    if (GameState.hasSwords || GameState.hasWeapon) showBladeUnlocked();
    Sfx.ensure(); Sfx.select();
    stopMusic(600);
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start(c.scene, Object.assign({}, c.data, { cast: GameState.castId })));
  }

  _newGame() {
    resetProgress();
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
    this.cameras.main.fadeIn(260, 0, 0, 0);
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
  { who: 'ETERWOLF', text: "..." },
  { who: 'WOLFFEL',  text: "..." },
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
    // The panel was written for the one conversation at the front of the game
    // and had that conversation, its backdrop and the scene after it all
    // baked in. It is the same two faces and the same bar wherever the
    // brothers talk, so it now takes them as data:
    //   lines   the conversation, same shape as INTRO_LINES
    //   target  the scene to start when it ends
    //   bgKey   the picture behind the frame
    //   sleeper who is out cold (only the opening has one)
    //   hold    how long to sit on the picture before the bar rises
    // Nothing passed = the opening, exactly as it was.
    const d = this.sys.settings.data || {};
    this.lines = (d.lines && d.lines.length) ? d.lines : INTRO_LINES;
    this.target = d.target || 'BunkerScene';
    this.sleeper = d.sleeper !== undefined ? d.sleeper : SLEEPER;
    this.bgKey = d.bgKey || 'scene_bunker';
    this.holdMs = d.hold != null ? d.hold : 1500;
    // Mid-game there is no music to stop and the cut into it is a beat, not a
    // curtain, so the fades are shorter than the opening's.
    this.fadeMs = d.fadeMs != null ? d.fadeMs : 900;

    // OVERLAY: the conversation runs on top of a stage that keeps playing
    // underneath, instead of cutting away to a still. Used where something has
    // to happen IN the room while they talk — the thing in the corner getting
    // up on its line. So no background colour of its own (that would black the
    // stage out), no camera fade (same), and it hands back with a callback
    // instead of starting a scene. `onLine(index, line)` fires as each line
    // begins; `barTop` moves the bar to the top of the screen, clear of
    // whatever is standing in the middle of the floor.
    this.overlay = !!d.overlay;
    this.barTop = !!d.barTop;
    this.onLine = d.onLine || null;
    this.onDone = d.onDone || null;
    if (!this.overlay) {
      this.cameras.main.setBackgroundColor('#0a0807');
      this.cameras.main.fadeIn(this.fadeMs, 0, 0, 0);
    } else {
      this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    }
    // The opening takes the menu theme down with it. A cut out of a stage and
    // back has no music of its own to stop, and stopping it would silence the
    // stage it returns to.
    this.keepMusic = !!d.keepMusic;
    if (!this.keepMusic) stopMusic(400);

    if (!this.overlay && this.textures.exists(this.bgKey)) {
      const bg = this.add.image(W / 2, H / 2, this.bgKey).setDepth(-20);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    }
    // Over a live stage the scrim is light, so what is happening in the room
    // still reads through it.
    this._scrim = this.add.rectangle(W / 2, H / 2, W, H, 0x0a0807,
                                     this.overlay ? 0.22 : 0.5).setDepth(-15);

    this._ui = [];                       // bar + figures, faded in after the beat
    this._buildPanel(W, H);

    this.portraits = {
      // Over a live stage the brothers stand smaller, right out in the bottom
      // corners, so the middle of the room — where the thing is — stays clear.
      // Full size they cover a third of the screen each side, and the thing
      // stood up behind Eterwolf's shoulder where nobody could see it.
      WOLFFEL:  this._portrait('WOLFFEL', this.overlay ? 150 : 238),
      ETERWOLF: this._portrait('ETERWOLF', this.overlay ? 1180 : 1042)
    };
    Object.keys(this.portraits).forEach(k => this._scheduleBlink(k));

    // He is still out cold when the scene opens, so he holds his eyes shut and
    // sits lower and unlit until the line that wakes him.
    this._awake = !this.sleeper;
    const sleeper = this.sleeper ? this.portraits[this.sleeper] : null;
    if (sleeper && sleeper.img && this.textures.exists(sleeper.closedKey)) {
      sleeper.img.setTexture(sleeper.closedKey);
    }

    // Hold on the bunker first so the room is actually seen — the
    // frame covers that corner once it rises.
    this._ui.forEach(o => o.setAlpha(0));
    this._idx = 0;
    this._started = false;
    // Phaser builds each scene in the config list ONCE and reuses the
    // instance, so `_done` survives from the last conversation into the next
    // one. Left set, the second conversation types its first line and then
    // ignores space, click, ENTER, SKIP and ESC forever, because every one of
    // them bails on `_done` — the scene is alive, on screen, and unusable.
    // It was invisible while there was only ever one conversation.
    this._done = false;
    this._typing = false;
    this.time.delayedCall(this.holdMs, () => this._begin());

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
    // ESC or SKIP during the hold has already finished the conversation.
    if (this._started || this._done) return;
    this._started = true;
    this._ui.forEach(o => this.tweens.add({ targets: o, alpha: 1, duration: 420 }));
    this._show();
  }


  _buildPanel(W, H) {
    // A narrow bar sits between the two figures rather than spanning the
    // screen, so the scene and both characters stay visible around it.
    const w = 620, h = Math.round(w * 724 / 2172);       // frame art is 3:1
    const x = Math.round((W - w) / 2), y = this.barTop ? 26 : H - h - 26;
    this._panel = { x, y, w, h };
    // the hint and SKIP sit just under the bar, wherever the bar is
    const underY = this.barTop ? y + h + 22 : H - 6;

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

    // The hint and the button sit as one row under the panel, straddling its
    // centre line — which is what keeps them reading as belonging to the
    // panel rather than parked in a corner.
    this._hint = this.add.text(W / 2 - 10, underY, 'SPACE / CLICK — NEXT', {
      fontFamily: F_UI, fontSize: '9px', fontStyle: '500', color: '#6b5a48'
    }).setOrigin(1, 1).setDepth(22);

    // Out of the conversation altogether. ESC has always done this, but only a
    // line of grey text along the bottom said so, which is not something
    // anyone reads while two brothers are talking at them. The pad's Start
    // reaches it too, because Start is ESC.
    //
    // Just above the panel's right corner rather than away in the top of the
    // screen: it belongs to the conversation, so it sits where the
    // conversation is and where the eye already is.
    // Under the panel and just right of its centre line, paired with the hint:
    // it belongs to the conversation, so it sits with it rather than off at an
    // edge of the screen. Depth 30 keeps it above the brothers at 25.
    this._skip = this.add.text(W / 2 + 10, underY + 2, 'SKIP  ▸', {
      fontFamily: F_UI, fontSize: '11px', fontStyle: '700', color: '#f5c169',
      backgroundColor: '#1a1410', padding: { x: 10, y: 4 }
    }).setOrigin(0, 1).setDepth(30).setAlpha(0.9);
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

    // standing y for the speaker; listeners drop 12 below it, a sleeper 40
    this._figY = this.overlay ? 415 : 232;
    if (this.textures.exists(openKey)) {
      img = this.add.image(x, this._figY, openKey).setOrigin(0.5, 0).setDepth(25);
      img.setScale((this.overlay ? 350 : 560) / img.height);
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
      if (id === this.sleeper && !this._awake) { this._scheduleBlink(id); return; }   // still out
      if (p.img && this.textures.exists(p.closedKey)) {
        p.img.setTexture(p.closedKey);
        this.time.delayedCall(150, () => { if (p.img) p.img.setTexture(p.openKey); });
      }
      this._scheduleBlink(id);
    });
  }

  _show() {
    if (this._idx >= this.lines.length) return this._finish();
    const line = this.lines[this._idx];
    if (this.onLine) { try { this.onLine(this._idx, line); } catch (e) {} }
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
      const asleep = k === this.sleeper && !this._awake;
      const on = !asleep && k === line.who;
      this.tweens.add({
        targets: p.img, y: this._figY + (asleep ? 40 : (on ? 0 : 12)),
        duration: line.wake && k === this.sleeper ? 500 : 220, ease: 'Sine.easeOut'
      });
      p.img.setTint(asleep ? 0x4a443e : (on ? 0xffffff : 0x6e6660));
      if (line.wake && k === this.sleeper && this.textures.exists(p.openKey)) p.img.setTexture(p.openKey);
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
        if (!spoken && !line.silent && i % 3 === 0) Sfx.type();
        if (i >= line.text.length) { this._typing = false; this._more.setAlpha(0.8); }
      }
    });
  }

  _advance() {
    if (this._typing) {                       // first press completes the line
      if (this._typeEv) this._typeEv.remove();
      this._body.setText(this.lines[this._idx].text);
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
    if (!this.keepMusic) stopMusic(900);
    if (this.overlay) {
      // fade the bar, the brothers and the scrim, then hand the stage back
      const all = this._ui.concat([this._scrim, this._hint, this._skip, this._more,
                                   this._name, this._body]).filter(Boolean);
      this.tweens.add({ targets: all, alpha: 0, duration: this.fadeMs,
        onComplete: () => {
          const cb = this.onDone;
          this.scene.stop();
          if (cb) cb();
        } });
      return;
    }
    this.cameras.main.fadeOut(this.fadeMs, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete',
      () => this.scene.start(this.target, this.sys.settings.data &&
                             this.sys.settings.data.targetData || undefined));
  }
}

// ================================================================== //
//  EXPLORATION SCENE BASE (bunker + city + shop share this)          //
// ================================================================== //
class WalkScene extends Phaser.Scene {
  // subclasses set cfg and call buildWalk() in create()
  // Is there a floor slab (not a ledge) under this x? Gaps are cut out of it.
  _floorUnder(x) {
    const WW = this.worldW || 1e9;
    return !((this.cfg.gaps || []).some(g => x >= g.atFrac * WW && x <= (g.atFrac + g.wFrac) * WW));
  }

  buildWalk(cfg) {
    this.cfg = cfg;
    // Scenes are reused, so a hold left on by the last run (a restart during
    // a scripted beat) would start this one with the player frozen.
    this._holdInput = false;
    this._inConversation = false;
    const H = 720;                       // the view
    // The world may be taller than the view. Everywhere else it is not, and
    // the camera is pinned vertically as a result — which is fine on a street
    // and wrong anywhere he jumps properly, because he leaves the top of the
    // frame and you lose him at the one moment you need to see him. Give a
    // stage some headroom and the camera follows him up into it.
    const WH = cfg.worldH || H;
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
      // Kept, so a stage can tone its own painting down. The bridge does.
      this.bgImage = img;
      // Some paintings carry dead space along the bottom — the village road has
      // 121 near-black rows under the picture, 15.8% of its height. Pinning the
      // image's bottom edge to the screen put that band across the lower fifth
      // of the frame. `bgContentFrac` says where the picture actually stops, and
      // the scale is taken from THAT rather than the file's height, so the
      // content fills the view and the dead rows fall off below it.
      const cf = cfg.bgContentFrac || 1;
      const s = (H / (img.height * cf)) * zoom;
      img.setScale(s);
      // Its bottom sits on the bottom of the WORLD, not of the view.
      img.y = WH - img.height * s * cf;
      // A stage that wants headroom above its art has to supply art that
      // covers it — bgZoom past 1 — because nothing convincing can be
      // invented up there. Filling the band with the picture's average top
      // colour leaves a seam; stretching its top rows up turns the skyline in
      // them into vertical streaks. Both were tried and both looked worse
      // than the problem. If a band is left it stays the page's black.
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
      groundY = Math.round(WH * (cfg.groundFrac != null ? cfg.groundFrac : 0.83));
    }
    this.worldW = WW;
    this.cfg.worldW = WW;

    this.physics.world.setBounds(0, 0, WW, WH);
    this.cameras.main.setBounds(0, 0, WW, WH);

    this.groundY = groundY;

    // The floor is built in segments so a stage can open holes in it. With no
    // gaps declared that is one slab across the world, exactly as before.
    this.solidsW = [];
    // The floor on its own, too. An enemy walks the floor and nothing else —
    // it does not climb onto a balcony after you, and a mover sliding past
    // would otherwise scoop one up and carry it off.
    this.floorsW = [];
    const gaps = (cfg.gaps || []).map(g => ({
      x0: g.atFrac * WW, x1: (g.atFrac + g.wFrac) * WW
    })).sort((a, b) => a.x0 - b.x0);
    let cursor = 0;
    const slab = (x0, x1) => {
      if (x1 - x0 < 4) return;
      const f = this.add.rectangle((x0 + x1) / 2, groundY + 40, x1 - x0, 80, 0x000000, 0).setDepth(-1);
      this.physics.add.existing(f, true);
      this.solidsW.push(f);
      this.floorsW.push(f);
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
      const c = box.body.checkCollision;
      if (L.ceiling) {
        // A floor you stand on AND a ceiling you hit your head on, but no
        // walls: a slab. Jump up under it and you stop dead instead of
        // passing through to stand on top, which is what a one-way ledge
        // lets you do. The sides stay open so you are never caught on its
        // corner jumping up past its end.
        c.left = false; c.right = false;
      } else if (!L.solid) {
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

    // Stand him on whatever is actually solid under where he starts, not on
    // the stage's floor line. On a street those are the same thing; on a stage
    // built out of ledges they are not, and the shop street proved it — he
    // began over the high roadway at the pavement's height, which is BELOW
    // that roadway, dropped through it (a one-way ledge only catches from
    // above) and fell out of the world before the scene had finished fading
    // in. Anything that opens on a surface other than the floor line hit this.
    // ...unless the stage says he comes in through a door on the floor. The
    // store has a balcony running the length of its left wall, so the topmost
    // surface above the entrance is that balcony, and he arrived from the
    // street standing on it.
    let standY = groundY;
    let lowest = null;          // a surface BELOW the floor line, if that is all there is
    if (!cfg.startOnFloor) (this.solidsW || []).forEach(o => {
      if (!o || !o.body) return;
      const b = o.body;
      if (startX < b.x || startX > b.x + b.width) return;
      // the highest surface at that x that is not below the floor line
      if (b.y <= groundY + 2 && b.y < standY) standY = b.y;
      else if (b.y > groundY + 2 && (lowest === null || b.y < lowest)) lowest = b.y;
    });
    // A stage with no floor slab under the start — the bridge, whose road is
    // humped and LOWER at its ends than its deck line — would otherwise drop
    // him in from the deck line: 22px of fall and a landing on every entry.
    // If nothing at or above the floor line is under him, stand on what is.
    if (standY === groundY && lowest !== null && !this._floorUnder(startX)) standY = lowest;
    this.player = makeWalker(this, startX, standY, charH, this.castId);
    this.charH = charH;
    this._buildBeats(cfg);
    this._initCombat();
    this.solidsW.forEach(f => this.physics.add.collider(this.player, f));
    // The sword, in every walking stage — not only the ones with something to
    // cut. It lived in the storage rooms alone, so opening the chest gave you
    // blades you could not swing anywhere else. F or right-click; nothing
    // happens until the blades are yours.
    this._nextSwingAt = 0;
    this.input.keyboard.on('keydown-F', () => this.swingBlade());
    this.input.on('pointerdown', p => { if (p.rightButtonDown()) this.swingBlade(); });
    if (this.input.mouse) this.input.mouse.disableContextMenu();
    this._safeX = startX; this._safeY = null;
    // ---- collision overlay (F11) ---------------------------------------
    // Every surface in this game is guessed at from a painting, and guessing
    // by eye has put floors in the wrong place on three stages running. This
    // draws what the physics actually thinks is solid, on top of the picture,
    // so the two can be compared instead of argued about.
    this._solidsDebug = this.add.graphics().setDepth(60).setVisible(false);
    this.input.keyboard.on('keydown-F11', () => {
      this._solidsDebug.setVisible(!this._solidsDebug.visible);
      this._drawSolids();
    });

    this.cameras.main.startFollow(this.player, false, 0.1, 0.1);
    this.cameras.main.setDeadzone(160, 100);

    // input
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,M,E,ENTER,R,K');
    this.input.keyboard.on('keydown-N', () => Sfx.toggleMute());
    // Not during a scripted beat or a conversation laid over the stage: the
    // restart would happen under it and leave it talking over a reset room.
    // Nor while he is down or the stage is already leaving: the death restart
    // is on its way, and a second exit racing it left two scenes running.
    if (cfg.canReset) this.input.keyboard.on('keydown-R', () => {
      if (this._holdInput || this._inConversation || this._dead || this._transitioning) return;
      this._transitioning = true;
      this.resetStage();
    });
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

    // ESC returns to menu — except while a conversation is running over the
    // stage, where ESC belongs to the conversation (it skips it) and would
    // otherwise do both at once.
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._inConversation || this._transitioning) return;
      // Down, ESC still goes to the menu — and takes the pending restart with it.
      if (this._downTimer) { this._downTimer.remove(); this._downTimer = null; }
      this._transitioning = true;
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
        // Cut to the painted opening where the stage gives a box to read it
        // from; the soft slab otherwise.
        const shaped = (f && bg && ex.glowShape !== false)
          ? holeGlowTexture(this, cfg.bgKey, f) : null;
        if (f && bg) {
          // the padded box the texture was cut from, so the falloff it
          // contains lands where it was sampled from
          const g = shaped ? shaped.box : f;
          gw = (g.x1 - g.x0) * bg.w;
          gh = (g.y1 - g.y0) * bg.h;
          gx = bg.x + (g.x0 + g.x1) / 2 * bg.w;
          gy = bg.y + (g.y0 + g.y1) / 2 * bg.h;
        } else {
          gw = ex.glowW || 150; gh = ex.glowH || 260;
          gy = groundY - (ex.glowY != null ? ex.glowY : gh / 2);
        }
        glow = this.add.image(gx, gy, shaped ? shaped.key : 'doorglow')
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
      // An exit with nothing to say does not get a caption. A lit doorway is
      // already telling you it is a doorway.
      const lbl = !ex.label ? null : this.add.text(ex.x, this.markerY + 34, ex.label, {
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
    // The hint bar does not offer a jump the stage has not given you yet.
    // Nor a sword or a gun before they are yours.
    this._hintBar = this.add.text(640, 692, this._hintText(),
      { fontFamily: F_UI, fontSize: '10px', fontStyle: '500', color: '#8a6f4a' })
      .setOrigin(0.5, 1).setScrollFactor(0).setDepth(40).setAlpha(0.85);

    // film grain
    if (this.textures.exists('grain_0')) {
      this.grain = this.add.tileSprite(640, 360, 1280, 720, 'grain_0')
        .setScrollFactor(0).setDepth(48).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD);
      this._gf = 0;
    }
    this._transitioning = false;
    // Every stage is a checkpoint: CONTINUE puts you back at its start.
    saveCheckpoint(this.scene.key, this.sys.settings.data);
  }

  // The controls the stage actually has right now. Rebuilt when one is
  // unlocked mid-stage (the burnt street gives you the jump after the blast).
  _hintText() {
    const cfg = this.cfg || {};
    const arms = (armedWithBlade() ? '   ·   F SWORD' : '') +
                 (GameState.hasPistol ? '   ·   LMB / K SHOOT' : '');
    return 'A/D WALK   ·   SHIFT RUN' + (cfg.noJump ? '' : '   ·   W JUMP') +
           '   ·   E ENTER' + arms + '   ·   N MUTE   ·   M EDIT';
  }

  _refreshHint() { if (this._hintBar) this._hintBar.setText(this._hintText()); }

  // Put the stage back the way it started, keeping whoever you are playing.
  resetStage() {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.restart(this._keepData({ cast: this.castId })));
  }

  // What a restart carries over. Normally only the brother; a stage in the
  // middle of a set piece (`cfg.keep`) — the fight in the storage room, the
  // horde in the tienda — restarts INTO that set piece rather than back at the
  // start of the room, whether it was R, the cast buttons or dying that did it.
  _keepData(extra) {
    return Object.assign({}, (this.cfg && this.cfg.keep) || {}, extra || {});
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
        if (this._holdInput || this._inConversation || this._dead || this._transitioning) return;   // same reason as R
        this._transitioning = true;
        Sfx.ensure(); Sfx.select();
        GameState.castId = c.id;
        this.cameras.main.fadeOut(180, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete',
          () => this.scene.restart(this._keepData({ cast: c.id })));
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
  _drawSolids() {
    const g = this._solidsDebug;
    if (!g || !g.visible) return;
    g.clear();
    (this.solidsW || []).forEach(o => {
      if (!o || !o.body) return;
      const b = o.body;
      const oneWay = b.checkCollision && b.checkCollision.down === false;
      g.fillStyle(oneWay ? 0x4fc3f7 : 0x7cff6b, 0.20);
      g.fillRect(b.x, b.y, b.width, b.height);
      g.lineStyle(2, oneWay ? 0x4fc3f7 : 0x7cff6b, 0.95);
      g.strokeRect(b.x, b.y, b.width, b.height);
      // the top edge is the part that matters — that is what he stands on
      g.lineStyle(3, 0xffffff, 0.9);
      g.lineBetween(b.x, b.y, b.x + b.width, b.y);
    });
    const p = this.player && this.player.body;
    if (p) {
      g.lineStyle(2, 0xff5252, 0.95);
      g.strokeRect(p.x, p.y, p.width, p.height);
    }
  }

  // Out of the world. The old rule put him back at the last place he stood
  // still, 120px above the stage's floor line — which is solid ground on a
  // street and thin air anywhere the floor line is not where he was standing.
  // That is the floating: dropped at a height nothing holds him at, on a
  // stage whose surfaces are ledges rather than one slab.
  //
  // So a stage may say where a fall puts him back, and by default it is a
  // clean restart of the stage, with everything already played kept played —
  // no second earthquake to sit through because you missed a jump.
  _catchFall() {
    const wh = (this.cfg && this.cfg.worldH) || 720;
    const body = this.player.body;
    if (this._transitioning || !body) return;
    // Out of the world is not "fallen past the bottom of it". The player
    // collides with the world bounds, so he never gets past them — he lands on
    // the invisible floor at the foot of the level, below anything painted,
    // and stands there. That is the being-stuck-in-the-void: this used to
    // wait for him to fall through a bottom he physically cannot reach, so it
    // never ran at all.
    //
    // Resting on that bottom edge IS the fall.
    const onWorldFloor = body.bottom >= wh - 3;
    if (!onWorldFloor && this.player.y < wh + 90) return;
    if (this.cfg && this.cfg.fallRestart) {
      this._transitioning = true;
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const d = this.sys.settings.data || {};
        // `resumed` is what tells the stage that its set pieces have already
        // happened, so they are not played at you a second time.
        this.scene.restart(Object.assign({}, d, { resumed: true }));
      });
      return;
    }
    this.player.setVelocity(0, 0);
    this.player.setPosition(this._safeX, this._safeY != null ? this._safeY
                                                             : this.groundY - 120);
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
      if (b.needs === 'radio' && GameState.seen['bunker-radio']) { b.fired = true; continue; }
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

  update(time, delta) {
    const now = this.time.now;
    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    // the last place he stood, to put him back if he misses a jump
    // Both coordinates: putting him back at the right x and the wrong y is
    // how he ends up in the air over a hole he just fell through.
    if (onGround && Math.abs(this.player.body.velocity.x) < 40) {
      this._safeX = this.player.x; this._safeY = this.player.y;
    }
    this._catchFall();
    if (this._solidsDebug && this._solidsDebug.visible) this._drawSolids();
    // A stage can take the controls for a scripted beat — the bridge does it
    // while the span comes down, so the earthquake happens TO him rather than
    // being something he can walk through and out the other side of.
    // Down, he stays down: nothing drives him and nothing opens.
    if (this._dead) {
      this.player.setVelocityX(0);
      this._runBeats();
      this._updateCombat(now, delta);
      return;
    }
    // A set piece can throw him while it holds the controls (the Twingo does);
    // the throw plays out rather than being stopped dead on the next frame.
    if (this._holdInput) { if (now >= (this.player._knockUntil || 0)) this.player.setVelocityX(0); }
    // A hit throws him. driveWalker sets his speed every frame, which would
    // cancel the knock on the very next one — so for its length, nothing does.
    else if (now < (this.player._knockUntil || 0)) { /* the hit carries him */ }
    else if (!this._transitioning) driveWalker(this, this.player, this.keys, onGround);
    this._runBeats();
    this._updateGun(now);
    this._updateCombat(now, delta);

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
      showBladeUnlocked();       // the gun route carries a blade too
      this.tweens.killTweensOf(this.pickup);
      this.tweens.killTweensOf(this.pickupGlow);
      this.pickup.destroy(); this.pickupGlow.destroy(); this.pickupHint.destroy();
      this.pickup = null; this.pickupGlow = null; this.pickupHint = null;
      this.acquireWeapon(this.cfg.pickup.name);
    }

    // exit prompts + trigger
    // K as well, so the pad's X — the button that does things in combat —
    // also opens a door out here.
    // Not K once there is a pistol: K fires it, and firing beside a door
    // would otherwise walk you through it.
    const enterPressed = Phaser.Input.Keyboard.JustDown(this.keys.E)
                      || (!GameState.hasPistol && Phaser.Input.Keyboard.JustDown(this.keys.K))
                      || Phaser.Input.Keyboard.JustDown(this.keys.UP)
                      || Phaser.Input.Keyboard.JustDown(this.keys.W);
    this.exitMarkers.forEach(({ m, lbl, glow, ex }) => {
      // An exit that only exists once something has happened — the way back
      // out of the storage rooms, once the thing in them is dead. Until then
      // it is not there at all: no marker, no glow, no walking off the edge.
      if (ex.when && !ex.when.call(this)) {
        ex._gated = true;
        if (m) m.setAlpha(0);
        if (lbl) lbl.setAlpha(0);
        if (glow) glow.setAlpha(0);
        return;
      }
      // Opened this frame. If he is already standing at it — the fight ended
      // by the door — it arms the moment he walks toward it, rather than
      // making him walk away and come back.
      if (ex._gated) {
        ex._gated = false;
        ex._armOnApproach = true;
      }
      if (ex._armOnApproach && !ex._armed) {
        const vx = this.player.body.velocity.x;
        if (Math.abs(vx) > 20 && Math.sign(vx) === Math.sign(ex.x - this.player.x)) ex._armed = true;
      }
      // a combat exit that needs the weapon stays locked until it's picked up
      // Or by the story: a door that stays shut until something has happened
      // (`locked` returns true while it should), saying why in `lockedLabel`.
      const locked = (ex.needWeapon && !GameState.hasWeapon) ||
                     (ex.locked ? !!ex.locked.call(this) : false);
      // hideLocked exits don't exist at all until unlocked (no marker, no message)
      if (locked && ex.hideLocked) {
        if (m) m.setAlpha(0);
        if (lbl) lbl.setAlpha(0);
        if (glow) glow.setAlpha(0);
        return;
      }
      const d = Math.abs(this.player.x - ex.x);
      const near = d < (ex.w || 90);
      // Arm it only once he has stood clear of it. Stages now open a step
      // inside their own edge and carry a way back out of that edge, so
      // without this the entrance he arrives through fires immediately and
      // bounces him straight back where he came from.
      if (!ex._armed && d > (ex.w || 90) + 70) ex._armed = true;
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
          lbl.setText(locked ? (ex.lockedLabel || 'GRAB THE WEAPON FIRST') : ex.label);
          lbl.setColor(locked ? '#c93b2a' : '#d9c7a8');   // lbl may be null
        }
        // auto exits fire just by running into them; others want E/W/up
        // Arming gates the AUTO exits only. A door you have to press E at
        // cannot bounce you, so gating those too would just mean standing in
        // a doorway you arrived at and not being able to go back through it.
        // Never while a conversation or a set piece has the controls.
        const busy = this._transitioning || this._holdInput || this._inConversation;
        if (!locked && (ex.auto ? ex._armed : enterPressed) && !busy)
          this.goExit(ex);
        else if (locked && enterPressed && !busy && ex.onLocked) ex.onLocked.call(this);
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

  // A sword swing in a walking stage: the brother's own sword clip — the katana
  // for Eterwolf, the greatsword for Wolffel — and a cut against whatever is
  // in front of him and in reach: an enemy first, and a cord if there is none.
  // Swings that follow each other inside the combo window run down his chain
  // (sword, sword2, sword3), so a flurry reads as a flurry and not the same
  // cut three times.
  swingBlade() {
    const now = this.time.now;
    if (!armedWithBlade()) return;
    if (!this.player || this._dead || now < (this._nextSwingAt || 0) ||
        this._holdInput || this._transitioning) return;
    this._nextSwingAt = now + 380;
    const p = this.player, hero = p._hero;
    const chain = ['sword', 'sword2', 'sword3'].filter(a => heroHas(hero, a));
    this._comboStep = (chain.length && now < (this._comboUntil || 0))
      ? ((this._comboStep || 0) + 1) % chain.length : 0;
    this._comboUntil = now + COMBO_WINDOW_MS;
    const act = chain[this._comboStep] || 'sword';
    Sfx.ensure(); Sfx.sword();
    if (hero && p._real) {
      const key = playAction(p, hero, act, p._facing);
      p._curAnim = key;
      const a = this.anims.get(key);
      p._swingUntil = now + ((a && a.duration) || 340) + 40;
      this._swingUntil = p._swingUntil;
    }
    const dir = p._facing || 1;
    // An enemy in reach takes it: the nearest one in front, within an arm and
    // a blade of him, and at his height.
    const foe = this._foeInReach(dir);
    if (foe) {
      this.hitEnemy(foe, SWORD_DMG_WALK, dir, true);
      this.cameras.main.shake(70, 0.004);
      return;
    }
    // One swing cuts ONE thing: the nearest cord in front of him and in
    // reach. With the cords standing close together a swing used to hit every
    // one in reach, which cut through the first wall into the next.
    const reach = 1.1 * HUMAN_M * (this.pxPerM || 144);
    let best = null, bestD = Infinity;
    (this.cuttables || []).forEach(c => {
      if (c.dead) return;
      const dx = c.im.x - p.x;
      if (dx * dir < -20 || Math.abs(dx) > reach) return;
      // a full-height cord spans the room, so only check height for short ones
      if (!c.full && Math.abs(p.y - c.im.y) > 1.4 * HUMAN_M * this.pxPerM) return;
      if (Math.abs(dx) < bestD) { bestD = Math.abs(dx); best = c; }
    });
    if (best) this.cutOnce(best);
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
    // Short. One stage running into the next is a step, not a scene change,
    // and 450 out plus 600 in is a second of black every time you walk off
    // the edge of a screen — which is what made the walk feel broken up.
    this.cameras.main.fadeOut(ex.fadeMs || 260, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const target = ex.kind === 'combat' ? 'GameScene' : ex.target;
      this.scene.start(target, Object.assign({}, ex.data || {},
        ex.spawnXFrac != null ? { spawnXFrac: ex.spawnXFrac } : {}));
    });
  }
}

// ================================================================== //
//  COMBAT IN A WALKING STAGE                                          //
//                                                                     //
//  The fights happen in the rooms themselves now — the storage room   //
//  as it was lit a moment ago, the tienda you walked through — not in //
//  a combat arena tiled out of copies of the painting. So a walking   //
//  stage gets what a fight needs: hearts, a blade that hurts things,  //
//  a pistol, the alien, and what is left of the alien when it dies.   //
//  Every size here is in the stage's own scale, so the same fight     //
//  reads the same in a 156 px/m storeroom and a 92 px/m shop.         //
// ================================================================== //
const WALK_HP         = 5;
const WALK_INVULN_MS  = 950;
const WALK_ALIEN_HP   = 6;       // two cuts, or six rounds
const SWORD_DMG_WALK  = 3;
const PISTOL_DMG      = 1;
const PISTOL_CD       = 210;
// What a kill leaves: the clip runs the body down into a pool of acid, and the
// pool stays this long before it dries up.
const ACID_HOLD_MS    = 7000;
const ACID_TICK_MS    = 1000;    // a heart burned for every this-long stood in it
const ACID_HEAL_MS    = 900;     // and one back for every this-long on the move out of it
// The two clips cut out of the supplied gifs, each onto a grid sheet with a box
// shared by every frame. Every frame was stood on its own lowest solid row, so
// the body is always on the floor — the gif's puddle is drawn 33px higher than
// the feet it starts from, and anchored by the feet the acid floated.
//   death enemy 1.gif     25 frames: it falls back, melts, pools, dries up
//   first encounter enemy.gif  20: it turns to you and opens its claws
const ALIEN_DEATH_SHEET = { key: 'scene_aliendeath', n: 25, cols: 5, cw: 246, ch: 247,
                            foot: 243, cx: 118.5, standH: 244 };
const ALIEN_FACE_SHEET  = { key: 'scene_alienface', n: 20, cols: 5, cw: 214, ch: 247,
                            foot: 243, cx: 109.5, standH: 244 };

// Name the frames of a grid sheet on its texture, once.
function sheetFrames(scene, S, prefix) {
  if (!scene.textures.exists(S.key)) return null;
  const tex = scene.textures.get(S.key);
  const out = [];
  for (let i = 0; i < S.n; i++) {
    const name = prefix + i;
    if (!tex.has(name)) {
      tex.add(name, 0, (i % S.cols) * S.cw, Math.floor(i / S.cols) * S.ch, S.cw, S.ch);
    }
    out.push({ key: S.key, frame: name });
  }
  return out;
}

function alienClips(scene) {
  const die = sheetFrames(scene, ALIEN_DEATH_SHEET, 'ad');
  if (die && !scene.anims.exists('alien-die')) {
    // down into the pool quickly; the drying-up is slow and comes later
    scene.anims.create({ key: 'alien-die', frames: die.slice(0, 16), frameRate: 9, repeat: 0 });
    scene.anims.create({ key: 'alien-dry', frames: die.slice(16), frameRate: 5, repeat: 0 });
  }
  const face = sheetFrames(scene, ALIEN_FACE_SHEET, 'ae');
  if (face && !scene.anims.exists('alien-face')) {
    scene.anims.create({ key: 'alien-face', frames: face, frameRate: 6, repeat: 0 });
    // then it just stands there, claws out, breathing
    scene.anims.create({ key: 'alien-stand', frames: face.slice(8), frameRate: 5,
                         repeat: -1, yoyo: true });
  }
}

const WalkCombat = {
  // Every stage, every visit: the scene object is reused, so nothing from the
  // last fight may still be standing in this one.
  _initCombat() {
    this.enemies = [];
    this.bullets = [];
    this.acids = [];
    this.hearts = null;
    this._combat = false;
    this._dead = false;
    this._nextFireAt = 0;
    this._comboStep = 0;
    this._comboUntil = 0;
    this._gunDrop = null;
    this._downTimer = null;
    this.onEnemyKilled = null;
    // A left click is a shot only if it did not land on a button — SKIP, the
    // cast switch — which would otherwise fire as well as press.
    this._ptrFire = false;
    this.input.on('pointerdown', (ptr, over) => { this._ptrFire = ptr.button === 0 && !over.length; });
    this.input.on('pointerup', () => { this._ptrFire = false; });
    this.onPistol = null;
    alienClips(this);
  },

  // How tall the alien stands here: a shade under the brothers, the same
  // proportion as the creature that gets up in the corner.
  alienH() { return 0.95 * HUMAN_M * (this.pxPerM || 144); },

  // The hearts come up with the first enemy, not before — a stage with nothing
  // in it that can hurt you does not show you your health.
  startCombat() {
    if (this._combat) return;
    this._combat = true;
    this.hp = WALK_HP;
    this.maxHp = WALK_HP;
    this._burn = 0;
    this._invulnUntil = 0;
    this._acidTickAt = 0;
    this._healAt = 0;
    this._inAcid = false;
    this.hearts = [];
    for (let i = 0; i < this.maxHp; i++) {
      this.hearts.push(this.add.image(30 + i * 30, 30, 'heart').setScrollFactor(0).setDepth(60));
    }
    this._paintHearts();
  },

  // Full, burned (green — it comes back if you keep moving) or gone.
  _paintHearts() {
    if (!this.hearts) return;
    this.hearts.forEach((h, i) => {
      if (i < this.hp) h.setAlpha(1).clearTint();
      else if (i < this.hp + this._burn) h.setAlpha(0.75).setTint(0xa8d63c);
      else h.setAlpha(0.18).clearTint();
    });
  },

  enemiesAlive() { return this.enemies.filter(z => z.active && z._alive).length; },

  // The alien, out of the same frames and clips as the combat scene's, with
  // its numbers given in its own height: `speed` and `rage` are heights a
  // second, calm and after it has been hurt.
  spawnAlien(o) {
    const H = this.alienH(), s = H / 244;
    const E = window.ENEMIES && window.ENEMIES.alien;
    const body = E ? E.body : { w: 43, h: 236, x: 102, y: 6 };
    const floorY = this.groundY;
    // stood on the floor unless it is coming from somewhere else
    const y = o.y != null ? o.y : floorY - (body.y + body.h - 123.5) * s - 1;
    const z = this.physics.add.sprite(o.x, y, 'mob_alien_walk_0');
    z.setScale(s);
    z.body.setSize(body.w, body.h).setOffset(body.x, body.y);
    z.setDepth(9);
    z.setCollideWorldBounds(true);
    this.physics.add.collider(z, this.floorsW);
    if (this.anims.exists('alien-walk')) z.play('alien-walk');
    z._alive = true;
    z._hp = o.hp || WALK_ALIEN_HP;
    z._H = H;
    z._speed = (o.speed || 0.3) * H;
    z._rage = (o.rage || 0.7) * H;
    z._calmLunge = !!o.calmLunge;
    z._enraged = false;
    z._knockUntil = 0;
    z._lungeUntil = 0;
    z._nextLungeAt = this.time.now + (o.lungeDelay || 1200);
    z._floorY = floorY;
    z.setFlipX(this.player.x > z.x);        // the art faces west
    if (o.vx != null || o.vy != null) {
      z.setVelocity(o.vx || 0, o.vy || 0);
      z._leaping = true;
      z._leapAt = this.time.now;
    }
    this.enemies.push(z);
    this.startCombat();
    return z;
  },

  _updateEnemies(now) {
    const p = this.player;
    const alive = this.enemies.filter(z => z.active && z._alive);
    alive.forEach(z => {
      const grounded = z.body.blocked.down || z.body.touching.down;
      const dx = p.x - z.x, dir = dx >= 0 ? 1 : -1;
      const H = z._H;
      // Through the window and down: nothing steers it until it lands.
      if (z._leaping) {
        if (!grounded || now < z._leapAt + 150) return;
        z._leaping = false;
        z.setVelocityX(0);
        this.cameras.main.shake(140, 0.005);
        Sfx.ensure(); Sfx.land();
      }
      if (now < z._knockUntil || now < z._lungeUntil) return;
      if (this._dead || this._holdInput) {
        z.setVelocityX(0);
        if (z.anims.isPlaying && z.anims.getName() === 'alien-walk') z.anims.pause();
        return;
      }
      if (z.anims.isPaused) z.anims.resume();
      z.setFlipX(dir > 0);
      const speed = z._enraged ? z._rage : z._speed;
      // The lunge: close, on the floor, and off cooldown. A calm one on its
      // first approach only if it was sent in hungry.
      if (grounded && Math.abs(dx) < 1.1 * H && now > z._nextLungeAt &&
          (z._enraged || z._calmLunge)) {
        const which = Math.random() < 0.5 ? 'lungeA' : 'lungeB';
        if (this.anims.exists('alien-' + which)) z.play('alien-' + which);
        z._lungeUntil = now + 620;
        z._nextLungeAt = now + 1500 + Math.random() * 700;
        const g = this.physics.world.gravity.y;
        z.setVelocity(dir * Math.max(speed * 2.6, 1.7 * H), -Math.sqrt(2 * g * 0.18 * H));
        Sfx.ensure(); Sfx.swoop();
        return;
      }
      // One at a time: an alien with another between it and him waits its turn
      // rather than walking into the same spot.
      const queued = alive.some(o => o !== z && (o.x - z.x) * dir > 0 &&
                                     Math.abs(o.x - z.x) < 0.38 * H);
      z.setVelocityX(queued ? 0 : dir * speed);
      if (grounded && z.anims.getName() !== 'alien-walk' && this.anims.exists('alien-walk')) {
        z.play('alien-walk');
      }
      z.anims.timeScale = queued ? 0.4 : Phaser.Math.Clamp(speed / (0.3 * H), 0.6, 2.2);
    });
  },

  // Touching it hurts. Not while he is dashing through, and not twice in the
  // same breath.
  _enemyContact(now) {
    if (this._dead || this._holdInput || now < this._invulnUntil ||
        now < (this.player._dashUntil || 0)) return;
    const pb = this.player.body;
    for (const z of this.enemies) {
      if (!z.active || !z._alive) continue;
      const b = z.body;
      if (pb.right < b.left + 4 || pb.left > b.right - 4 ||
          pb.bottom < b.top + 8 || pb.top > b.bottom) continue;
      this.hurtPlayer(1, z.x);
      return;
    }
  },

  hurtPlayer(dmg, fromX) {
    const now = this.time.now, p = this.player;
    this.hp = Math.max(0, this.hp - dmg);
    this._invulnUntil = now + WALK_INVULN_MS;
    Sfx.ensure(); Sfx.hurt();
    this.cameras.main.shake(160, 0.008);
    p.setTintFill(0xff3b1f);
    this.time.delayedCall(110, () => { if (!this._dead && p.active) p.clearTint(); });
    this.tweens.add({ targets: p, alpha: 0.35, duration: 90, yoyo: true, repeat: 4,
                      onComplete: () => p.setAlpha(1) });
    if (fromX != null) {
      const away = p.x < fromX ? -1 : 1, k = this.playScale || 1;
      p.setVelocity(away * 420 * k, -300 * k);
      p._knockUntil = now + 240;
      p._swingUntil = 0;
    }
    this._paintHearts();
    if (this.hp <= 0) this._playerDown();
  },

  // Down. The room comes back as it was when the fight began — the stage's
  // `keep` says what that is — after a moment to see it.
  _playerDown() {
    if (this._dead) return;
    this._dead = true;
    const p = this.player, hero = p._hero;
    this.tweens.killTweensOf(p);
    p.setAlpha(1);
    p.clearTint();            // the last hit's red fill would cover the whole clip
    p.setVelocityX(0);
    p._gunUntil = 0; p._swingUntil = 0;
    if (hero && heroHas(hero, 'death')) {
      playAction(p, hero, 'death', p._facing);
      p._curAnim = heroAnim(hero, 'death', p._facing);
    } else {
      if (hero && heroHas(hero, 'crouch')) {
        playAction(p, hero, 'crouch', p._facing);
        p._curAnim = heroAnim(hero, 'crouch', p._facing);
      }
      p.setTint(0x8a2a1c);
    }
    this.enemies.forEach(z => { if (z.active && z._alive) z.setVelocityX(0); });
    const ov = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(80).setAlpha(0);
    const t1 = this.add.text(640, 318, ((hero && hero.name) || 'ETERWOLF') + ' DOWN', {
      fontFamily: 'Courier New, monospace', fontSize: '54px', color: '#c93b2a',
      stroke: '#0d0a08', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81).setAlpha(0);
    const t2 = this.add.text(640, 380, 'back on your feet…', {
      fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#d9c7a8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81).setAlpha(0);
    this.tweens.add({ targets: [ov, t1, t2], alpha: 1, duration: 500 });
    this._downTimer = this.time.delayedCall(2600, () => {
      this._downTimer = null;
      if (this._transitioning) return;
      this._transitioning = true;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete',
        () => this.scene.restart(this._keepData({ cast: this.castId })));
    });
  },

  // The nearest living enemy in front of him and in reach of a swing.
  _foeInReach(dir) {
    const p = this.player, reach = 0.62 * this.charH;
    let foe = null, best = Infinity;
    this.enemies.forEach(z => {
      if (!z.active || !z._alive) return;
      const dx = z.x - p.x;
      if (dx * dir < -0.12 * this.charH || Math.abs(dx) > reach) return;
      if (Math.abs(z.body.center.y - p.body.center.y) > 0.6 * this.charH) return;
      if (Math.abs(dx) < best) { best = Math.abs(dx); foe = z; }
    });
    return foe;
  },

  hitEnemy(z, dmg, dir, fromSword) {
    if (!z._alive) return;
    const now = this.time.now;
    z._hp -= dmg;
    Sfx.ensure(); Sfx.hit();
    z.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!z.active || !z._alive) return;
      z.clearTint();
      if (z._enraged) z.setTint(ALIEN_RAGE_TINT);      // the rage outlives the flash
    });
    this._acidSpray(z.x + dir * 0.08 * z._H, z.y - 0.1 * z._H, fromSword ? 10 : 5);
    // The first wound wakes it up: it roars and comes on faster, and lunges.
    if (!z._enraged) {
      z._enraged = true;
      z._nextLungeAt = now + 420;
      Sfx.roar();
    }
    z._knockUntil = now + 160;
    z._lungeUntil = 0;
    z.setVelocityX(dir * (fromSword ? 2.0 : 0.8) * z._H);
    if (z._hp <= 0) this.killEnemy(z, dir);
  },

  // death enemy 1.gif: it goes over backwards, melts, and leaves a pool of
  // acid that stays a while before it dries up. Standing in the pool burns.
  killEnemy(z, dir) {
    z._alive = false;
    z.body.enable = false;
    z.anims.stop();
    Sfx.ensure(); Sfx.squelch();
    this.cameras.main.shake(120, 0.005);
    const x = z.x, floorY = z._floorY, H = z._H, faceRight = z.flipX;
    z.destroy();
    this.enemies = this.enemies.filter(e => e !== z);
    const S = ALIEN_DEATH_SHEET, s = H / S.standH;
    if (!this.anims.exists('alien-die')) {
      if (this.onEnemyKilled) this.onEnemyKilled(x, dir);
      return;
    }
    const now = this.time.now;
    const d = this.add.sprite(x, floorY + 2, S.key, 'ad0').setDepth(8).setScale(s)
      .setFlipX(faceRight)
      .setOrigin((faceRight ? S.cw - S.cx : S.cx) / S.cw, (S.foot + 1) / S.ch);
    d.play('alien-die');
    // Burns from the moment the body has run down into it (frame 11 of 16),
    // for as long as the pool lies there, and a little into its drying up.
    const acid = { x, y: floorY, half: 0.42 * H, from: now + 1200, until: Infinity, d };
    this.acids.push(acid);
    d.once('animationcomplete', () => {
      if (!d.active) return;
      this.tweens.add({ targets: d, scaleY: s * 1.04, duration: 560, yoyo: true, repeat: -1,
                        ease: 'Sine.easeInOut' });
      this.time.delayedCall(ACID_HOLD_MS, () => {
        if (!d.active) return;
        this.tweens.killTweensOf(d);
        d.setScale(s);
        acid.until = this.time.now + 900;
        d.play('alien-dry');
        d.once('animationcomplete', () => {
          acid.dead = true;
          this.tweens.add({ targets: d, alpha: 0, duration: 600, onComplete: () => d.destroy() });
        });
      });
    });
    if (this.onEnemyKilled) this.onEnemyKilled(x, dir);
  },

  // Drops of it: out of a wound and down to the floor, or — `up` — kicked up
  // off the pool by a foot. Never through the floor.
  _acidSpray(x, y, n, up) {
    for (let i = 0; i < n; i++) {
      const f = ((i * 2654435761 + (x | 0)) % 1000) / 1000;
      const g = ((i * 40503 + (y | 0)) % 997) / 997;
      const dot = this.add.circle(x + (f - 0.5) * 30, y + (up ? 0 : (g - 0.5) * 40),
                                  2 + g * 4, 0xd8d020, 0.9).setDepth(11);
      const toY = up ? dot.y - 20 - g * 50 : Math.min(dot.y + 40 + g * 110, this.groundY - 2);
      this.tweens.add({
        targets: dot, x: dot.x + (f - 0.5) * (up ? 70 : 160), y: toY, alpha: 0,
        duration: 380 + f * 380, ease: up ? 'Quad.easeOut' : 'Quad.easeIn',
        onComplete: () => dot.destroy()
      });
    }
  },

  // Stand in the acid and it takes a heart at a time — green, not gone. Get
  // out and keep moving and they come back, one at a time. Stand still out of
  // it and they do not. It hurts; it does not kill: the last heart is never
  // the acid's to take.
  _updateAcid(now) {
    if (!this._combat) return;
    this.acids = this.acids.filter(a => !a.dead);
    if (this._dead || this._holdInput) return;
    const p = this.player, pb = p.body;
    const onFloor = pb.blocked.down || pb.touching.down;
    const inAcid = onFloor && now >= (p._dashUntil || 0) && this.acids.some(a =>
      now >= a.from && now < a.until &&
      Math.abs(p.x - a.x) < a.half + pb.width * 0.3 &&
      Math.abs(pb.bottom - a.y) < 0.12 * this.charH);
    if (inAcid) {
      // a step in gets a moment's grace before the first burn
      if (!this._inAcid) this._acidTickAt = Math.max(this._acidTickAt, now + 400);
      this._healAt = now + ACID_HEAL_MS;
      if (now >= this._acidTickAt) {
        this._acidTickAt = now + ACID_TICK_MS;
        Sfx.ensure(); Sfx.sizzle();
        p.setTint(0xb6e04a);
        this.time.delayedCall(140, () => { if (!this._dead && p.active) p.clearTint(); });
        this._acidSpray(p.x, pb.bottom - 6, 4, true);
        if (this.hp > 1) { this.hp--; this._burn++; this._paintHearts(); }
      }
    } else if (this._burn > 0 && Math.abs(pb.velocity.x) > 20 && now >= this._healAt) {
      this._healAt = now + ACID_HEAL_MS;
      this._burn--;
      this.hp = Math.min(this.maxHp, this.hp + 1);
      Sfx.ensure(); Sfx.mend();
      this._paintHearts();
    }
    this._inAcid = inAcid;
  },

  // ---- the pistol ------------------------------------------------------
  // LMB or K, once it is yours, in any walking stage — the same as the blades.
  _updateGun(now) {
    if (!GameState.hasPistol || this._dead || this._holdInput || this._transitioning ||
        this._inConversation || this._editorMode) return;
    const ptr = this.input.activePointer;
    const mouse = ptr.isDown && ptr.button === 0 && this._ptrFire;
    const firing = mouse || (this.keys.K && this.keys.K.isDown);
    if (!firing) return;
    const p = this.player;
    // standing still, the mouse says which way he points it
    if (mouse && Math.abs(p.body.velocity.x) < 20) {
      const wx = ptr.positionToCamera(this.cameras.main).x;
      p._facing = wx >= p.x ? 1 : -1;
    }
    p._gunUntil = now + 520;
    if (now < this._nextFireAt || now < (p._swingUntil || 0)) return;
    this._nextFireAt = now + PISTOL_CD;
    this.fireBullet(now);
  },

  fireBullet(now) {
    const p = this.player, hero = p._hero, face = p._facing || 1;
    const sx = Math.abs(p.scaleX), sy = Math.abs(p.scaleY);
    let mx = p.x + face * 0.25 * this.charH, my = p.y - 0.15 * this.charH;
    const art = hero && hero.art;
    if (art && art.canvasW && art.muzzles) {
      const moving = Math.abs(p.body.velocity.x) > 20;
      const mp = art.muzzles[moving ? 'runshoot' : 'shoot'] || art.muzzles.pistol;
      if (mp) {
        mx = p.x + face * (mp.x - art.canvasW / 2) * sx;
        my = p.y + (mp.y - p.originY * art.canvasH) * sy;
      }
    }
    Sfx.ensure(); Sfx.pistol();
    const k = this.charH / 146;          // the combat scene's tracer, at this scale
    const b = this.add.image(mx, my, 'bullet').setDepth(11).setScale(k)
      .setBlendMode(Phaser.BlendModes.ADD).setFlipX(face < 0);
    b._vx = face * 7.2 * this.charH;
    b._born = now;
    // The first step is tested from him, not from the muzzle, or an alien
    // already on top of him sits between the two and every round misses it.
    b._x0 = p.x;
    this.bullets.push(b);
    const fl = this.add.image(mx, my, 'flash_0').setDepth(12).setScale(k)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: fl, alpha: 0, scale: 0.4 * k, duration: 60,
                      onComplete: () => fl.destroy() });
    this.cameras.main.shake(28, 0.0009);
  },

  // Moved by hand and tested along the whole step, so a round fired at a
  // slow frame rate cannot jump clean over something thin.
  _updateBullets(now, dt) {
    this.bullets = this.bullets.filter(b => {
      if (!b.active) return false;
      const px = b._x0 != null ? b._x0 : b.x;
      b._x0 = null;
      b.x += b._vx * dt;
      if (now - b._born > 1100 || b.x < -40 || b.x > this.worldW + 40) { b.destroy(); return false; }
      const lo = Math.min(px, b.x), hi = Math.max(px, b.x);
      for (const z of this.enemies) {
        if (!z.active || !z._alive) continue;
        const zb = z.body;
        if (hi < zb.left || lo > zb.right || b.y < zb.top || b.y > zb.bottom) continue;
        b.destroy();
        this.hitEnemy(z, PISTOL_DMG, b._vx > 0 ? 1 : -1, false);
        return false;
      }
      return true;
    });
  },

  // ---- the pistol it drops -------------------------------------------
  // pistol on floor.png, lying where it landed — a pistol's size, not a
  // pickup's: about a hand and a half long next to him.
  dropPistol(x) {
    const key = this.textures.exists('scene_pistolfloor') ? 'scene_pistolfloor' : 'gun_pickup';
    x = Phaser.Math.Clamp(x, 60, this.worldW - 60);
    const y = this.groundY;
    const gun = this.add.image(x, y - 0.5 * this.charH, key).setDepth(9);
    const art = key === 'scene_pistolfloor' ? paintedBox(this, key) : null;
    const want = 0.24 * (this.pxPerM || 144);
    if (art) {
      gun.setOrigin((art.x0 + art.pw / 2) / art.w, (art.y1 + 1) / art.h);
      gun.setScale(want / art.pw);
    } else {
      gun.setOrigin(0.5, 1).setScale(want / gun.width);
    }
    this.tweens.add({ targets: gun, y: y + 1, duration: 420, ease: 'Bounce.easeOut' });
    Sfx.ensure(); this.time.delayedCall(260, () => Sfx.burst(0.05, 0.3, 2600, 2));
    // a glint rather than a halo: it is a gun on a floor, not a power-up
    const glint = this.add.star(x + want * 0.3, y - 6, 4, 2, 7, 0xfff2cc, 0.9)
      .setDepth(10).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({ targets: glint, alpha: 0.9, scale: 1.4, duration: 260, yoyo: true,
                      repeat: -1, repeatDelay: 900, delay: 500 });
    this._gunDrop = { gun, glint, x };
  },

  _updateGunDrop() {
    const g = this._gunDrop;
    if (!g || this._dead) return;
    const p = this.player, pb = p.body;
    if (Math.abs(p.x - g.x) > 0.3 * this.charH || Math.abs(pb.bottom - this.groundY) > 0.2 * this.charH) return;
    this._gunDrop = null;
    this.tweens.killTweensOf([g.gun, g.glint]);
    g.gun.destroy(); g.glint.destroy();
    GameState.hasPistol = true;
    Sfx.ensure(); Sfx.select();
    this.cameras.main.flash(240, 255, 226, 170);
    this._pistolCard();
    if (this.onPistol) this.onPistol();
  },

  // The obtained card, with the gun itself on it: pistol sprite.png.
  _pistolCard() {
    const grp = [];
    grp.push(this.add.rectangle(640, 350, 620, 230, 0x0d0a08, 0.93)
      .setScrollFactor(0).setDepth(90).setStrokeStyle(3, 0xf2b13c));
    if (this.textures.exists('scene_pistolsprite')) {
      const im = this.add.image(640, 300, 'scene_pistolsprite').setScrollFactor(0).setDepth(91);
      const art = paintedBox(this, 'scene_pistolsprite');
      im.setScale(art ? 200 / art.pw : 200 / im.width);
      grp.push(im);
    }
    grp.push(this.add.text(640, 386, 'OBTAINED — BLACK PISTOL', {
      fontFamily: 'Courier New, monospace', fontSize: '24px', color: '#f2b13c',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91));
    grp.push(this.add.text(640, 424, 'LMB  or  K  to fire', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91));
    grp.forEach(o => o.setAlpha(0));
    this.tweens.add({ targets: grp, alpha: 1, duration: 250 });
    this.time.delayedCall(3000, () => this.tweens.add({
      targets: grp, alpha: 0, duration: 450, onComplete: () => grp.forEach(o => o.destroy())
    }));
  },

  _updateCombat(now, delta) {
    const dt = Math.min(0.05, (delta || 16.7) / 1000);
    if (this.bullets.length) this._updateBullets(now, dt);
    if (this.enemies.length) {
      this._updateEnemies(now);
      this._enemyContact(now);
    }
    this._updateAcid(now);
    this._updateGunDrop();
  }
};
Object.assign(WalkScene.prototype, WalkCombat);

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
      noJump: true,           // no jumping until the broken wall
      title: 'THE BUNKER — quarantine shelter',
      castSwitch: true, canReset: true,
      // The door is not the first thing any more: the radio is. It tells them
      // where to go, and the door stays shut until they have heard it.
      beats: [
        { at: 0,    tip: 'HOLD  A  TO GO LEFT,  D  TO GO RIGHT' },
        { at: 0.22, tip: 'HOLD  SHIFT  WHILE WALKING TO RUN' },
        { at: 0.30, say: [['ETERWOLF', 'Is that... a radio?']], needs: 'radio' }
      ],
      exits: [
        // The blast door's box, measured off bunker_wide.png: the slab runs
        // x 0.838-0.952 and y 0.264-0.775 of the painting. The whole door
        // lights up rather than a puddle of light pooling at its foot.
        // glowShape false: this one stays the soft slab it always was, sized
        // to the door and no wider. The shaped glow cut from the painting is
        // for a hole knocked in a wall — it lights whatever is DARK inside the
        // box, and a blast door is the brightest thing in this room, so it lit
        // the shadows around the frame instead of the door.
        { xFrac: 0.90, w: 180, label: 'EXIT THE BUNKER', target: 'ExitScene',
          glow: true, noArrow: true, glowShape: false,
          glowFrac: { x0: 0.838, x1: 0.952, y0: 0.264, y1: 0.775 },
          // Out to where, though? Not until the radio has said.
          locked: () => !GameState.seen['bunker-radio'],
          lockedLabel: 'GO WHERE, THOUGH?',
          onLocked() {
            if (this.time.now < (this._doorNagAt || 0)) return;
            this._doorNagAt = this.time.now + 2600;
            Sfx.ensure(); Sfx.deny();
            this._say([['ETERWOLF', 'Go where, though?']]);
            this._showTip("THERE'S A RADIO ON THE BENCH  —  E");
          } }
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

    // ---- the radio and the food ---------------------------------------
    // Both stand on the back floor of the painting (the furniture plane, 0.78
    // or so), behind the brothers, who walk along the front at 0.872.
    //   radio bench — under the painted wall map (0.42-0.49), which is where
    //                 you would pin a map if a voice on the radio named a place
    //   food crate  — in the clear stretch between the pilaster and the door
    //                 frame (0.667-0.829), its E zone well short of the door's
    this._radioUsed = !!GameState.seen['bunker-radio'];
    this._ate = !!GameState.seen['bunker-ate'];
    this._inConversation = false;
    this._nudged = false;
    this._chatter = null;
    this._buildRadio(0.44, 0.787);
    this._buildCrate(0.725, 0.78);
    this.input.keyboard.on('keydown-E', () => {
      if (this._inConversation || this._holdInput || this._transitioning) return;
      if (this._atRadio()) this._useRadio();
      else if (this._atCrate()) this._eat();
    });
    this.events.once('shutdown', () => {
      if (this._static) { this._static.stop(150); this._static = null; }
      if (this._chatter) { this._chatter.stop(); this._chatter = null; }
      const dlg = this.scene.get('IntroDialogueScene');
      if (dlg && dlg.sys.settings.active && dlg.overlay) this.scene.stop('IntroDialogueScene');
    });
  }

  // Where a point on a prop's art lands in the world.
  _artToWorld(im, ax, ay) {
    return { x: im.x + (ax - im.originX * im.width) * im.scaleX,
             y: im.y + (ay - im.originY * im.height) * im.scaleY };
  }

  // A prop stood on its painted feet, sized by its painted width.
  _floorProp(key, xf, footF, wantW, depth) {
    if (!this.textures.exists(key)) return null;
    const bg = this.bgGeom;
    const im = this.add.image(bg.x + xf * bg.w, bg.y + footF * bg.h, key).setDepth(depth || 5);
    const art = paintedBox(this, key);
    if (art) {
      im.setOrigin((art.x0 + art.pw / 2) / art.w, (art.y1 + 1) / art.h);
      im.setScale(wantW / art.pw);
    } else {
      im.setOrigin(0.5, 1).setScale(wantW / im.width);
    }
    return im;
  }

  // The workbench and the set on it. The art has the dial and the meter lit;
  // until it is switched on they sit under dark covers, and a red standby
  // light blinks. Coordinates are on radio_bench.png (960x480).
  _buildRadio(xf, footF) {
    const im = this._floorProp('scene_radiobench', xf, footF, 461, 5);
    if (!im) return;
    this.bench = im;
    const W = (ax, ay) => this._artToWorld(im, ax, ay);
    const s = im.scaleX;
    const box = (x0, y0, x1, y1) => {
      const a = W(x0, y0), b = W(x1, y1);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: b.x - a.x, h: b.y - a.y };
    };
    const dial = box(525, 127, 622, 158), meter = box(428, 129, 461, 160);
    this.radioX = W(540, 160).x;               // the middle of the set itself
    this.radioY = W(540, 160).y;
    this.radioCovers = [dial, meter].map(b =>
      this.add.rectangle(b.x, b.y, b.w + 1, b.h + 1, 0x050403, 0.82).setDepth(5.1));
    torchTexture(this);
    this.radioGlow = this.add.image(dial.x, dial.y, TORCH_KEY).setDepth(5.2)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa040)
      .setDisplaySize(dial.w * 2.6, dial.h * 4.2).setAlpha(0);
    const led = W(472, 178);
    this.radioLed = this.add.circle(led.x, led.y, Math.max(2, 5 * s), 0xff2a1a, 1).setDepth(5.3);
    const top = W(0, paintedBox(this, 'scene_radiobench').y0).y;
    this.radioLabel = this.add.text(this.radioX, top - 14, 'E  —  RADIO', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(30).setAlpha(0);
    // A faint hiss even on standby, so walking past it tells you it is alive.
    this._static = Sfx.loop({ hp: 320, lp: 1600, waver: 0.45, crackle: 220, crackleFreq: 3600, vol: 0 });
    if (this._radioUsed) this._radioLive(true);
  }

  _radioLive(instant) {
    this.radioLed.setFillStyle(0x7cff6b, 1).setAlpha(1);
    if (instant) {
      this.radioCovers.forEach(c => c.setAlpha(0));
    } else {
      // it catches, stutters, and holds
      this.radioCovers.forEach(c => {
        [0, 70, 140, 260, 380].forEach((t, i) => this.time.delayedCall(t, () => c.setAlpha(i % 2 ? 0.5 : 0.05)));
        this.time.delayedCall(460, () => c.setAlpha(0));
      });
    }
  }

  _buildCrate(xf, footF) {
    const im = this._floorProp('scene_cratefood', xf, footF, 234, 5);
    if (!im) return;
    this.crate = im;
    this.crateX = im.x;
    // over his head, not behind him: he stands in front of the crate
    this.crateLabel = this.add.text(im.x, this.groundY - this.charH - 30, 'E  —  EAT', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(30).setAlpha(0);
  }

  _atRadio() {
    return !!this.bench && !this._radioUsed && !!this.player &&
           Math.abs(this.player.x - this.radioX) < 130;
  }

  _atCrate() {
    return !!this.crate && !this._ate && !!this.player &&
           Math.abs(this.player.x - this.crateX) < 115;
  }

  // Stop, face it, and give the room over to a conversation in the panel.
  _hold(faceX) {
    this._inConversation = true;
    this._holdInput = true;
    const p = this.player, hero = p._hero;
    p.setVelocity(0, 0);
    p._facing = faceX >= p.x ? 1 : -1;
    if (hero) {
      playAction(p, hero, 'idle', p._facing);
      p._curAnim = heroAnim(hero, 'idle', p._facing);
      heroFlip(p, hero, p._facing);
    }
  }

  _release() {
    this._holdInput = false;
    this._inConversation = false;
  }

  _panel(lines, onLine, onDone) {
    this.scene.launch('IntroDialogueScene', {
      lines, sleeper: null, keepMusic: true, hold: 300, fadeMs: 380,
      overlay: true, barTop: true, onLine, onDone
    });
    this.scene.bringToTop('IntroDialogueScene');
  }

  // Click, a sweep across the band, the dial comes up, and static. A voice
  // under it, broken up, telling whoever is listening where to go.
  _useRadio() {
    if (this._radioUsed) return;
    this._radioUsed = true;
    once('bunker-radio');
    this.radioLabel.setAlpha(0);
    this._hold(this.radioX);
    Sfx.ensure(); Sfx.select();
    Sfx.blip(1800, 0.3, 'sine', 0.08, 380);
    this._radioLive(false);
    if (this._static) this._static.setVolume(0.24, 350);
    const stopChatter = () => { if (this._chatter) { this._chatter.stop(); this._chatter = null; } };
    this.time.delayedCall(1300, () => {
      if (!this.scene.isActive()) return;
      this._panel(RADIO_LINES, (i, line) => {
        this._radioLine = i;
        stopChatter();
        if (!this._static) return;
        if (line.who === 'RADIO') {
          // loud under the voice, and the voice itself as chatter while it types
          this._static.setVolume(0.16, 200);
          this._chatter = Sfx.radioChatter(line.text.length * 26 + 250);
        } else {
          this._static.setVolume(0.045, 300);       // down, under them talking
        }
        if (line.cue === 'lost') {
          // the signal goes: a surge of static over the end of the sentence
          // (only if that line is still up — skipped past, the brothers keep
          // the quiet they are talking in)
          this.time.delayedCall(line.text.length * 26 - 150, () => {
            if (this._radioLine !== i || !this._static) return;
            stopChatter();
            this._static.setVolume(0.34, 120);
            this.time.delayedCall(700, () => {
              if (this._radioLine === i && this._static) this._static.setVolume(0.16, 400);
            });
          });
        }
      }, () => {
        stopChatter();
        if (this._static) this._static.setVolume(0.04, 900);
        this._release();
        this._showTip('THE PLAZA  —  OUT THROUGH THE DOOR');
      });
    });
  }

  // Wolffel said "I'm hungry" before his eyes were open. Here it is.
  _eat() {
    if (this._ate) return;
    this._ate = true;
    once('bunker-ate');
    this.crateLabel.setAlpha(0);
    this._hold(this.crateX);
    Sfx.ensure(); Sfx.select();
    this.time.delayedCall(250, () => {
      if (!this.scene.isActive()) return;
      this._panel(CRATE_LINES, (i, line) => {
        if (line.cue === 'munch') this.time.delayedCall(260, () => Sfx.munch());
      }, () => this._release());
    });
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.player || !this.bench) return;
    const now = this.time.now;
    // standby light blinks until it is on
    if (!this._radioUsed) this.radioLed.setAlpha(Math.floor(now / 520) % 2 ? 1 : 0.15);
    else if (this.radioGlow) {
      const f = 0.3 + Math.sin(now * 0.021) * 0.04 + Math.sin(now * 0.067) * 0.03;
      this.radioGlow.setAlpha(f);
    }
    // Prompts give way to speech: the line over his head and the prompt were
    // landing on top of each other.
    const talking = this._sayText && this._sayText.alpha > 0.05;
    this.radioLabel.setAlpha(this._atRadio() && !this._inConversation && !talking ? 1 : 0);
    if (this.crateLabel) this.crateLabel.setAlpha(this._atCrate() && !this._inConversation && !talking ? 1 : 0);
    // The static carries: faint on standby when you are close, and after the
    // broadcast a soft crackle that fades as you walk away from it.
    if (this._static && !this._inConversation) {
      const dm = Math.abs(this.player.x - this.radioX) / this.pxPerM;      // metres away
      const near = Math.max(0, 1 - dm / 4.5);
      const want = (this._radioUsed ? 0.05 : 0.03) * near;
      if (Math.abs(this._static.volume - want) > 0.004) this._static.setVolume(want, 250);
    }
    // Heading for the door with the radio heard and the arepas uneaten.
    if (this._radioUsed && !this._ate && !this._nudged && this.crate &&
        this.player.x > this.crateX + 150 && !this._inConversation) {
      this._nudged = true;
      this._say([['ETERWOLF', 'Should eat something first.']]);
    }
  }
}

// The broadcast: a voice they don't know, cut to pieces by static.
const RADIO_LINES = [
  { who: 'RADIO', silent: true,
    text: '—kkhh— ...all survivors... the quarantine checkpoint at the Plaza is still holding—' },
  { who: 'RADIO', silent: true, cue: 'lost',
    text: '—cross the river before dark. Do not... do not let them—' },
  { who: 'WOLFFEL',  text: 'Let them what?' },
  { who: 'ETERWOLF', text: 'The Plaza. Across the river.' },
  { who: 'WOLFFEL',  text: 'And why are we even down here?' },
  { who: 'ETERWOLF', text: "No idea. Let's go find out." }
];

const CRATE_LINES = [
  { who: 'WOLFFEL',  text: 'Arepas! Somebody stocked this place.', cue: 'munch' },
  { who: 'ETERWOLF', text: "Eat fast. The Plaza's a long way." },
  { who: 'WOLFFEL',  text: "...I'm taking three.", cue: 'munch' }
];

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
    this.cameras.main.fadeIn(260, 0, 0, 0);
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
      noJump: true,           // no jumping until the broken wall
      title: 'OUTSIDE — the village road',
      castSwitch: true, canReset: true,
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
          silent: true, fadeMs: 190 }
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
    this.cameras.main.fadeIn(260, 0, 0, 0);
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
      // Zoomed out a tenth, and the brothers down from 167 px/m to 130.
      //
      // Two reasons, both about what comes next. A jump rises 1.35 of your own
      // height at every scale in this game, so a 301px man on a 720 view goes
      // from standing with his head at 419 to standing with it at 13 — he
      // jumps into the top of the picture. At 234 his head tops out at 170,
      // which is a jump inside a street rather than through its roof.
      // And the bridge after this one runs at 101 px/m. 167 to 101 is a 40%
      // drop in one cut and you feel the camera lurch; 167 -> 130 -> 101 is
      // two even steps of about a fifth.
      //
      // The foreground props are placed in absolute pixels, so their scale and
      // their yOff are both taken down by the same 1.08/1.2 the picture is —
      // they sit exactly where they sat against the painting.
      worldW: 'auto', groundFrac: 0.755, startXFrac: 0.035, bgZoom: 1.08,
      pxPerM: 130,
      title: 'THE BURNT STREET',
      castSwitch: true, canReset: true,
      // The jump is taught here, by a car. Until the Twingo in the road goes
      // up there is nothing to jump over and no jump; after it, its wreck is
      // the first thing you ever jump onto.
      noJump: !GameState.seen['twingo-blown'],
      props: [
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
        // drift. The plant needs no such correction — you meet it with the
        // camera still at zero.
        //
        // The log is where it is so you WATCH him go behind it. The camera
        // stops following at world 1664 and he walks the last 600px across a
        // still frame; at 0.985 the log rendered at screen 1163 and he only
        // reached it in the final 90px, which is no time at all. At 0.825 it
        // renders around 790, and he crosses it with most of the street still
        // ahead of him.
        //
        // The plant twice, the second one mirrored and smaller at the very
        // edge, so it reads as a clump rather than one repeated cutout.
        // Back to the size that was signed off. The ask was to REPOSITION
        // these, and they were scaled up at the same time, which put fronds
        // most of the way up the frame and made the street look like a
        // hedgerow. Position moved, size left alone.
        { kind: 'fg', tex: 'deadplant', xFrac: 0.152, scale: 1.395, yOff: 209 },
        { kind: 'fg', tex: 'deadplant', xFrac: 0.108, scale: 1.125, yOff: 209,
          flip: true },
        // Mirrored: the asset's splintered end points up-left, and the
        // reference has it pointing up-right, out of the corner of the frame.
        // Bigger, and standing further below the frame than the plants: at
        // yOff 212 its base landed exactly on the bottom edge of the view, so
        // the picture ended in a straight horizontal cut across the timber.
        // Pushing it down past the edge means the frame crops it mid-branch
        // instead, which is what a thing in front of the camera should do.
        { kind: 'fg', tex: 'deadlog',   xFrac: 0.825, scale: 1.395, yOff: 270,
          flip: true }
        // Add your own the same way:
        //   { kind: 'fg', tex: '<name>', xFrac: 0..1, scale: n, yOff: n, flip: true }
        // The name is whatever you listed in tools/build_html.js; xFrac moves
        // it, scale sizes it, yOff settles it, flip mirrors it.
      ],
      beats: [
        { at: 0.70, say: [['PLAYER', 'The whole street... where is everybody?']] }
      ],
      exits: [
        // The way back. The bunker is behind a blast door, the bridge comes
        // down behind you and the drop is a drop, so this is the one link in
        // the chain you can actually walk back along — and a street you can
        // only ever leave one way reads as a corridor, not a place.
        { xFrac: 0.004, w: 80, target: 'ExitScene', auto: true,
          // Far enough back up the village road that its own auto exit is
          // clear of him on arrival — land inside it and he could never arm
          // it, so walking right would do nothing.
          silent: true, fadeMs: 190, spawnXFrac: 0.88 },
        { xFrac: 0.99, w: 90, target: 'BridgeScene', auto: true,
          silent: true, fadeMs: 190 }
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
    this._twingoSetUp();
  }

  // ================================================================ //
  //  THE TWINGO                                                       //
  //                                                                   //
  //  A burning car in the road. He walks up to it, stops — something //
  //  in it is hissing — and it goes up: the flash, the blast, and he  //
  //  is thrown on his back. What is left is a burning heap across the //
  //  street, and the only way on is over it: the first jump.          //
  // ================================================================ //
  _twingoSetUp() {
    this._twBlown = !!GameState.seen['twingo-blown'];
    this._twState = this._twBlown ? 'wreck' : 'intact';
    this._debris = [];
    this._twEmitters = [];
    this._sizzleAt = 0;
    this._sizzleSaid = false;
    const art = TWINGO_ART;
    if (!this.textures.exists(art.car.key)) return;
    // one scale for all three: the car's wheelbase is a real Twingo's
    this._twS = (TWINGO_WHEELBASE_M * this.pxPerM) / (art.car.hubs[1] - art.car.hubs[0]);
    this._twX = this.worldW * TWINGO_X;
    this._twY = this.groundY + 3;             // tyres a touch into the road
    const place = a => {
      const tex = this.textures.get(a.key).getSourceImage();
      const mid = (a.hubs[0] + a.hubs[1]) / 2;
      return this.add.image(this._twX, this._twY, a.key)
        .setOrigin(mid / tex.width, a.ground / tex.height).setScale(this._twS).setDepth(3);
    };
    this.twCar = place(art.car);
    this.twBoom = place(art.boom).setVisible(false);
    this.twWreck = place(art.wreck).setVisible(false);

    // the fire's light on the road, under whatever is burning
    torchTexture(this);
    this._twGlow = this.add.image(this._twX, this._twY - 20, TORCH_KEY).setDepth(2.5)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a1a)
      .setDisplaySize(620, 260).setAlpha(0.28);
    this._fire = Sfx.loop({ hp: 60, lp: 1100, waver: 0.9, crackle: 70, crackleFreq: 2100, vol: 0 });
    this.events.once('shutdown', () => {
      if (this._fire) { this._fire.stop(150); this._fire = null; }
    });

    if (this._twBlown) {
      this.twCar.setVisible(false);
      this.twWreck.setVisible(true);
      this._twingoDeck();
      this._wreckFire();
      return;
    }
    // it is burning already — the drawing says so; this keeps it moving
    this._carFire();
    // and it stands in the road: you cannot walk through it
    const a = this._artX('car', 0.12), b = this._artX('car', 0.9);
    this._carBlock = this.add.rectangle((a + b) / 2, this.groundY - 90, b - a, 180, 0, 0).setDepth(-1);
    this.physics.add.existing(this._carBlock, true);
    this.solidsW.push(this._carBlock);
    this.physics.add.collider(this.player, this._carBlock);
    // where he stops: a body and a half short of the front bumper
    this._twTrigger = a - 1.5 * this.charH;
  }

  // x of a point given as a fraction across one of the three drawings
  _artX(which, f) {
    const a = TWINGO_ART[which], tex = this.textures.get(a.key).getSourceImage();
    return this._twX + (f * tex.width - (a.hubs[0] + a.hubs[1]) / 2) * this._twS;
  }
  _artY(h) { return this._twY - h * this._twS; }

  _emit(x, y, depth, cfg) {
    const e = this.add.particles(x, y, cfg.tex || 'flash_0', cfg).setDepth(depth);
    this._twEmitters.push(e);
    return e;
  }

  // Flames licking off a spot, embers going up out of them. Many small
  // tongues rather than a few big ones: each is a soft teardrop, born
  // yellow-white at the base and going orange, red and out as it rises, so
  // together they flicker the way fire does instead of reading as glowing balls.
  _flames(x, y, w, big) {
    const k = this.charH / 234;
    flameTexture(this);
    const f = this._emit(x, y, 3.6, {
      tex: FLAME_KEY, blendMode: 'ADD', lifespan: { min: 420, max: 820 },
      speedY: { min: -150 * k, max: -70 * k }, speedX: { min: -14, max: 14 },
      scale: { start: (big ? 0.8 : 0.5) * k, end: 0.12 * k },
      alpha: { start: 0.36, end: 0 },
      color: [0xffc060, 0xff8a2a, 0xe0501a, 0x8a2c10, 0x2a0e08],
      rotate: { min: -12, max: 12 },
      frequency: big ? 20 : 40, quantity: 1,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-w / 2, -6, w, 12) }
    });
    const e = this._emit(x, y - 10, 3.7, {
      tex: 'flash_1', blendMode: 'ADD', lifespan: { min: 1100, max: 2300 },
      speedY: { min: -170 * k, max: -60 * k }, speedX: { min: -35, max: 35 },
      scale: { start: 0.16 * k, end: 0 }, alpha: { start: 1, end: 0 },
      color: [0xfff2c8, 0xf2b13c, 0xd85a1c], gravityY: -12,
      frequency: big ? 90 : 170, quantity: 1,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-w / 2, -8, w, 16) }
    });
    return [f, e];
  }

  // Black smoke going up and spreading, with a lighter grey through it so it
  // reads against the dark sky rather than vanishing into it.
  _smoke(x, y, w, thick) {
    const k = this.charH / 234;
    torchTexture(this);
    return this._emit(x, y, 3.8, {
      tex: TORCH_KEY, lifespan: { min: 2800, max: 4200 },
      speedY: { min: -95 * k, max: -45 * k }, speedX: { min: -8, max: 30 },
      scale: { start: 0.1 * k, end: (thick ? 0.62 : 0.45) * k },
      alpha: { start: thick ? 0.34 : 0.24, end: 0 },
      tint: [0x3a322c, 0x4f453c, 0x62564a], frequency: thick ? 120 : 210, quantity: 1,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-w / 2, -4, w, 8) }
    });
  }

  _carFire() {
    // the bonnet (painted alight) and the cabin
    this._carFlames = this._flames(this._artX('car', 0.26), this._artY(215), 70, true);
    this._flames(this._artX('car', 0.52), this._artY(250), 40, false);
    this._smoke(this._artX('car', 0.36), this._artY(300), 60, false);
  }

  _wreckFire() {
    // the engine at the front and the hatch at the back burn hard; the roof
    // between them only smoulders — it is the part you are meant to cross
    this._flames(this._artX('wreck', 0.13), this._artY(120), 80, true);
    this._flames(this._artX('wreck', 0.82), this._artY(150), 70, true);
    this._flames(this._artX('wreck', 0.47), this._artY(262), 30, false);
    this._smoke(this._artX('wreck', 0.40), this._artY(280), 120, true);
    this._smoke(this._artX('wreck', 0.80), this._artY(260), 60, false);
  }

  // The crushed roof you can stand on: thin one-way slabs that follow the
  // painted roof line, never stepping more than 3px (so you walk across them
  // rather than catching on them), and a solid face at each end (so you
  // cannot walk into the heap, only jump onto it).
  _twingoDeck() {
    const pts = TWINGO_DECK;
    // smooth the measured line once, three points wide
    const sm = pts.map((p, i) => [p[0], (pts[Math.max(0, i - 1)][1] + p[1] + pts[Math.min(pts.length - 1, i + 1)][1]) / 3]);
    const hAt = f => {
      for (let i = 1; i < sm.length; i++) {
        if (f <= sm[i][0]) {
          const [f0, h0] = sm[i - 1], [f1, h1] = sm[i];
          return h0 + (h1 - h0) * ((f - f0) / Math.max(1e-6, f1 - f0));
        }
      }
      return sm[sm.length - 1][1];
    };
    const fa = sm[0][0], fb = sm[sm.length - 1][0];
    const add = (x0, x1, top, oneWay) => {
      const h = oneWay ? 26 : (this._twY - top);
      const r = this.add.rectangle((x0 + x1) / 2, top + h / 2, x1 - x0, h, 0, 0).setDepth(-1);
      this.physics.add.existing(r, true);
      if (oneWay) { const c = r.body.checkCollision; c.down = false; c.left = false; c.right = false; }
      this.solidsW.push(r);
      this.physics.add.collider(this.player, r);
      return r;
    };
    const N = 120;
    let runX0 = this._artX('wreck', fa), runTop = this._artY(hAt(fa)), ref = runTop;
    for (let i = 1; i <= N; i++) {
      const f = fa + (fb - fa) * (i / N);
      const x = this._artX('wreck', f), y = this._artY(hAt(f));
      if (Math.abs(y - ref) >= 3 || i === N) {
        add(runX0, x, Math.min(runTop, y), true);
        runX0 = x; runTop = y; ref = y;
      } else runTop = Math.min(runTop, y);
    }
    // the two hot ends
    const xa = this._artX('wreck', fa), xb = this._artX('wreck', fb);
    this._wallA = add(xa - 12, xa + 2, this._artY(hAt(fa)) + 2, false);
    this._wallB = add(xb - 2, xb + 12, this._artY(hAt(fb)) + 2, false);
    this._deckA = xa; this._deckB = xb;
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.player || !this.twCar) return;
    const p = this.player, now = this.time.now;
    // the fire gets louder the closer he is
    if (this._fire) {
      const dm = Math.abs(p.x - this._twX) / this.pxPerM;
      const base = this._twState === 'intact' ? 0.07 : 0.1;
      const want = base * Math.max(0.12, 1 - dm / 9) * (this._twState === 'building' ? 1.8 : 1);
      if (Math.abs(this._fire.volume - want) > 0.004) this._fire.setVolume(want, 300);
    }
    if (this._twGlow) {
      const hot = this._twState === 'building' ? 0.2 : 0;
      this._twGlow.setAlpha(0.24 + hot + Math.sin(now * 0.017) * 0.04 + Math.sin(now * 0.051) * 0.03);
    }
    if (this._twState === 'intact' && !this._transitioning && p.x >= this._twTrigger &&
        (p.body.blocked.down || p.body.touching.down)) this._twingoGo();
    this._updateDebris(delta);
    // Walking into the burning ends: it is hot, and he says so.
    if (this._twState === 'wreck' && this._deckA != null && !this._holdInput) {
      const b = p.body, grounded = b.blocked.down || b.touching.down;
      const intoA = b.blocked.right && Math.abs(b.right - (this._deckA - 12)) < 6;
      const intoB = b.blocked.left && Math.abs(b.left - (this._deckB + 12)) < 6;
      if (grounded && (intoA || intoB) && now > this._sizzleAt) {
        this._sizzleAt = now + 900;
        const away = intoA ? -1 : 1, k = this.playScale || 1;
        p.setVelocity(away * 230 * k, -170 * k);
        p._knockUntil = now + 200;
        p.setTint(0xff9a5a);
        this.time.delayedCall(130, () => { if (p.active) p.clearTint(); });
        Sfx.ensure(); Sfx.sizzle();
        if (!this._sizzleSaid) {
          this._sizzleSaid = true;
          this._say([['ETERWOLF', 'Hot! Over it, not through it.']]);
        }
      }
    }
  }

  // He stops. Something in the car is hissing, and then it isn't a car.
  _twingoGo() {
    this._twState = 'building';
    this._holdInput = true;
    this._inConversation = true;          // no R, no ESC mid-blast
    const p = this.player, hero = p._hero;
    p.setVelocity(0, 0);
    p._facing = 1;
    if (hero) {
      playAction(p, hero, 'idle', 1);
      p._curAnim = heroAnim(hero, 'idle', 1);
      heroFlip(p, hero, 1);
    }
    // frame him and the car together
    const cam = this.cameras.main;
    cam.stopFollow();
    const look = Phaser.Math.Clamp((p.x + this._twX) / 2 - 640, 0, this.worldW - 1280);
    this.tweens.add({ targets: cam, scrollX: look, duration: 650, ease: 'Sine.easeInOut' });
    this._say([['ETERWOLF', '...back up.']]);
    this.time.delayedCall(450, () => {
      Sfx.hissRise(1150);
      cam.shake(1150, 0.0025);
      if (this._carFlames) this._carFlames.forEach(e => e.setFrequency(12));
    });
    this.time.delayedCall(1050, () => Sfx.burst(0.05, 0.3, 4400, 3));      // a window goes
    this.time.delayedCall(1600, () => this._twingoBoom());
  }

  _twingoBoom() {
    if (this._twState !== 'building') return;
    this._twState = 'blast';
    once('twingo-blown');
    const cam = this.cameras.main, now = this.time.now, k = this.playScale || 1;
    // the car goes; the blast is in its place, a touch too big and settling
    this.twCar.setVisible(false);
    this._twEmitters.forEach(e => e.destroy());
    this._twEmitters = [];
    this.twBoom.setVisible(true).setScale(this._twS * 1.07);
    this.tweens.add({ targets: this.twBoom, scale: this._twS, duration: 220, ease: 'Quad.easeOut' });
    if (this._carBlock) {
      const i = this.solidsW.indexOf(this._carBlock);
      if (i >= 0) this.solidsW.splice(i, 1);
      this._carBlock.destroy(); this._carBlock = null;
    }
    cam.flash(200, 255, 214, 150);
    cam.shake(480, 0.014);
    Sfx.explosion();
    // a beat where everything stops, then it all comes down
    this.physics.world.pause();
    this.time.delayedCall(70, () => this.physics.world.resume());
    const cx = this._artX('boom', 0.31), cy = this._artY(260);
    // the shockwave along the road
    const ring = this.add.circle(cx, cy + 40, 40).setStrokeStyle(7, 0xffd98a, 0.85).setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: 5.5, alpha: 0, duration: 380, ease: 'Quad.easeOut',
                      onComplete: () => ring.destroy() });
    // embers and dust thrown everywhere
    const sparks = this.add.particles(cx, cy, 'flash_1', {
      blendMode: 'ADD', lifespan: { min: 600, max: 1600 }, speed: { min: 240 * k, max: 720 * k },
      angle: { min: 190, max: 350 }, gravityY: 900 * k, scale: { start: 0.45, end: 0 },
      color: [0xfff2c8, 0xffd98a, 0xf2b13c, 0xd85a1c], emitting: false
    }).setDepth(12);
    sparks.explode(70);
    this.time.delayedCall(1800, () => sparks.destroy());
    const dust = this.add.particles(cx, this._twY - 10, 'puff', {
      lifespan: { min: 900, max: 1700 }, speedX: { min: -320 * k, max: 320 * k },
      speedY: { min: -140 * k, max: -20 * k }, scale: { start: 2.5, end: 7 },
      alpha: { start: 0.45, end: 0 }, tint: 0x3a302a, emitting: false
    }).setDepth(11);
    dust.explode(26);
    this.time.delayedCall(1900, () => dust.destroy());
    this._throwDebris(cx, cy);
    // and him: thrown back and off his feet
    const p = this.player;
    p.setVelocity(-400 * k, -330 * k);
    p._knockUntil = now + 480;
    p.setTint(0xffb080);
    this.time.delayedCall(160, () => { if (p.active) p.clearTint(); });
    const hero = p._hero;
    this.time.delayedCall(430, () => {
      if (!p.active || !hero) return;
      if (heroHas(hero, 'falldown')) {
        const key = heroAnim(hero, 'falldown', 1);
        p.play(key); p._curAnim = key; p._curAction = 'falldown';
      }
    });
    // the blast gives way to what is left
    this.time.delayedCall(380, () => {
      this.twWreck.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.twWreck, alpha: 1, duration: 480 });
      this.tweens.add({ targets: this.twBoom, alpha: 0, duration: 480,
                        onComplete: () => this.twBoom.setVisible(false) });
    });
    this.time.delayedCall(560, () => { this._twingoDeck(); this._wreckFire(); this._twState = 'wreck'; });
    // up again, and the way on is over it
    this.time.delayedCall(2100, () => {
      if (!this.player || !this.player.active) return;
      this._holdInput = false;
      this._inConversation = false;
      this.cfg.noJump = false;
      this._refreshHint();
      if (hero) { playAction(p, hero, 'idle', 1); p._curAnim = heroAnim(hero, 'idle', 1); }
      this.cameras.main.startFollow(p, false, 0.1, 0.1);
      this._say([['ETERWOLF', '¡Ave María...!'], ['ETERWOLF', "Over it. Don't touch the fire."]]);
      this._showTip('W  OR  SPACE  —  JUMP ONTO THE WRECK, THEN DOWN THE OTHER SIDE');
    });
  }

  // Bits of Twingo: blue panel, black metal, grey steel, glass.
  _throwDebris(cx, cy) {
    const k = this.playScale || 1, cols = [0x34507e, 0x2b2622, 0x6a6f78, 0x3a4f7a, 0xcfe4f2];
    for (let i = 0; i < 18; i++) {
      const f = ((i * 2654435761) % 1000) / 1000, g = ((i * 40503) % 997) / 997;
      const w = 6 + f * 16, h = 3 + g * 8, col = cols[i % cols.length];
      const o = this.add.rectangle(cx + (f - 0.5) * 60, cy + (g - 0.5) * 40, w, h, col, col === 0xcfe4f2 ? 0.75 : 1)
        .setDepth(11).setRotation(f * 6);
      this._debris.push({ o, vx: (f - 0.45) * 900 * k, vy: -(260 + g * 520) * k, spin: (g - 0.5) * 18,
                          floor: this.groundY + 2 + g * 8, bounced: false, t: 0 });
    }
  }

  _updateDebris(delta) {
    if (!this._debris.length) return;
    const dt = Math.min(0.05, (delta || 16.7) / 1000), g = this.physics.world.gravity.y;
    this._debris = this._debris.filter(d => {
      d.t += dt;
      d.vy += g * dt;
      d.o.x += d.vx * dt; d.o.y += d.vy * dt;
      d.o.rotation += d.spin * dt;
      if (d.o.y >= d.floor && d.vy > 0) {
        d.o.y = d.floor;
        if (!d.bounced) { d.bounced = true; d.vy *= -0.28; d.vx *= 0.45; d.spin *= 0.4; }
        else { d.vy = 0; d.vx *= 0.8; d.spin = 0; }
      }
      if (d.t > 2.6) {
        d.o.setAlpha(Math.max(0, d.o.alpha - dt * 1.5));
        if (d.o.alpha <= 0) { d.o.destroy(); return false; }
      }
      return true;
    });
  }
}

// A flame tongue for the fire particles: a soft teardrop, white so the
// emitter's colours tint it, hottest low and fading out toward its tip.
const FLAME_KEY = '__flametongue';
function flameTexture(scene) {
  if (scene.textures.exists(FLAME_KEY)) return;
  const W = 28, H = 56, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.save();
  g.translate(W / 2, H * 0.62);
  g.scale(1, 2);
  const r = W / 2;
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.restore();
  scene.textures.addCanvas(FLAME_KEY, c);
}

// The three Twingo drawings, locked to one car. They were drawn at the same
// size but not in the same place: on the 1000px copies the wheel hubs sit at
// 288/787 (burning), 334/858 (the blast) and 345/835 (the wreck), all with
// their tyres on row 460. Each is anchored on its own wheel midpoint and tyre
// line, so swapping one for the next leaves the car exactly where it was.
const TWINGO_ART = {
  car:   { key: 'scene_twingocar',   hubs: [287.7, 787.3], ground: 460.5 },
  boom:  { key: 'scene_twingoboom',  hubs: [333.7, 858.3], ground: 460.5 },
  wreck: { key: 'scene_twingowreck', hubs: [345.0, 835.0], ground: 460.5 }
};
const TWINGO_WHEELBASE_M = 2.35;      // a real Twingo's; sets the car's size
const TWINGO_X = 0.55;                // the car's wheels, as a fraction of the street
// The crushed roof: [x fraction across the wreck drawing, height above the
// tyre line in its pixels], the median first painted row of each slice. The
// hatch standing up at the back (0.73-0.82, up to 323) is left out: at 1.5m
// it is nearly his whole jump, so it stays scenery he passes in front of.
const TWINGO_DECK = [
  [0.19, 212], [0.22, 227], [0.25, 232], [0.28, 232], [0.31, 219], [0.34, 209],
  [0.37, 226], [0.40, 251], [0.43, 261], [0.46, 266], [0.49, 265], [0.52, 257],
  [0.55, 260], [0.58, 250], [0.61, 241], [0.64, 243], [0.67, 261], [0.70, 262],
  [0.72, 262]
];
// A glow the shape of the hole it lights.
//
// The generic door glow is a soft slab, which is right for a rectangular blast
// door and wrong for a hole knocked through a shopfront — a straight-edged
// rectangle of light over an arched, ragged opening reads as a panel stuck on
// the wall rather than as the doorway being lit.
//
// So the shape comes from the painting: read the backdrop inside the box the
// exit names, take how DARK each pixel is as the strength of the light there —
// the opening is the dark part, that is what makes it an opening — and blur
// the result so it falls off into the stonework instead of stopping at an
// edge. One build per exit, cached by the box it was cut from.
const _holeGlow = {};
// Returns { key, box } — the texture, and the fractions it was actually cut
// from, which are wider than the ones asked for: the light has to fall off
// somewhere, and if the sampled box stops at the edge of the hole then so does
// the glow, and it ends in a straight line again.
const HOLE_PAD = 0.45;
function holeGlowTexture(scene, bgKey, f) {
  const pw = (f.x1 - f.x0) * HOLE_PAD, ph = (f.y1 - f.y0) * HOLE_PAD;
  const box = { x0: Math.max(0, f.x0 - pw), x1: Math.min(1, f.x1 + pw),
                y0: Math.max(0, f.y0 - ph), y1: Math.min(1, f.y1 + ph) };
  const key = 'holeglow_' + bgKey + '_' + [f.x0, f.x1, f.y0, f.y1].join('_');
  if (scene.textures.exists(key)) return { key, box };
  if (_holeGlow[key] === null) return null;          // tried once, no good
  try {
    const src = scene.textures.get(bgKey).getSourceImage();
    const sx = Math.round(box.x0 * src.width),  sw = Math.round((box.x1 - box.x0) * src.width);
    const sy = Math.round(box.y0 * src.height), sh = Math.round((box.y1 - box.y0) * src.height);
    // Worked at a small size: this is a soft glow, it is drawn scaled up to
    // the door anyway, and blurring is cheaper the fewer pixels there are.
    const W = 96, H = Math.max(8, Math.round(W * sh / sw));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    cx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data;

    let m = new Float32Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      // dark = inside the opening. Squared so the near-black middle of the
      // hole counts for much more than merely shaded stonework.
      const v = Math.max(0, 1 - lum * 2.1);
      m[p] = v * v;
    }
    // separable box blur, a few passes, to feather it into the wall
    const tmp = new Float32Array(W * H);
    const R = 6;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let a = 0, n = 0;
        for (let k = -R; k <= R; k++) { const xx = x + k;
          if (xx >= 0 && xx < W) { a += m[y * W + xx]; n++; } }
        tmp[y * W + x] = a / n;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let a = 0, n = 0;
        for (let k = -R; k <= R; k++) { const yy = y + k;
          if (yy >= 0 && yy < H) { a += tmp[yy * W + x]; n++; } }
        m[y * W + x] = a / n;
      }
    }
    // Forced to nothing at the texture's own border. Padding the sampled box
    // is not enough on its own: the stonework out there is dark too, so the
    // mask never reaches zero by itself and the texture ends in a hard cut —
    // a rectangle again, just a softer one. This guarantees the falloff
    // whatever the painting happens to contain at the edges.
    // ...and through a radial falloff from the middle of the box, which is
    // what makes it a pool of light rather than a lit doorway. The mask on its
    // own is the shape of whatever is DARK in the painting, and the dark part
    // of a shopfront is the rectangular opening — so however softly it was
    // feathered it still read as a square. This keeps it honest (it still
    // lights only what is dark) while giving it a round silhouette.
    const EDGE = 0.22;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = Math.min(x, W - 1 - x) / (W * EDGE);
      const fy = Math.min(y, H - 1 - y) / (H * EDGE);
      const e = Math.min(1, Math.max(0, Math.min(fx, fy)));
      // distance from the centre in units of the half-box, so the falloff is
      // an ellipse that fits the opening rather than a circle that crops it
      const rx = (x - (W - 1) / 2) / ((W - 1) / 2);
      const ry = (y - (H - 1) / 2) / ((H - 1) / 2);
      const r = Math.sqrt(rx * rx + ry * ry);
      // full out to two thirds, then away to nothing by the edge of the box
      const g = Math.min(1, Math.max(0, (1.02 - r) / 0.36));
      m[y * W + x] *= g * g * (3 - 2 * g);
      m[y * W + x] *= e * e * (3 - 2 * e);          // smoothstep in from the edge
    }

    let peak = 0;
    for (let p = 0; p < m.length; p++) if (m[p] > peak) peak = m[p];
    if (peak < 0.02) { _holeGlow[key] = null; return null; }   // nothing dark in there

    const out = cx.createImageData(W, H);
    for (let p = 0; p < m.length; p++) {
      // The mask's own value, NOT stretched to fill the box. Normalising by
      // the peak drove everything that was even slightly dark to full
      // brightness, which turned the whole box into a solid amber rectangle —
      // the exact thing this was written to avoid.
      const a = Math.min(1, m[p]);
      // the game's amber, premultiplied — it is drawn with ADD, so the alpha
      // channel does the work and the colour only has to be right
      out.data[p * 4]     = 242;
      out.data[p * 4 + 1] = 177;
      out.data[p * 4 + 2] = 60;
      out.data[p * 4 + 3] = Math.round(a * 210);
    }
    cx.putImageData(out, 0, 0);
    scene.textures.addCanvas(key, cv);
    return { key, box };
  } catch (e) { _holeGlow[key] = null; return null; }
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
// What colour a picture is over a box, as fractions of the picture. Used to
// put the fallen span in the same light as the roadway it belongs to: the two
// are different files by different passes, and side by side the span read as
// a grey slab dropped onto a warm stone bridge.
function meanColour(scene, key, x0, x1, y0, y1) {
  try {
    const src = scene.textures.get(key).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    const X0 = Math.max(0, Math.round(x0 * src.width));
    const X1 = Math.min(src.width, Math.round(x1 * src.width));
    const Y0 = Math.max(0, Math.round(y0 * src.height));
    const Y1 = Math.min(src.height, Math.round(y1 * src.height));
    if (X1 <= X0 || Y1 <= Y0) return null;
    const d = cx.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 60) continue;            // transparent margin does not count
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return n ? { r: r / n, g: g / n, b: b / n, n } : null;
  } catch (e) { return null; }
}

// The brightest row of a picture inside a band, and how bright it is. The
// span's road surface is the lit line across it; its topmost painted pixel is
// the rubble sitting on that road, which is 38 source rows higher. Anchoring
// by the rubble put the roadway 7px below the deck line it is meant to
// continue, so what met the eye at the seam was broken stone.
// The colour of a picture's STONE inside a box: its lighter, low-saturation
// pixels (the top 40% by brightness among those under 30% saturation), per
// channel. An average over everything would mix in rebar, rust and shadow;
// this is the colour of the faces of the blocks, which is what the eye
// compares when one stone thing sits against another.
function stoneColour(scene, key, x0, x1, y0, y1) {
  try {
    const src = scene.textures.get(key).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    const X0 = Math.max(0, Math.round(x0 * src.width)), X1 = Math.min(src.width, Math.round(x1 * src.width));
    const Y0 = Math.max(0, Math.round(y0 * src.height)), Y1 = Math.min(src.height, Math.round(y1 * src.height));
    if (X1 <= X0 || Y1 <= Y0) return null;
    const d = cx.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx && (mx - mn) / mx < 0.30) px.push([r, g, b, 0.2126 * r + 0.7152 * g + 0.0722 * b]);
    }
    if (!px.length) return null;
    px.sort((a, c) => c[3] - a[3]);
    const top = px.slice(0, Math.max(1, Math.floor(px.length * 0.4)));
    const m = k => top.reduce((acc, q) => acc + q[k], 0) / top.length;
    return { r: m(0), g: m(1), b: m(2) };
  } catch (e) { return null; }
}

function brightestRow(scene, key, y0, y1, x0, x1) {
  try {
    const src = scene.textures.get(key).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    const X0 = Math.max(0, Math.round(x0 * src.width));
    const X1 = Math.min(src.width, Math.round(x1 * src.width));
    const Y0 = Math.max(0, Math.round(y0 * src.height));
    const Y1 = Math.min(src.height, Math.round(y1 * src.height));
    if (X1 <= X0 || Y1 <= Y0) return null;
    const d = cx.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
    const w = X1 - X0;
    let best = -1, bestY = Y0;
    for (let y = 0; y < Y1 - Y0; y++) {
      let sum = 0, n = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 60) continue;
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++;
      }
      if (n > w * 0.4) { const m = sum / n; if (m > best) { best = m; bestY = Y0 + y; } }
    }
    return best < 0 ? null : { y: bestY, lum: best, h: src.height };
  } catch (e) { return null; }
}

// Where the paint actually is inside a texture, and where its top SURFACE is
// — the first row opaque across most of its width, which on a slab is the
// walking surface rather than the first stray pixel of a drip or a weed.
const _paintBox = {};
function paintedBox(scene, key) {
  if (_paintBox[key] !== undefined) return _paintBox[key];
  let out = null;
  try {
    const src = scene.textures.get(key).getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext('2d');
    cx.drawImage(src, 0, 0);
    const d = cx.getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, x1 = -1, y0 = src.height, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      if (d[(y * src.width + x) * 4 + 3] > 60) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) throw new Error('nothing painted');
    let top = y0;
    for (let y = y0; y <= y1; y++) {
      let n = 0;
      for (let x = x0; x <= x1; x++) if (d[(y * src.width + x) * 4 + 3] > 150) n++;
      if (n > (x1 - x0) * 0.5) { top = y; break; }
    }
    out = { w: src.width, h: src.height, x0, x1, y0, y1, top,
            pw: x1 - x0 + 1, ph: y1 - y0 + 1 };
  } catch (e) { out = null; }
  _paintBox[key] = out;
  return out;
}

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
    this.cameras.main.fadeIn(260, 0, 0, 0);
    const H = 720;

    // Where the roadway actually ends, read off the picture at 2.4x rather
    // than from a brightness scan: 0.410 on the left, 0.565 on the right.
    //
    // Both earlier attempts were wrong in the same direction and for the same
    // reason. Averaging brightness down a band from the deck to 0.60 does not
    // measure the deck — it measures the deck plus the arch underneath it, and
    // the arch falls away toward the middle of the span long before the
    // roadway does. That reported the bridge ending at 0.30 when the stone you
    // can see runs to 0.41, so the floor stopped a hundred pixels short of it
    // and he fell off thin air.
    //
    // It also made the ravine look 0.37 of the picture wide when it is 0.155,
    // which is what forced the brothers up to 333px to span it.
    // the new bridge.png, measured four independent ways (by eye at 12x, a
    // per-column surface profile, registration against the old painting —
    // it is pixel-aligned, only regraded — and brightness). All agreed:
    //   the lips     0.410 and 0.566, the edges of the broken stone chunks
    //                (the iron rods poking out past them are not deck)
    //   the road     HUMPED: 0.495 at the gap, falling to ~0.53 at each end.
    // The old DECK of 0.522 fitted the ends and put his feet 19px down in the
    // stone facing at the gap, right where he jumps.
    const GAP0 = 0.410, GAP1 = 0.566, DECK = 0.495;

    // The gap is the painting's and cannot be moved, so the brothers are sized
    // to IT rather than the other way round: a ravine wants 2.4 of a man's
    // heights — past one jump, inside two.
    //
    // Which leaves the picture's own size as the only free number, and it is
    // not free either: zoom below 1 leaves a band of nothing above the art,
    // and nothing convincing can be painted into it. So zoom 1, the picture
    // filling the frame exactly, and the ravine that comes with it — 710px,
    // which at 2.4 heights puts him at 296.
    // The whole picture, no crop — the widest this stage can be framed.
    const ZOOM = 1.0;
    // A ravine wants about 2.13 of a man's heights: a single jump carries 1.80
    // and a double 2.93, so that is clear of one and inside the other.
    //
    // With the ravine measured properly at 298px, that is a 140px man — 78
    // px/m — where the mismeasured one demanded 333. The whole scene reads at
    // this size; at 333 he filled a third of the frame and you could not see
    // the bridge he was crossing.
    // A 182px man, held at the size he reached at zoom 1.30 while the picture
    // went back to 1.0. That is 1.3x the painting's own scale — the railings
    // say this bridge was drawn for a smaller man — which is the trade the
    // wide framing costs, and the right way round: the brothers read, and you
    // can see the whole crossing.
    const PX_PER_M = 101;

    // Motion used to be pinned at 0.78 here, apart from the size, because at
    // the old jump height a walking single jump carried 328px across a 298px
    // ravine and the stage stopped being about the double jump. Lowering the
    // jump made the pin unnecessary: a single now carries 269 and falls in.
    // So the brothers move on this bridge at the same speed they move
    // everywhere else, which is one fewer thing that is quietly different.

    this.buildWalk({
      bgKey: 'scene_bridgebg',
      worldW: 'auto', bgZoom: ZOOM, startXFrac: 0.02,
      groundFrac: DECK,
      pxPerM: PX_PER_M,
      // A missed jump restarts the stage with the bridge already down, rather
      // than dropping him somewhere and replaying the earthquake at him.
      fallRestart: true,
      title: 'THE BRIDGE',
      castSwitch: true, canReset: true,
      // The whole point of the stage, and the reason the sprint is off: a
      // sprinting single jump outreaches a walking double, so with it there is
      // no ravine width that needs two jumps and not one.
      doubleJump: true, noSprint: true,
      // No flat floor. The road is humped, and one flat line cannot sit on a
      // hump — at the gap's height he floated 22px over the road at the
      // start, at the ends' height his feet were in the stone at the gap. So
      // the road is a staircase of one-way ledges following the measured
      // profile in steps of at most 3px: the physics lifts a body over a step
      // that small (it is inside Arcade's overlap bias) where a solid step
      // would stop him dead. Walking it reads as walking up a slope.
      gaps: [{ atFrac: 0, wFrac: 1 }],
      ledges: humpLedges(BRIDGE_ROAD_L, 0.000, GAP0, 3 / 720)
        .concat(humpLedges(BRIDGE_ROAD_R, GAP1, 1.000, 3 / 720)),
      // The painting has already drawn what is down there — a black slab over
      // the top of it would hide the one thing worth seeing.
      gapShade: false,
      beats: [
        { at: 0, say: [['PLAYER', 'Bridge is still standing. Come on.']],
                 tip: 'CROSS THE BRIDGE' }
      ],
      exits: [
        { xFrac: 0.985, w: 90, target: 'DashScene', auto: true,
          silent: true, fadeMs: 190 }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x1b1410, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x7a2c10, 0.6); g.fillRect(0, 260, WW, 200);
      }
    });

    this._gapL = Math.round(GAP0 * this.worldW);
    this._gapR = Math.round(GAP1 * this.worldW);

    // "The bridge is so bright." I tried to answer that by measurement first —
    // match the painting's roadway to the fallen slab's — and the measurement
    // said there is nothing to match: the slab's lit road is the BRIGHTER of
    // the two, which is why the slab already takes a tint DOWN to meet the
    // bridge rather than the other way round. So the glare is not the roadway
    // against the slab, it is the whole picture, and no comparison inside it
    // will find that.
    //
    // This is therefore a decision, not a derivation: the backdrop is
    // multiplied to 0.86 across the board. Enough to take the shine off the
    // stone; not so much that the fires stop being fires, which is the thing
    // a flat multiply is always in danger of. The number is here to be moved.
    if (this.bgImage) {
      const c = Math.round(255 * BRIDGE_TONE);
      this.bgImage.setTint((c << 16) | (c << 8) | c);
      this._bgTone = BRIDGE_TONE;
    }
    // Coming back from a fall, the span is already gone and stays gone.
    if ((this.sys.settings.data || {}).resumed) {
      this.bridgeState = 'gone';
      this.span = null; this.halves = null; this._holdInput = false;
      this._showTip('JUMP, THEN JUMP AGAIN IN MID-AIR TO CLEAR THE GAP');
    } else {
      this._armSpan();
    }
  }

  // The span: the whole picture, scaled evenly, laid across the gap and
  // sitting ON the two roadways — its slab proud of the deck by its own
  // thickness, the way a plank laid over a hole sits on the ground either
  // side rather than flush with it.
  // One multiply tint that carries the span's road surface onto the painted
  // roadway's colour. Clamped to 1 per channel because a multiply tint can
  // only take light away — if the span were the darker of the two there would
  // be nothing to do, and the clamp says so rather than washing it out.
  _matchSpanToDeck(art) {
    return this._spanLook(art).tint;
  }

  // Where the span's roadway is in its own art, and what it takes to put it in
  // the same light as the painted one. Three numbers, all measured:
  //   anchor  the row to sit on groundY, so one lit road line crosses the gap
  //   tint    a multiply, when the span is the lighter of the two
  //   lift    an additive pass, when it is the darker — a multiply can only
  //           take light away, and here the span IS darker, which is why the
  //           first attempt's near-white tint changed nothing
  _spanLook(art) {
    if (this.__spanLook) return this.__spanLook;
    const out = { anchor: art.deck / art.h, tint: null, lift: 0 };
    const x0 = art.px0 / art.w, x1 = (art.px0 + art.pw) / art.w;
    const road = brightestRow(this, 'scene_bridgespan',
                              art.py0 / art.h, (art.bottom) / art.h, x0, x1);
    if (road) out.anchor = road.y / art.h;
    const dy = this.bgGeom ? (this.groundY - this.bgGeom.y) / this.bgGeom.h : 0.52;
    const g0 = this._gapL / this.worldW, g1 = this._gapR / this.worldW;
    const deckL = brightestRow(this, 'scene_bridgebg', dy - 0.035, dy + 0.005,
                               Math.max(0, g0 - 0.10), Math.max(0.02, g0 - 0.01));
    const deckR = brightestRow(this, 'scene_bridgebg', dy - 0.035, dy + 0.005,
                               Math.min(0.98, g1 + 0.01), Math.min(1, g1 + 0.10));
    const lum = deckL && deckR ? (deckL.lum + deckR.lum) / 2
                               : (deckL || deckR || {}).lum;
    // COLOUR, not just brightness. The span's stone is painted warm and
    // brownish (its faces average 114,100,91) and the bridge's is a neutral,
    // faintly cool grey (64,66,66). A grey tint could only darken it, so the
    // span stayed brown against a grey bridge. The tint is worked out per
    // channel — bridge stone over span stone, times the bridge's own dimming
    // since the painting is drawn toned — which pulls red down hardest and
    // lands the span on the bridge's grey.
    const bS = stoneColour(this, 'scene_bridgespan', x0, x1, 0, 1);
    const pL = stoneColour(this, 'scene_bridgebg', Math.max(0, g0 - 0.11), Math.max(0.01, g0 - 0.01), dy - 0.005, dy + 0.105);
    const pR = stoneColour(this, 'scene_bridgebg', Math.min(0.99, g1 + 0.01), Math.min(1, g1 + 0.11), dy - 0.005, dy + 0.105);
    const pS = pL && pR ? { r: (pL.r + pR.r) / 2, g: (pL.g + pR.g) / 2, b: (pL.b + pR.b) / 2 } : (pL || pR);
    if (bS && pS) {
      const ch = k => Math.max(0, Math.min(255, Math.round(255 * Math.min(1, (pS[k] * BRIDGE_TONE) / Math.max(1, bS[k])))));
      out.tint = (ch('r') << 16) | (ch('g') << 8) | ch('b');
      out.lift = 0;
    } else if (road && lum) {
      // no stone to read: fall back to the brightness match
      const r = (lum / Math.max(1, road.lum)) * BRIDGE_TONE;
      const c = Math.max(0, Math.min(255, Math.round(255 * Math.min(1, r))));
      out.tint = (c << 16) | (c << 8) | c;
    }
    this.__spanLook = out;
    return out;
  }

  _matchSpanToDeckOld(art) {
    // Both samples have to be the ROAD, not the stonework under it. The first
    // pass took a band below each deck line and so compared the span's broken
    // concrete underside against the arch's shadow — two dark cool things —
    // and came back with a tint that made the span bluer still.
    //
    // In the span's own art `deck` is the top of the slab, so its road surface
    // is the band just below that. On the painting the deck line is the
    // surface, so the roadway is the band just above it.
    const D = art.deck / art.h;
    const span = meanColour(this, 'scene_bridgespan',
                            art.px0 / art.w, (art.px0 + art.pw) / art.w,
                            D, D + 0.06);
    const g0 = this._gapL / this.worldW, g1 = this._gapR / this.worldW;
    const dy = this.bgGeom ? (this.groundY - this.bgGeom.y) / this.bgGeom.h : 0.52;
    const L = meanColour(this, 'scene_bridgebg', g0 - 0.10, g0 - 0.01, dy - 0.030, dy - 0.002);
    const R = meanColour(this, 'scene_bridgebg', g1 + 0.01, g1 + 0.10, dy - 0.030, dy - 0.002);
    if (!span || (!L && !R)) return null;
    const deck = L && R ? { r: (L.r + R.r) / 2, g: (L.g + R.g) / 2, b: (L.b + R.b) / 2 }
                        : (L || R);
    const ch = (d, s2) => Math.max(0, Math.min(255, Math.round(255 * Math.min(1, d / Math.max(1, s2)))));
    const t = (ch(deck.r, span.r) << 16) | (ch(deck.g, span.g) << 8) | ch(deck.b, span.b);
    return t;
  }

  _armSpan() {
    if (!this.textures.exists('scene_bridgespan')) return;
    const art = bridgeArt(this, 'scene_bridgespan');
    if (!art) return;

    // Onto each roadway far enough that the joins are covered.
    // Measured off the reference, on a 0.02 grid: its stone runs 0.325 to
    // 0.628 of the picture against a painted hole of 0.410 to 0.565 — so it
    // laps about 0.07 onto the roadway at each end and is twice the width of
    // the gap it covers. 0.005 met the lips and nothing more, which is why it
    // read as a piece hanging in the hole rather than a piece laid across it.
    //
    // He never stands on it: the collapse fires one body-height before the
    // lip, so the slab is there to be seen and then to break. That is what
    // makes the overlap and the height below free to be whatever looks right.
    const OVERLAP = Math.round(0.070 * this.worldW);
    const x0 = this._gapL - OVERLAP, wantW = (this._gapR + OVERLAP) - x0;
    // Off the PAINTED box, not the canvas — the picture carries transparent
    // margin, and scaling by the canvas would leave the slab short.
    const s = wantW / art.pw;
    this._spanScale = s;
    this._spanW = wantW;
    // How far its road surface stands above the roadway either side.
    // Proud, by the 0.013 of the picture's height the reference shows. Flush
    // was wrong: a slab dropped across a hole rests ON the road either side,
    // so its surface sits a little above the road's, and that small step is
    // most of what says "laid over" rather than "part of".
    // Down onto the deck. It stood 9px proud and read as hovering over the
    // road rather than lying across it.
    this._proud = 0;

    // The span and the backdrop are different files, and the span came out of
    // its pass a cooler, lighter grey than the warm stone it has to sit in.
    // Flush placement fixed where it sat; this fixes what it looked like.
    //
    // Both are measured rather than guessed: the roadway either side of the
    // hole, in a band just under the deck line, against the span's own road
    // surface in the same band. The tint is one over the other per channel,
    // which is exactly what a multiply tint undoes.
    const look = this._spanLook(art);
    this._spanTint = look.tint;
    this._spanAnchor = look.anchor;
    this._spanLift = look.lift;

    // The lift is a second copy of the same crop, blended additively over the
    // first. Stone takes it well — it brightens what is already lit and leaves
    // the shadows where they are, which is what a painted highlight does.
    const dress = (im, cropX, cropW) => {
      if (this._spanTint) im.setTint(this._spanTint);
      if (!this._spanLift) return [im];
      const up = this.add.image(im.x, im.y, 'scene_bridgespan')
        .setOrigin(im.originX, im.originY).setScale(im.scaleX, im.scaleY)
        .setDepth(im.depth).setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(this._spanLift);
      up.setCrop(cropX, 0, cropW, art.h);
      im._lift = up;
      return [im, up];
    };

    const mk = (cropX, cropW, originXpx) => {
      const im = this.add.image(0, 0, 'scene_bridgespan')
        .setOrigin(originXpx / art.w, this._spanAnchor)
        .setScale(s)
        // Above the two edges buildWalk draws down every hole in the floor —
        // while the span is there the hole is covered. Below the player at 10.
        .setDepth(3);
      im.setCrop(cropX, 0, cropW, art.h);
      im._dress = () => dress(im, cropX, cropW);
      return im;
    };
    this.span = mk(art.px0, art.pw, art.px0 + art.pw / 2);
    this.span.setPosition((this._gapL + this._gapR) / 2, this.groundY - this._proud);
    this.span._dress();
    if (this.span._lift) this.span._lift.setPosition(this.span.x, this.span.y);

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
        .setOrigin(originXpx / art.w, this._spanAnchor || (art.deck / art.h))
        .setScale(s).setDepth(3);
      im.setCrop(cropX, 0, cropW, art.h);
      im.setPosition(atX, y);
      // The halves are the same slab coming apart, so they carry its colour.
      if (this._spanTint) im.setTint(this._spanTint);
      if (this._spanLift) {
        const up = this.add.image(atX, y, 'scene_bridgespan')
          .setOrigin(im.originX, im.originY).setScale(s).setDepth(3)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(this._spanLift);
        up.setCrop(cropX, 0, cropW, art.h);
        im._lift = up;
      }
      return im;
    };
    const o = Math.round(0.014 * this.worldW);
    return [
      half(art.px0, mid - art.px0, art.px0, this._gapL - o),
      half(mid, art.px1 - mid + 1, art.px1 + 1, this._gapR + o)
    ];
  }

  // The additive copy that lifts the span into the roadway's light is a
  // separate image, so anything done to the slab has to be done to it too —
  // every tween takes both, and destroying one destroys the other.
  static _both(o) { return o && o._lift ? [o, o._lift] : [o]; }
  _kill(o) { if (!o) return; if (o._lift) o._lift.destroy(); o.destroy(); }

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
      targets: BridgeScene._both(this.span), x: sx + 5, duration: 55,
      yoyo: true, repeat: 17,
      onComplete: () => {
        if (!this.span) return;                    // scene restarted under us
        this.span.x = sx;
        if (this.span._lift) this.span._lift.x = sx;
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
        this._kill(this.span); this.span = null;
        this.halves = this._makeHalves();
        this._dust();

        const [L, R] = this.halves;
        this.tweens.add({ targets: BridgeScene._both(L), rotation: 0.20,
                          y: L.y + 14, duration: 620, ease: 'Quad.easeIn' });
        this.tweens.add({ targets: BridgeScene._both(R), rotation: -0.20,
                          y: R.y + 14, duration: 620, ease: 'Quad.easeIn',
          onComplete: () => {
            if (!this.halves) return;
            this.bridgeState = 'falling';
            this.halves.forEach((h, i) => this.tweens.add({
              targets: BridgeScene._both(h), y: h.y + 520, alpha: 0,
              rotation: h.rotation + (i === 0 ? 0.30 : -0.30),
              duration: 1100, ease: 'Quad.easeIn',
              onComplete: () => this._kill(h)
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
    this.cameras.main.fadeIn(260, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_dashstage',
      // Zoomed in, which is the only way to make him bigger without changing
      // the stage: the ledges are fractions of the picture, so they grow with
      // it and the px/m grows with them. 243px of gap against a 141px man is
      // the same 1.7 it was at 180 against 104 — an identical jump, larger.
      // worldH gives the camera somewhere to follow him when he goes up.
      // Zoomed IN here, which is the opposite lever from the bridge and for
      // the opposite reason. The brothers were reading as miniatures, and they
      // were not too small against the painting — a man IS taller than that
      // car, and at 82 px/m he already was — they were too small against the
      // FRAME, because this was the widest shot in the game. Everything scales
      // with the zoom together, the ravine included, so the jump is untouched:
      // 342px across and 261 up, against a single jump's 246 of rise. The
      // second jump is still the only way up, by 15px.
      // Framed like the tienda, which shows about half its street across with
      // the brothers at 110 px/m. At the tienda's own zoom (1.3) a single jump
      // would reach the deck here and the stage would stop teaching anything,
      // so 1.6 — the widest this painting can go and still need the double.
      // The whole crossing, ledge to deck, is on screen at once.
      worldW: 'auto', bgZoom: 1.6, worldH: 1066, startXFrac: 0.02,
      fallRestart: true,
      // The floor line is the roadway he starts on. Nothing else uses it —
      // the whole world is a hole and every surface is a ledge — but a missed
      // jump is put back on solid ground relative to it.
      groundFrac: 0.478,
      // What makes this crossing need the double jump is the HEIGHT: 209px up
      // from the ledge to the deck at this zoom, against 181 for one jump and
      // 362 for two. Across it is 274, and a walking double carries 428, so
      // the dash helps rather than being required.
      pxPerM: 110,
      title: 'THE DROP',
      castSwitch: true, canReset: true,
      doubleJump: true, dash: true,
      // No floor anywhere. Everything standable is a ledge, and what is not a
      // ledge is the valley.
      gaps: [{ atFrac: 0, wFrac: 1 }], gapShade: false,
      // Measured off the painting. Each is the top face of a piece of
      // stonework you can see, as a fraction of the picture.
      ledges: [
        // Read off a 6x crop with a grid every 0.01, not off the car. The lit
        // top edge of the coping runs dead flat at 0.478 and carries on to
        // 0.348, where it drops away down a vertical face you can see. 0.470
        // floated him a few pixels over it, and stopping at 0.335 walked him
        // off into air with a body-width of painted stone still in front of
        // him — which is what "you go before the brick floor" was.
        // SOLID, not one-way. Under the end of the road the painting is a wall
        // of stone blocks stepping down to the ledge, and a one-way ledge only
        // collides from above — from the middle ledge you could walk left
        // under the road and stand inside that stone. A solid block has a real
        // right face: you drop off the end of the road beside the wall and you
        // cannot get back under it.
        { x0: 0.000, x1: 0.350, y: 0.478, solid: true },   // the roadway, with the car
        // Read at 12x this time. The lit top edge runs dead flat at 0.549 and
        // carries on to 0.507, where it turns down a face you can see — 0.470
        // was a shadow across the stone, not the end of it, and stopping there
        // dropped him into the ravine with a body-width of ledge still under
        // the next step. The face at the left end is at 0.352.
        //
        // The surface is not level: it sits at 0.565 where he lands and ramps
        // up to 0.549 by 0.425. A ledge is one flat box, so it takes 0.559 —
        // his boots a little into the rubble at the takeoff end rather than a
        // little above the stone at the landing end, because feet buried in
        // debris read as standing and feet in the air do not.
        // Runs back UNDER the end of the roadway (0.348) rather than starting
        // at the ledge's painted face at 0.352. That corner is solid cement in
        // the painting; the four-thousandths between the two left a slot you
        // could drop straight through. Ledges are one-way, so the overlap
        // under the roadway costs nothing.
        { x0: 0.346, x1: 0.507, y: 0.559 },   // the ledge below it (tucked just under the wall's foot)
        // The deck's left face is at 0.600 and its surface at 0.378.
        { x0: 0.602, x1: 1.000, y: 0.378 }    // the deck above, and walkable
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
          silent: true, fadeMs: 190 }
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
    this._cardUp = false;       // the scene is reused; the card is per visit
    this._leavingCard = false;
    this.cameras.main.fadeIn(260, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_shopstreet',
      // Zoomed in so he reads at this distance; the ledges are fractions of
      // the picture, so they come with it.
      worldW: 'auto', bgZoom: 1.30, worldH: 820, startXFrac: 0.02,
      fallRestart: true,
      // The pavement in front of the shop, read off the painting.
      groundFrac: 0.845,
      // What this picture is drawn at: the shopfront opening is 0.28 of the
      // height, and a roll-up shop door is a shade over two metres, which puts
      // its metre at about 85px. He walks in at 153px and stands under that
      // opening like a man standing in a doorway.
      pxPerM: 110,
      title: 'THE TIENDA',
      castSwitch: true, canReset: true,
      // He arrives able to double jump and dash, and keeps both — there is
      // nothing here that needs them, but taking a move away again reads as a
      // bug rather than as design.
      doubleJump: true, dash: true,
      // No floor under the high roadway: step off it and you are committed.
      gaps: [{ atFrac: 0, wFrac: 0.30 }], gapShade: false,
      ledges: [
        { x0: 0.000, x1: 0.300, y: 0.380 },   // the roadway he arrives on
        // The block's stones top out at 0.566, not 0.550. Sixteen thousandths
        // of the picture is 15px at this zoom, and that is exactly the height
        // he was standing in the air above it.
        { x0: 0.307, x1: 0.462, y: 0.566 }    // the block standing over the drop
      ],
      // Coming back out of the shop after the fight in it, none of the
      // arriving-at-it lines apply: he has been in, and it did not go well.
      beats: GameState.seen['tienda-cleared'] ? [] : [
        { at: 0,    say: [['PLAYER', 'There. Still has a roof.']],
                    tip: 'WALK OFF THE EDGE — DROP TO THE BLOCK, THEN TO THE STREET' },
        { at: 0.62, say: [['PLAYER', 'Armas, equipo, reparaciones. Let us hope.']],
                    tip: 'PRESS  E  AT THE OPENING' }
      ],
      exits: [
        // The opening under the sign, measured off the painting. Lit the way
        // the bunker's blast door is lit, so the whole doorway reads as live
        // rather than a patch of shadow you have to guess at.
        // The opening, measured off the painting by averaging darkness down
        // the shopfront band and taking the widest dark run: x 0.845-0.912,
        // y 0.585-0.825. The earlier 0.772-0.874 was read off a crop by eye
        // and was a tenth of the picture to the left of the real hole.
        { xFrac: 0.878, w: 170, target: 'StoreScene',
          spawnXFrac: 0.03, glow: true, noArrow: true,
          glowFrac: { x0: 0.845, x1: 0.912, y0: 0.585, y1: 0.825 } }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x15100c, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x3a2a1c, 1); g.fillRect(0, 600, WW, 120);
      }
    });
    // Out of the shop with the horde behind them: that is the end of the
    // chapter, and the street says so instead of just stopping.
    if (GameState.seen['tienda-cleared']) this.time.delayedCall(1400, () => this._chapterCard());
  }

  _chapterCard() {
    if (this._cardUp) return;
    this._cardUp = true;
    this._holdInput = true;
    this._inConversation = true;
    const grp = [];
    grp.push(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.72).setScrollFactor(0).setDepth(95));
    grp.push(this.add.text(640, 300, 'CHAPTER 1', {
      fontFamily: F_UI, fontSize: '18px', fontStyle: '700', color: '#a08d72', letterSpacing: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(96));
    grp.push(this.add.text(640, 346, 'LA TIENDA', {
      fontFamily: F_UI, fontSize: '46px', fontStyle: '800', color: '#f2b13c',
      stroke: '#070605', strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(96));
    grp.push(this.add.text(640, 398, 'COMPLETE  ·  TO BE CONTINUED', {
      fontFamily: F_UI, fontSize: '15px', fontStyle: '700', color: '#d9c7a8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(96));
    grp.push(this.add.text(640, 470, 'ENTER  —  BACK TO THE MENU', {
      fontFamily: F_UI, fontSize: '12px', fontStyle: '700', color: '#8a6f4a'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(96));
    grp.forEach(o => o.setAlpha(0));
    this.tweens.add({ targets: grp, alpha: 1, duration: 900 });
    Sfx.ensure(); Sfx.clear();
    const leave = () => {
      if (this._leavingCard) return;
      this._leavingCard = true;
      this.cameras.main.fadeOut(900, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
    };
    this.time.delayedCall(1200, () => {
      this.input.keyboard.once('keydown-ENTER', leave);
      this.input.keyboard.once('keydown-SPACE', leave);
      this.input.once('pointerdown', leave);
    });
    this.time.delayedCall(9000, leave);
  }
}

// ================================================================== //
//  THE STORE — inside the tienda                                     //
//                                                                    //
//  The first stage built out of a drawn plan rather than measured    //
//  off the painting: every surface here is one of the red blocks in  //
//  the reference, read out of that image by colour rather than by    //
//  eye, so what you can stand on is exactly what was drawn. The two  //
//  dotted lines in the same image are the paths the two stone ledges //
//  travel, and they are read the same way.                           //
//                                                                    //
//  It asks for everything the three tutorials taught, in order: a    //
//  double jump to reach the balcony, timing to ride the low ledge,   //
//  and a dash to leave it. The chest on the balcony is the point of  //
//  the trip — both brothers come out of it armed — and the lever     //
//  beside it is what brings the high ledge across to the stairs.     //
// ================================================================== //
class StoreScene extends WalkScene {
  constructor() { super('StoreScene'); }

  create() {
    this.cameras.main.fadeIn(260, 0, 0, 0);
    // Back from the storage rooms with the thing in them dead: the shop is
    // not empty any more. Three come in the front, and a fourth through the
    // window. Until they are all down there is no way out.
    this._horde = !!GameState.seen['fight1-won'] && !GameState.seen['tienda-cleared'];
    this._cleared = !!GameState.seen['tienda-cleared'];

    // Zoomed so the brothers read against a room this wide. The painting's own
    // scale comes off the door on the right — 0.205 of the height for a door a
    // shade over two metres — which is 74 px/m at zoom 1 and a 133px man.
    const ZOOM = 1.25;
    const PX_PER_M = 92;

    // The new room, measured off new store interior.png on 12x crops. It is a
    // different room from the old one — no staircase, no middle shelf, no low
    // platform on the right — so every surface below was re-read, not moved.
    //   floor            lit floorboards, surface 0.835
    //   left balcony     top 0.399, ends at x 0.340 (the lever's machine on it)
    //   right balcony    top 0.303, from x 0.722 (the chest, by the locker)
    this.buildWalk({
      bgKey: 'scene_storeint',
      // The world is as tall as the painting, so the balconies near the top
      // have headroom and the camera somewhere to follow him.
      worldW: 'auto', worldH: 900, bgZoom: ZOOM, startXFrac: 0.03,
      groundFrac: 0.835, startOnFloor: true,
      pxPerM: PX_PER_M,
      title: 'THE TIENDA — INSIDE',
      castSwitch: true, canReset: true,
      doubleJump: true, dash: true,
      // Going down in the horde puts you back at the back door with it coming.
      keep: this._horde ? { spawnXFrac: 0.925 } : null,
      ledges: [
        // Both balconies are slabs, not one-way ledges: jump up under one and
        // your head stops at its underside. Thin, so the solid is the
        // balcony's own deck and not a block reaching down to the floor.
        { x0: 0.000, x1: 0.340, y: 0.399, ceiling: true, h: 36 },   // left: the lever
        // Runs right up to the end of the room: the painted balcony meets the
        // wall at 0.98, and stopping the floor there left a slot at the wall
        // you walked off the end of, past the chest.
        { x0: 0.722, x1: 1.000, y: 0.303, ceiling: true, h: 36 }    // right: the chest
      ],
      beats: (this._horde || this._cleared) ? [] : [
        { at: 0,    say: [['PLAYER', 'Somebody left in a hurry.']],
                    tip: 'DOUBLE JUMP ONTO THE MOVING LEDGE' },
        { at: 0.18, tip: 'ONE JUMP FROM THE LEDGE ONTO THE BALCONY — THE LEVER IS UP THERE' },
        { at: 0.55, tip: 'RIDE THE HIGH LEDGE ACROSS — THE CHEST IS ON THE FAR BALCONY' }
      ],
      exits: [
        // The door at the far right, on the floor, under the sign. It is the
        // end of what is built, so it does not start another scene.
        // The back door was the end of what was built. It opens on the
        // storage rooms now, by way of the conversation in the doorway.
        // The door painted at the lower right, x 0.925-0.964.
        { xFrac: 0.944, w: 110, label: 'THROUGH THE BACK DOOR', target: '__DARK__',
          when: () => !this._horde },
        // The way in from the street — the dark opening in the left wall —
        // is the way out once the shop is clear.
        { xFrac: 0.012, w: 100, target: 'ShopStreetScene', spawnXFrac: 0.86,
          auto: true, silent: true, when: () => !!GameState.seen['tienda-cleared'] }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x140f0c, 1); g.fillRect(0, 0, WW, 720);
        g.fillStyle(0x241c12, 1); g.fillRect(0, 580, WW, 140);
      }
    });

    const bg = this.bgGeom;
    this.fx = f => bg.x + f * bg.w;
    this.fy = f => bg.y + f * bg.h;

    // ---- the two travelling ledges -----------------------------------
    // Each is drawn at one end of its dotted line and travels to the other.
    // The low one runs the whole time; the high one is dead until the lever.
    this.movers = [
      // The low one runs the whole time, beside the left balcony's end.
      // Floor to it is 261 up — a double jump — and from its left end to the
      // balcony is 131: ONE jump, as asked, with 20px to spare. At the far end
      // of its run it is still short of the window, so it never covers it.
      // Smaller, and a shorter run. There is no sprint in here (Shift is the
      // dash), so the furthest anyone can go from its end is a walking double
      // jump plus one air dash: about 500px. At 0.140 wide running out to
      // 0.580 its end was 341px from the chest balcony — you could skip the
      // lever entirely. Now 0.050 wide, running to 0.430: 700px short.
      this._mover({ x0: 0.345, x1: 0.395, y: 0.545, to: 0.380, ms: 3600, live: true }),
      // The high one is dead until the lever, at the balcony's own height. It
      // crosses the WHOLE gap: its left edge starts at the balcony's end and
      // its right edge travels right up against the chest balcony (0.720, a
      // hair short of 0.722), so at the far end you step off it and one jump
      // (86 up) puts you on the chest ledge. No gap left to judge.
      this._mover({ x0: 0.345, x1: 0.485, y: 0.399, to: 0.580, ms: 5200, live: false })
    ];

    // On the far balcony, against the green locker (x 0.8955-0.9195).
    this._buildChest(0.866, 0.303);
    // On the green panel of the machine on the left balcony — measured at
    // x 0.2085-0.2265, y 0.248-0.335 — covering it exactly.
    this._buildLever({ x0: 0.2085, x1: 0.2265, y0: 0.248, y1: 0.335 });
    // The window, glazed. The horde will break it; nothing does yet.
    this._buildGlass({ x0: 0.408, x1: 0.453, y0: 0.195, y1: 0.372 });

    // Phaser builds each scene ONCE and reuses it, so anything set on `this`
    // survives into the next visit unless create() puts it back. Two things
    // here did not:
    //   _ending — set the moment you go through the back door, never cleared.
    //     Walk back out of the storage room into the store and the door is
    //     still "ending", so it ignores you. That is the door that worked
    //     once and then would not open.
    //   _swordsTaken — was reset to false, so coming back showed the chest
    //     shut again with the blades already on your back, and you could
    //     open it a second time.
    this._ending = false;
    this._swordsTaken = !!GameState.hasSwords;
    if (this._swordsTaken && this.chestAnim) {
      // already open: the clip's last frame, not the shut drawing
      this.chest.setVisible(false);
      this.chestAnim.setVisible(true).setFrame('co11');
      if (this.chestLabel) this.chestLabel.setAlpha(0);
    }

    // Its own listener rather than a JustDown in update. WalkScene's exit
    // check runs first every frame and reads JustDown(E) for its doorways —
    // and reading it is what clears it, so by the time the lever looked, the
    // press was already spent and the handle never moved.
    this.input.keyboard.on('keydown-E', () => {
      if (this._atChest()) this._openChest();
      else if (this._atLever()) this._throwLever();
    });

    if (this._horde) this._startHorde();
  }

  // ---- the horde ------------------------------------------------------
  // In through the front: out of the dark opening in the left wall, one after
  // another, across the shop floor at him. They came for the noise.
  _startHorde() {
    this._hordeKills = 0;
    this.onEnemyKilled = () => this._hordeKill();
    this.time.delayedCall(700, () => {
      if (this._dead) return;
      playTrack('fightMusic');
      Sfx.ensure(); Sfx.roar();
      this.cameras.main.shake(300, 0.004);
      this.startCombat();
      this._say([['PLAYER', 'The front. Something is coming in the front.']]);
      this._showTip('THEY ARE COMING IN FROM THE STREET');
    });
    [1900, 4700, 7500].forEach((t, i) => this.time.delayedCall(t, () => this._hordeAlien(i)));
  }

  _hordeAlien(i) {
    if (this._dead || this._transitioning) return;
    const z = this.spawnAlien({ x: this.fx(0.035), speed: 0.7 + i * 0.06, rage: 0.95,
                                calmLunge: true, lungeDelay: 1800 });
    // out of the dark of the doorway rather than appearing on the floor
    z.setAlpha(0);
    this.tweens.add({ targets: z, alpha: 1, duration: 500 });
  }

  _hordeKill() {
    this._hordeKills++;
    if (this._hordeKills === 3) this.time.delayedCall(1500, () => this._windowCrash());
    if (this._hordeKills >= 4) this._hordeCleared();
  }

  // The fourth comes through the glass: the pane goes, it drops from the
  // window to the floor, and comes on. (jump enemy.gif is the clip for this
  // leap once it is uploaded; until then it is its ordinary walk.)
  _windowCrash() {
    if (this._dead || this._transitioning || !this.glassBox) return;
    this.breakWindow();
    const gb = this.glassBox;
    const x = gb.x0 + gb.w / 2, y = gb.y0 + gb.h * 0.55;
    const dir = this.player.x >= x ? 1 : -1, H = this.alienH();
    const z = this.spawnAlien({ x, y, speed: 0.6, rage: 0.9, calmLunge: true, lungeDelay: 1300,
                                vx: dir * 0.9 * H, vy: -0.9 * H });
    Sfx.ensure(); Sfx.roar();
    this._say([['PLAYER', 'The window!']]);
    return z;
  }

  _hordeCleared() {
    if (this._cleared) return;
    this._cleared = true;
    this._horde = false;
    once('tienda-cleared');
    this.cfg.keep = null;
    stopTrack(3000);
    this.time.delayedCall(1400, () => {
      this._say([['ETERWOLF', "That's all of them."],
                 ['WOLFFEL',  'For now. Out the front — go.']]);
      this._showTip('OUT THE FRONT  —  LEFT, BACK TO THE STREET');
    });
  }

  // A one-way platform that moves. The collision box is static — the whole
  // stage's colliders are, and a dynamic immovable body would need its own —
  // so it is repositioned each frame and told to re-read where it is. The
  // player does not ride a static body by himself, so whatever is standing on
  // it gets the same step added to its own x. Without that he stands still
  // while the stone slides out from under him.
  _mover(m) {
    const w = (m.x1 - m.x0) * this.bgGeom.w;
    const y = this.fy(m.y);
    // Anchored and scaled off the PAINTED box. The drawing is 860x358 and its
    // stone only occupies x 23..835, y 118..287, so taking the canvas put the
    // slab's surface 60px below the line he stands on — he walked along the
    // air above it. The anchor is the slab's top SURFACE row rather than its
    // first painted pixel: one row apart on this drawing, but not on anything
    // with a weed or a pebble sticking up, and it is the surface that has to
    // meet the collision.
    const art = paintedBox(this, 'scene_ledgeprop');
    const im = this.add.image(this.fx(m.x0) + w / 2, y, 'scene_ledgeprop').setDepth(4);
    if (art) {
      im.setOrigin((art.x0 + art.pw / 2) / art.w, art.top / art.h);
      im.setScale(w / art.pw);
    } else {
      im.setOrigin(0.5, 0);
      im.setScale(w / im.width);
    }
    // The box is the stone's top face only, and one-way like every other
    // ledge here, so a jump from underneath passes through it.
    const box = this.add.rectangle(im.x, y + 30, w, 60, 0x000000, 0).setDepth(-1);
    this.physics.add.existing(box, true);
    const c = box.body.checkCollision;
    c.down = false; c.left = false; c.right = false;
    this.solidsW.push(box);
    this.physics.add.collider(this.player, box);
    return { im, box, w, y, from: m.x0, to: m.to, ms: m.ms, live: m.live, t: 0, dir: 1, dx: 0 };
  }

  // The chest: the still drawing while it is shut, and the supplied clip when
  // it is reached. The clip arrives as one horizontal strip, so its frames are
  // cut into the texture here rather than at load time.
  //
  // Worth saying plainly: across all 24 frames of that clip the lid does not
  // open. It is a glow — the metal lights up and the whole box brightens and
  // swells a little. So the clip plays and holds on its last frame, and what
  // carries "open" is the light out of it and the card that follows. A clip
  // where the lid actually lifts would drop straight in here.
  _buildChest(xf, groundFrac) {
    if (!this.textures.exists('scene_chest')) return;
    const x = this.fx(xf), y = this.fy(groundFrac);
    // A chest is a known width, about 1.1m, and both drawings are roughly
    // twice as wide as they are tall — so it is sized across. Sizing it by
    // height gave one as wide as a man is tall.
    const wantW = Math.round(1.25 * this.pxPerM);
    const im = this.add.image(x, y + 2, 'scene_chest').setOrigin(0.5, 1).setDepth(6);
    im.setScale(wantW / im.width);
    this.chest = im;
    this.chestX = x;
    this.chestY = y;
    // No glow behind it. The clip is the whole effect.
    this.chestLabel = this.add.text(x, y - im.displayHeight - 18, 'E  —  OPEN THE CHEST', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(8).setAlpha(0);

    // the clip, cut out of the strip
    const CHEST_FRAMES = 12;
    if (!this.textures.exists('scene_chestopen')) return;
    const tex = this.textures.get('scene_chestopen');
    const src = tex.getSourceImage();
    const fw = Math.floor(src.width / CHEST_FRAMES), fh = src.height;
    const names = [];
    for (let i = 0; i < CHEST_FRAMES; i++) {
      const n = 'co' + i;
      if (!tex.has(n)) tex.add(n, 0, i * fw, 0, fw, fh);
      names.push({ key: 'scene_chestopen', frame: n });
    }
    if (!this.anims.exists('chest-open')) {
      this.anims.create({ key: 'chest-open', frames: names, frameRate: 15, repeat: 0 });
    }
    // Laid over the still one at the same footprint, hidden until it is time.
    this.chestAnim = this.add.sprite(x, y + 2, 'scene_chestopen', 'co0')
      .setOrigin(0.5, 1).setDepth(6).setVisible(false);
    this.chestAnim.setScale(wantW / fw);
  }

  // The lever, bolted to the pillar at the end of the balcony. Two drawings,
  // off and on, so the throw is a crossfade with the handle's own travel
  // borrowed from the difference between them — plus the squash you feel in
  // your hand when a switch like that goes over.
  // The lever covers the painted panel it is bolted to: centred on the box and
  // sized off the lever's own PAINTED bounds, so the handle unit — not its
  // transparent margin — is what lines up with the panel behind it. The same
  // way switch 2 sits on the electrical box in the storage room. The old one
  // stood at a guessed height beside a machine that had its own painted switch,
  // so two switches overlapped.
  _buildLever(box) {
    if (!this.textures.exists('scene_leveroff')) return;
    const cx = this.fx((box.x0 + box.x1) / 2);
    const cy = this.fy((box.y0 + box.y1) / 2);
    const wantH = (box.y1 - box.y0) * this.bgGeom.h * 1.12;   // just covers it
    const mk = key => {
      const art = paintedBox(this, key);
      const o = this.add.image(cx, cy, key).setDepth(6);
      if (art) {
        o.setOrigin((art.x0 + art.pw / 2) / art.w, (art.y0 + art.ph / 2) / art.h);
        o.setScale(wantH / art.ph);
      } else {
        o.setScale(wantH / o.height);
      }
      return o;
    };
    this.leverOff = mk('scene_leveroff');
    this.leverOn = this.textures.exists('scene_leveron') ? mk('scene_leveron') : null;
    if (this.leverOn) this.leverOn.setAlpha(0);
    this.leverX = cx;
    this.leverY = cy;
    this.leverOnState = false;
    this.leverLabel = this.add.text(cx, cy - wantH / 2 - 14, 'E  —  THROW THE LEVER', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(8).setAlpha(0);
  }

  // Glass in the window: a faint cool pane, and a sheen that drifts across it
  // now and then, clipped to the frame. It is here so there is something to
  // break — breakWindow() shatters it, and nothing calls that yet. When the
  // horde comes in through the front of the shop, that is the call.
  _buildGlass(box) {
    const x0 = this.fx(box.x0), x1 = this.fx(box.x1);
    const y0 = this.fy(box.y0), y1 = this.fy(box.y1);
    const w = x1 - x0, h = y1 - y0;
    this.glassBox = { x0, y0, w, h };
    this.glass = this.add.rectangle(x0 + w / 2, y0 + h / 2, w, h, 0xa8c8dc, 0.11)
      .setDepth(-15).setBlendMode(Phaser.BlendModes.ADD);
    const clip = this.make.graphics({ x: 0, y: 0 }, false);
    clip.fillStyle(0xffffff); clip.fillRect(x0, y0, w, h);
    const mask = clip.createGeometryMask();
    this.glassSheen = this.add.rectangle(x0 - w, y0 + h / 2, w * 0.22, h * 1.8, 0xe8f4ff, 0.16)
      .setDepth(-14).setBlendMode(Phaser.BlendModes.ADD).setRotation(-0.45).setMask(mask);
    this.glassSheen._mask = clip;
    const sweep = () => {
      if (!this.glassSheen) return;
      this.glassSheen.x = x0 - w * 0.6;
      this.tweens.add({ targets: this.glassSheen, x: x1 + w * 0.6, duration: 1700,
        ease: 'Sine.easeInOut', onComplete: () => this.time.delayedCall(3800, sweep) });
    };
    this.time.delayedCall(1200, sweep);
  }

  breakWindow() {
    if (!this.glass) return;
    const { x0, y0, w, h } = this.glassBox;
    Sfx.ensure(); Sfx.burst(0.22, 0.6, 3200, 0.9); Sfx.burst(0.35, 0.35, 1400, 1.2);
    this.cameras.main.shake(160, 0.004);
    for (let i = 0; i < 26; i++) {
      const f = ((i * 2654435761) % 1000) / 1000, g = ((i * 40503) % 997) / 997;
      const sx = x0 + f * w, sy = y0 + g * h;
      const sh = this.add.triangle(sx, sy, 0, 0, 6 + f * 10, 2, 3, 8 + g * 12, 0xcfe4f2, 0.8)
        .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: sh, x: sx + (f - 0.5) * 220, y: this.groundY - 4,
        angle: (g - 0.5) * 720, alpha: 0, duration: 600 + g * 500, ease: 'Quad.easeIn',
        onComplete: () => sh.destroy() });
    }
    this.glass.destroy(); this.glass = null;
    if (this.glassSheen) { this.glassSheen._mask.destroy(); this.glassSheen.destroy(); this.glassSheen = null; }
  }

  _atChest() {
    return !!this.chest && !this._swordsTaken && !!this.player &&
           Math.abs(this.player.x - this.chestX) < 90 &&
           Math.abs(this.player.y - this.chestY) < 200;
  }

  _atLever() {
    return !!this.leverOff && !!this.player &&
           Math.abs(this.player.x - this.leverX) < 90 &&
           Math.abs(this.player.y - this.leverY) < 210;
  }

  _throwLever() {
    if (this._leverBusy) return;
    this._leverBusy = true;
    this.leverOnState = !this.leverOnState;
    Sfx.ensure(); Sfx.select();
    const a = this.leverOnState ? this.leverOff : this.leverOn;
    const b = this.leverOnState ? this.leverOn : this.leverOff;
    if (!b) { this._leverBusy = false; return; }
    // the handle goes over: a quick squash, the two states crossing under it
    this.tweens.add({ targets: [a, b], scaleY: a.scaleY * 0.93, duration: 70, yoyo: true });
    this.tweens.add({ targets: a, alpha: 0, duration: 110 });
    this.tweens.add({ targets: b, alpha: 1, duration: 110,
      onComplete: () => { this._leverBusy = false; } });
    // and the high ledge starts or stops
    const hi = this.movers[1];
    hi.live = this.leverOnState;
    this._showTip(this.leverOnState
      ? 'THE HIGH LEDGE IS MOVING — RIDE IT ACROSS TO THE CHEST'
      : 'THE HIGH LEDGE HAS STOPPED');
  }

  _openChest() {
    if (this._swordsTaken || !this.chest) return;
    this._swordsTaken = true;
    GameState.hasSwords = true;
    Sfx.ensure(); Sfx.land();
    if (this.chestLabel) this.chestLabel.setAlpha(0);
    // The clip takes over from the still drawing and holds where it ends.
    if (this.chestAnim) {
      this.chest.setVisible(false);
      this.chestAnim.setVisible(true).play('chest-open');
    }
    this._say([['PLAYER', 'Two of them. One each.']]);
    // The card comes after the clip, not over it.
    this.time.delayedCall(820, () => this._bladePanel());
    this.time.delayedCall(1100, () => this._showTip(
      'SWORD UNLOCKED — RMB OR  F  TO SWING  ·  NOW DOWN TO THE DOOR'));
    showBladeUnlocked();
  }

  // acquireWeapon's card is about a gun and tells you to go back outside, so
  // the blades get their own.
  _bladePanel() {
    const panel = this.add.rectangle(640, 350, 620, 190, 0x0d0a08, 0.93)
      .setScrollFactor(0).setDepth(90).setStrokeStyle(3, 0xf2b13c);
    const t1 = this.add.text(640, 300, 'A PAIR OF BLADES', {
      fontFamily: 'Courier New, monospace', fontSize: '26px', color: '#f2b13c',
      stroke: '#0d0a08', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const t2 = this.add.text(640, 340, 'one each  —  Eterwolf and Wolffel both carry one now', {
      fontFamily: 'Courier New, monospace', fontSize: '16px', color: '#d9c7a8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const t3 = this.add.text(640, 386, 'RMB  or  F  to swing  ·  hold the rhythm for the three-hit chain', {
      fontFamily: 'Courier New, monospace', fontSize: '14px', color: '#8a6f4a'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const grp = [panel, t1, t2, t3];
    grp.forEach(o => o.setAlpha(0));
    this.tweens.add({ targets: grp, alpha: 1, duration: 250 });
    this.time.delayedCall(3200, () => this.tweens.add({
      targets: grp, alpha: 0, duration: 450,
      onComplete: () => grp.forEach(o => o.destroy())
    }));
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.player || this._transitioning) return;

    // ---- carry the ledges, and whoever is standing on them ----------
    const d = Math.min(48, delta || 16);
    (this.movers || []).forEach(m => {
      m.dx = 0;
      if (!m.live) return;
      m.t += (d / m.ms) * m.dir;
      if (m.t >= 1) { m.t = 1; m.dir = -1; }
      if (m.t <= 0) { m.t = 0; m.dir = 1; }
      // ease in and out, so it arrives rather than stops dead
      const e = 0.5 - Math.cos(Math.PI * m.t) / 2;
      const want = this.fx(m.from + (m.to - m.from) * e) + m.w / 2;
      m.dx = want - m.im.x;
      m.im.x = want;
      m.box.x = want;
      m.box.body.updateFromGameObject();
    });
    // Standing ON one means his feet are at its top face and he is not rising.
    const b = this.player.body;
    (this.movers || []).forEach(m => {
      if (!m.dx || !b.blocked.down) return;
      const top = m.box.y - m.box.height / 2;
      if (Math.abs(b.bottom - top) > 6) return;
      if (b.right < m.box.x - m.w / 2 || b.left > m.box.x + m.w / 2) return;
      this.player.x += m.dx;
    });

    // ---- the chest, and the lever -----------------------------------
    // It opens when you ask it to, not when you brush past it.
    if (this.chestLabel) this.chestLabel.setAlpha(this._atChest() ? 1 : 0);

    if (this.leverOff) this.leverLabel.setAlpha(this._atLever() ? 1 : 0);
  }
}

// The back door opens on the storage rooms, by way of the conversation in the
// doorway. The end card it used to show is gone — there is somewhere to go now.
StoreScene.prototype.goExit = function (ex) {
  if (ex.target !== '__DARK__') return WalkScene.prototype.goExit.call(this, ex);
  // What is behind this door is a fight, and it can only be won with a blade.
  // The chest is up on the gantry and the door is down on the floor, so
  // without this you could walk straight past the blades into something you
  // have no way to hurt.
  if (!GameState.hasSwords) {
    if (!this._noBladeAt || this.time.now - this._noBladeAt > 2200) {
      this._noBladeAt = this.time.now;
      Sfx.ensure(); Sfx.deny();
      this._showTip('NOT WITHOUT A BLADE  —  THE CHEST IS UP ON THE GANTRY');
    }
    return;
  }
  if (this._ending) return;
  this._ending = true;
  this._transitioning = true;
  this.player.setVelocityX(0);
  playAction(this.player, this.player._hero, 'idle', this.player._facing);
  Sfx.ensure(); Sfx.select();
  this.cameras.main.fadeOut(420, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () => {
    // First time only. Walking back and forth through a door should not make
    // them rediscover torches.
    if (once('storage-torches')) {
      this.scene.start('IntroDialogueScene', {
        lines: STORAGE_DARK_LINES, sleeper: null, keepMusic: true,
        hold: 500, fadeMs: 420, bgKey: 'scene_storage1dark',
        target: 'StorageOneScene'
      });
    } else {
      this.scene.start('StorageOneScene');
    }
  });
};

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
//  DARKNESS AND TORCHES                                               //
//                                                                     //
//  Each storage room ships twice: the room with the power off and the //
//  same room lit. The dark one is the backdrop; the lit one is drawn  //
//  over it and masked, so a torch beam is a HOLE CUT IN THE DARKNESS  //
//  and the light falls on the actual painted room — the shelves, the  //
//  logs, the roots — rather than a yellow shape laid over a dark      //
//  picture. Throwing the wall switch drops the mask and the whole     //
//  room is simply lit.                                                //
//                                                                     //
//  A Phaser bitmap mask is resolved in SCREEN space: the mask source  //
//  is rendered to a framebuffer the size of the camera, not the       //
//  world. So the render texture is screen-sized, pinned with          //
//  scrollFactor 0, and the beams are drawn at screen coordinates —    //
//  world x minus the camera's scroll. Drawn at world coordinates the  //
//  beam sits still on the screen while the room slides past it, which //
//  is exactly the wrong way round.                                    //
// ================================================================== //
const TORCH_KEY = '__torchblob';
function torchTexture(scene) {
  if (scene.textures.exists(TORCH_KEY)) return TORCH_KEY;
  const R = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = R * 2;
  const cx = cv.getContext('2d');
  // A mask reads only alpha, so the colour does not matter — the falloff
  // does. Squared-off at the centre so the middle of the beam is fully
  // revealed rather than merely bright, and long in the tail so the edge of
  // the light dissolves into the dark instead of ending on a line.
  const g = cx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.38)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, R * 2, R * 2);
  scene.textures.addCanvas(TORCH_KEY, cv);
  return TORCH_KEY;
}

// Mixed into the storage scenes. `cfg.litKey` is the lit twin of cfg.bgKey.
const Darkness = {
  buildDark(litKey) {
    if (!this.textures.exists(litKey)) return;
    const bg = this.bgGeom;
    this.lit = this.add.image(bg.x, bg.y, litKey).setOrigin(0, 0).setDepth(-19);
    this.lit.setDisplaySize(bg.w, bg.h);

    torchTexture(this);
    // The dark painting on its own is quite readable — it is a picture of a
    // dim room, not a black one — so a beam that only reveals the lit twin
    // reads as a slightly warmer patch rather than a torch. Two layers fix
    // it. A scrim BETWEEN the two paintings pushes the unlit room down toward
    // black, so the beam has something to cut through. And an additive warm
    // wash drawn with the same shape as the mask, over everything, so the
    // beam itself is visible as light in the air rather than only as the
    // things it lands on.
    this.darkScrim = this.add.rectangle(bg.x + bg.w / 2, bg.y + bg.h / 2, bg.w, bg.h,
                                        0x000000, 0.72).setDepth(-19.5);
    this.beamRT = this.add.renderTexture(0, 0, 1280, 720)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.06);
    this.lightRT = this.make.renderTexture({ x: 0, y: 0, width: 1280, height: 720 }, false)
      .setOrigin(0, 0).setScrollFactor(0);
    this.lightRT.setVisible(false);          // it is a mask source, not scenery
    this.darkMask = new Phaser.Display.Masks.BitmapMask(this, this.lightRT);
    this.lit.setMask(this.darkMask);

    this.torchOn = true;
    this.roomLit = false;
    this._torchSeed = 0;

    this.torchLabel = this.add.text(1262, 650, 'L  TORCH', {
      fontFamily: 'Courier New, monospace', fontSize: '13px', color: '#8a6f4a'
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(80);

    this.input.keyboard.on('keydown-L', () => {
      if (this.roomLit) return;              // the switch has already won
      this.torchOn = !this.torchOn;
      Sfx.ensure(); this.torchOn ? Sfx.select() : Sfx.deny();
      this.torchLabel.setColor(this.torchOn ? '#d9c7a8' : '#6c5c47');
    });
  },

  // Called every frame from update().
  paintDark(time) {
    if (!this.lightRT || this.roomLit) return;
    const cam = this.cameras.main;
    this.lightRT.clear();
    if (this.beamRT) this.beamRT.clear();
    this._paintLamps(cam);           // a dying lamp does not care about your torch
    if (!this.torchOn) return;
    const sx = this.player.x - cam.scrollX;
    const sy = this.player.y - cam.scrollY;
    const face = this.player._facing || 1;
    // A torch, not a floodlight. It was a pool the size of a room and a wash
    // that lit the air around it; now it is a small pool at his feet and a
    // throw that NARROWS rather than widens as it goes out, fading with
    // distance the way a hand torch does. Three blobs, each further, smaller
    // and dimmer, overlap into a cone.
    const flick = 1 + Math.sin(time * 0.013) * 0.03 + Math.sin(time * 0.041) * 0.02;
    this.lightRT.draw(TORCH_KEY, sx - 80, sy - 60, 1, 0xffffff, 0.45 * flick,
                      undefined, undefined, 160, 160);
    const beam = [[110, 190, 0.85], [230, 170, 0.62], [340, 140, 0.38]];
    beam.forEach(([d, r0, a]) => {
      const r = r0 * flick, cx = sx + d * face, cy = sy - 50;
      this.lightRT.draw(TORCH_KEY, cx - r / 2, cy - r / 2, 1, 0xffffff, a,
                        undefined, undefined, r, r);
      if (this.beamRT) this.beamRT.draw(TORCH_KEY, cx - r / 2, cy - r / 2, 1,
                                        0xffd9a0, a, undefined, undefined, r, r);
    });
  },

  // The wall switch: the mask comes off and the room is simply lit.
  raiseLights() {
    if (this.roomLit) return;
    this.roomLit = true;
    if (this.lit) this.lit.clearMask();
    if (this.lightRT) this.lightRT.clear();
    if (this.beamRT) this.beamRT.clear().setVisible(false);
    if (this.darkScrim) this.tweens.add({ targets: this.darkScrim, alpha: 0, duration: 500 });
    if (this.torchLabel) this.torchLabel.setAlpha(0);
    // a beat of flicker as the tubes strike, then steady
    if (this.lit) {
      this.lit.setAlpha(0.2);
      [90, 150, 240, 330, 470].forEach((t, i) =>
        this.time.delayedCall(t, () => this.lit.setAlpha(i % 2 ? 0.25 : 1)));
      this.time.delayedCall(620, () => this.lit.setAlpha(1));
    }
  },

  // Lamps on their way out. There is no shape drawn for them — no glow, no
  // halo. The lit twin of the painting already has each lamp painted ON, with
  // its light falling on the wall around it, so a lamp that catches for a
  // moment is simply that part of the lit painting let through the mask. The
  // room flickers, rather than a circle blinking over it.
  //
  // Positions are measured, not guessed: the brightest warm clusters in the
  // top half of the lit painting. The first attempt guessed, put one of them
  // at 0.36 of the room when it hangs at 0.89, and the halo it drew glowed on
  // nothing.
  buildFlicker(lamps) {
    if (!this.lit || !lamps || !lamps.length) return;
    const bg = this.bgGeom;
    this.flickers = lamps.map((L, i) => ({
      x: bg.x + ((L.x0 + L.x1) / 2) * bg.w,
      y: bg.y + ((L.y0 + L.y1) / 2) * bg.h,
      // how much of the painted light to let through: wide, and dropping
      // further below the lamp than above it, the way a lamp lights a wall
      w: Math.max(260, (L.x1 - L.x0) * bg.w * 7),
      h: 420,
      on: 0, nextAt: 400 + i * 900, burstUntil: 0
    }));
  },

  paintFlicker(time) {
    if (!this.flickers || this.roomLit) return;
    this.flickers.forEach((f, i) => {
      if (time > f.nextAt) {
        // Badly, not rhythmically: long dead stretches, then a fit of it.
        f.burstUntil = time + 260 + ((i * 137 + (time | 0)) % 520);
        f.nextAt = f.burstUntil + 1600 + ((i * 911 + (time | 0)) % 4400);
      }
      if (time < f.burstUntil) {
        const t = (time * 0.045 + i * 3) | 0;
        f.on = (t * 2654435761 % 7) > 2 ? 1 : 0;
      } else {
        f.on = 0;
      }
    });
  },

  _paintLamps(cam) {
    if (!this.flickers) return;
    this.flickers.forEach(f => {
      if (!f.on) return;
      const sx = f.x - cam.scrollX, sy = f.y - cam.scrollY;
      this.lightRT.draw(TORCH_KEY, sx - f.w / 2, sy - f.h * 0.3, 1, 0xffffff, 0.95,
                        undefined, undefined, f.w, f.h);
    });
  }
};

// ================================================================== //
//  CUTTING                                                            //
//                                                                     //
//  The sword lives entirely in the combat scene: a hand-rolled        //
//  distance test over the wave system's enemy group, with a death     //
//  path wired to that scene's HUD, its wave counter and its           //
//  hard-coded floor. None of that transplants into a walking stage,   //
//  so a walking stage that needs a blade gets this instead — the same //
//  swing animation and the same reach, against a list of things that  //
//  can be cut.                                                        //
// ================================================================== //
const Cutting = {
  // The swing itself is WalkScene's now (every walking stage has one); this
  // only gives a stage a list of things the swing can cut.
  buildCutting() {
    this.cuttables = [];
  },

  // xf/yf are picture fractions; `owner` is the brother whose blade suits it.
  addCuttable(o) {
    const bg = this.bgGeom;
    const x = bg.x + o.xFrac * bg.w;
    const y = bg.y + o.yFrac * bg.h;
    const im = this.add.image(x, y, o.tex).setOrigin(0.5, 1).setDepth(o.depth || 7);
    const art = paintedBox(this, o.tex);
    if (art) {
      // by the painted box, never the canvas — see the moving ledges
      im.setOrigin((art.x0 + art.pw / 2) / art.w, (art.y1 + 1) / art.h);
      if (o.full) {
        // Floor to the top of the picture. A cord that stops in mid-air reads
        // as a prop stood on the floor; one that runs up out of the frame
        // reads as something that has grown through the building.
        const tall = y - bg.y;
        const sy = tall / art.ph;
        im.setScale(sy * (o.widthK || 1), sy);
      } else {
        im.setScale((o.m * this.pxPerM) / art.ph);
      }
    } else {
      im.setScale((o.m * this.pxPerM) / im.height);
    }
    const c = { im, x, y, owner: o.owner, hits: 0, dead: false, label: o.label,
                full: !!o.full, need: o.need || 0, gate: null };
    if (o.gate) {
      // A solid post in the cord's footprint, floor to the top of the room.
      // Walk into it and you stop; cut the cord down and it goes with it.
      const top = bg.y, h = y - top;
      const g = this.add.rectangle(x, top + h / 2, 34, h, 0x000000, 0).setDepth(-1);
      this.physics.add.existing(g, true);
      this.solidsW.push(g);
      if (this.player) this.physics.add.collider(this.player, g);
      c.gate = g;
    }
    this.cuttables.push(c);
    return c;
  },

  // How many swings this cord takes from whoever is holding the sword. His own
  // brother's cord goes in one; the other's takes three. That is what the two
  // blades are for — Wolffel's slab of a greatsword goes through the thick one
  // in a single pass, Eterwolf's katana through the thin one — and it is what
  // makes switching brothers on the cast buttons worth doing rather than a
  // cosmetic choice.
  hitsFor(c) { return c.need || (this.castId === c.owner ? 1 : 3); },

  cutOnce(c) {
    c.hits++;
    const need = this.hitsFor(c);
    this.cameras.main.shake(60, 0.003);
    this._goo(c.im.x, c.im.y - c.im.displayHeight * 0.5, 8);
    if (c.hits < need) {
      // it holds: a shudder and a white flash along the cut
      this.tweens.add({ targets: c.im, x: c.im.x + 6, duration: 45, yoyo: true, repeat: 2 });
      c.im.setTintFill(0xffffff);
      this.time.delayedCall(55, () => c.im.clearTint());
      const left = need - c.hits;
      this._showTip(left === 1 ? 'ONE MORE' : left + ' MORE — KEEP CUTTING');
      return;
    }
    // it goes: the top half tears away and the rest sags off its footing
    c.dead = true;
    if (c.gate) {
      c.gate.body.enable = false;
      const i = this.solidsW.indexOf(c.gate);
      if (i >= 0) this.solidsW.splice(i, 1);
      c.gate.destroy(); c.gate = null;
    }
    Sfx.ensure(); Sfx.squelch ? Sfx.squelch() : Sfx.land();
    this.cameras.main.shake(180, 0.006);
    this._goo(c.im.x, c.im.y - c.im.displayHeight * 0.5, 26);
    this.tweens.add({
      targets: c.im, angle: (c.owner === 'wolffel' ? 1 : -1) * 78,
      y: c.im.y + c.im.displayHeight * 0.22, alpha: 0,
      duration: 620, ease: 'Quad.easeIn', onComplete: () => c.im.destroy()
    });
    this.onCut && this.onCut(c);
  },

  _goo(x, y, n) {
    for (let i = 0; i < n; i++) {
      const f = ((i * 2654435761) % 1000) / 1000;
      const g = ((i * 40503) % 997) / 997;
      const p = this.add.circle(x + (f - 0.5) * 60, y + (g - 0.5) * 80,
                                3 + g * 5, 0xb07a86, 0.85).setDepth(9);
      this.tweens.add({
        targets: p, x: p.x + (f - 0.5) * 150, y: p.y + 60 + g * 120, alpha: 0,
        duration: 420 + f * 420, ease: 'Quad.easeIn', onComplete: () => p.destroy()
      });
    }
  }
};

// ================================================================== //
//  STORAGE ONE — the dark half of the store room                      //
//                                                                     //
//  Walk in on nothing but a torch beam, with two ceiling tubes that   //
//  have given up and stutter. Two alien cords have grown across the   //
//  far end and have to come down before the door will open.           //
// ================================================================== //
// How far the bridge is dimmed — the painting AND the fallen span, together.
// 0.86 on the painting alone left the span 16% brighter than the deck around
// it and both still reading as too bright.
// 0.88 on the new painting, which is regraded darker than the old: matched on
// the roadway band so the bridge lands where the old one did at 0.74.
const BRIDGE_TONE = 0.88;

// The road's height along the bridge, as [x, y] fractions of the painting —
// the middle of the road band, read off the new bridge.png. Humped: highest
// at the gap on both sides.
const BRIDGE_ROAD_L = [[0.00, 0.528], [0.06, 0.525], [0.12, 0.516], [0.27, 0.511],
                       [0.29, 0.505], [0.31, 0.499], [0.33, 0.494], [0.41, 0.495]];
const BRIDGE_ROAD_R = [[0.566, 0.495], [0.645, 0.495], [0.66, 0.502], [0.70, 0.510],
                       [0.84, 0.518], [0.90, 0.529], [0.94, 0.537], [1.00, 0.540]];

// A sloped surface as a run of flat one-way ledges: sample the profile, and
// start a new ledge whenever the height has moved by `step` (picture
// fraction). Each ledge sits at its run's HIGHEST point, so a foot is never
// below the painted road.
function humpLedges(pts, xa, xb, step) {
  const yAt = x => {
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * ((x - x0) / Math.max(1e-6, x1 - x0));
      }
    }
    return pts[pts.length - 1][1];
  };
  const out = [];
  const N = 400;
  let runX0 = xa, runTop = yAt(xa), runRef = runTop;
  for (let i = 1; i <= N; i++) {
    const x = xa + (xb - xa) * (i / N), y = yAt(x);
    if (Math.abs(y - runRef) >= step || i === N) {
      const xEnd = i === N ? xb : x;
      out.push({ x0: runX0, x1: xEnd, y: Math.min(runTop, y), h: 420 });
      runX0 = xEnd; runTop = y; runRef = y;
    } else {
      runTop = Math.min(runTop, y);
    }
  }
  return out;
}

const STORAGE_FLOOR = 0.855;     // both paintings share their geometry
// The goo in storage two, where the thing sits and gets up and where it
// stands when the lights come back on; and where he is standing when they do.
const STORAGE_GOO_X = 0.845;
const STORAGE_FIGHT_X = 0.40;
// The bunker's scale, so the brothers are the same size here as where the game
// starts. Everything else in these rooms — the cords, the switch, the creature
// — is given in metres and grows with it.
const STORAGE_PXM = 156;

class StorageOneScene extends WalkScene {
  constructor() { super('StorageOneScene'); }

  create() {
    // On the way back from the fight the cords are already down, and the
    // left edge — the door in from the tienda — is the way out again.
    const back = !!GameState.seen['fight1-won'];
    this.cameras.main.fadeIn(260, 0, 0, 0);
    this.buildWalk({
      bgKey: 'scene_storage1dark',
      worldW: 'auto', bgZoom: 1.0, startXFrac: 0.03,
      groundFrac: STORAGE_FLOOR, startOnFloor: true,
      pxPerM: STORAGE_PXM,
      title: 'THE STORAGE ROOM',
      castSwitch: true, canReset: true,
      doubleJump: true, dash: true,
      beats: back ? [{ at: 0, tip: 'BACK THROUGH TO THE TIENDA  —  LEFT' }] : [
        { at: 0,    tip: 'L  TORCH ON AND OFF  ·  F  OR RIGHT-CLICK TO CUT' },
        { at: 0.52, say: [['PLAYER', 'Something grew through the wall.']] }
      ],
      // One way in: walking back out to the store half way through undoes the
      // set piece, and is what put the door in the state it would not open.
      // The way back opens once the thing is dead.
      exits: [
        { xFrac: 0.012, w: 90, target: 'StoreScene', auto: true, silent: true,
          fadeMs: 190, spawnXFrac: 0.925, when: () => !!GameState.seen['fight1-won'] },
        { xFrac: 0.985, w: 90, target: 'StorageTwoScene', auto: true,
          silent: true, fadeMs: 190 }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x0b0c0e, 1); g.fillRect(0, 0, WW, 720);
      }
    });

    Object.assign(this, Darkness, Cutting);
    this.buildDark('scene_storage1lit');
    this.buildFlicker([
      { x0: 0.020, x1: 0.040, y0: 0.302, y1: 0.337 },   // the wall lamp by the door
      { x0: 0.894, x1: 0.923, y0: 0.311, y1: 0.320 }    // the tube at the far end
    ]);
    this.buildCutting();

    // Four growths wall off the way out, every one floor to ceiling, and
    // every one its OWN wall: you cannot walk through a cord, only cut it
    // down. There was a single wall behind the last one, so you could walk
    // straight through the first three.
    //   thin   — Eterwolf's katana goes through it in one; Wolffel needs three
    //   thick  — Wolffel's greatsword in one; Eterwolf needs three
    //   two masses of multiple alien rope — five cuts each, whoever swings
    const cord = (tex, xFrac, extra) => this.addCuttable(Object.assign({
      tex, xFrac, yFrac: STORAGE_FLOOR, full: true, gate: true, label: 'CORD' }, extra));
    if (!back) {
      this.cordThin  = cord('scene_ropethin',  0.580, { owner: 'eterwolf' });
      this.cordThick = cord('scene_ropebig',   0.670, { owner: 'wolffel', widthK: 0.7 });
      this.cordA     = cord('scene_ropemulti', 0.780, { need: 5, widthK: 0.95 });
      this.cordB     = cord('scene_ropemulti', 0.890, { need: 5, widthK: 0.95 });
    }

    this.onCut = () => {
      if (this.cuttables.every(c => c.dead)) {
        this._showTip('THE WAY THROUGH IS CLEAR');
        this._say([['PLAYER', 'Through here.']]);
      }
    };
  }

  fx(f) { return this.bgGeom.x + f * this.bgGeom.w; }

  update(time, delta) {
    super.update(time, delta);
    if (!this.player) return;
    this.paintFlicker(time);
    this.paintDark(time);
    // a cord you are standing at says which blade it wants
    const near = (this.cuttables || []).find(c => !c.dead &&
      Math.abs(c.im.x - this.player.x) < 1.2 * HUMAN_M * this.pxPerM);
    if (near && !this._cordTipAt) {
      this._cordTipAt = time + 2600;
      this._showTip(near.need
        ? 'F  OR RIGHT-CLICK — IT WILL TAKE ' + (near.need - near.hits) + ' CUTS'
        : (this.castId === near.owner
          ? 'YOUR BLADE — ONE CUT'
          : 'WRONG BLADE — THREE CUTS, OR SWITCH BROTHER'));
    }
    if (!near) this._cordTipAt = 0;
  }
}

// ================================================================== //
//  STORAGE TWO — where the thing is                                   //
//                                                                     //
//  The same darkness, and a wall switch halfway along. Throwing it    //
//  lights the room, and what the torch has not been pointed at all    //
//  this time is sitting in the corner.                                //
// ================================================================== //
class StorageTwoScene extends WalkScene {
  constructor() { super('StorageTwoScene'); }

  // One room, three visits:
  //   dark   — the first time in: torch, the cord, the switch, the thing in
  //            the corner, the conversation, the cinematic
  //   fight  — straight back in from the cinematic, the lights on: it stands
  //            there, the brothers see what this is, and it comes for them
  //   after  — it is dead: the lit room, empty, and the way back out
  create() {
    const d = this.sys.settings.data || {};
    this._mode = GameState.seen['fight1-won'] ? 'after' : (d.fight ? 'fight' : 'dark');
    const lit = this._mode !== 'dark';
    // Scenes are reused, so everything the dark visit hung on `this` has to be
    // put back, or the lit visit finds a destroyed torch mask and a creature
    // that is no longer in the room.
    this.lit = null; this.lightRT = null; this.beamRT = null; this.darkScrim = null;
    this.flickers = null; this.torchLabel = null; this.roomLit = false;
    this.creature = null; this.stander = null; this.switchCord = null;
    this.cordGate = null; this.darkWall = null; this.cuttables = [];
    this._fightPending = false; this._won = false;

    this.cameras.main.fadeIn(lit ? 420 : 260, 0, 0, 0);
    this.buildWalk({
      bgKey: lit ? 'scene_storage2lit' : 'scene_storage2dark',
      worldW: 'auto', bgZoom: 1.0, startXFrac: 0.03,
      groundFrac: STORAGE_FLOOR, startOnFloor: true,
      pxPerM: STORAGE_PXM,
      title: 'DEEPER IN',
      castSwitch: true, canReset: true,
      doubleJump: true, dash: true,
      // Dying, R or the cast buttons in the middle of the fight put you back
      // at the start of the fight, not in the dark at the start of the room.
      keep: this._mode === 'fight' ? { fight: true, retry: true, spawnXFrac: STORAGE_FIGHT_X } : null,
      beats: this._mode === 'dark' ? [{ at: 0, tip: 'FIND THE LIGHTS' }] : [],
      // The way back is the way in, and it opens when the thing is dead.
      exits: [
        { xFrac: 0.012, w: 90, target: 'StorageOneScene', auto: true, silent: true,
          fadeMs: 190, spawnXFrac: 0.955, when: () => !!GameState.seen['fight1-won'] }
      ],
      drawFallback(WW) {
        const g = this.add.graphics().setDepth(-20);
        g.fillStyle(0x0b0c0e, 1); g.fillRect(0, 0, WW, 720);
      }
    });

    // ---- the wall switch --------------------------------------------
    // Mounted on the painted electrical box, which is the switch this room
    // already has: a grey box on the wall, measured at x 0.352-0.378 and
    // y 0.444-0.548, with conduit running from it straight up to the tube
    // lamp hanging over it. Throw it and the light it is wired to comes on.
    this._buildSwitch({ x0: 0.352, x1: 0.378, y0: 0.444, y1: 0.548 });

    if (lit) {
      // Lights on, switch thrown.
      this.roomLit = true;
      if (this.swOn) { this.swOff.setAlpha(0); this.swOn.setAlpha(1); }
      if (this._mode === 'fight') this._setUpFight(d);
      else this.time.delayedCall(400, () => this._showTip('BACK THE WAY YOU CAME  —  LEFT'));
      return;
    }

    Object.assign(this, Darkness, Cutting);
    this.buildDark('scene_storage2lit');
    this.buildCutting();

    // ---- the thing in the corner ------------------------------------
    // In the heart of the web, where the roots converge at x 0.84-0.87 and
    // the goo pools on the floor under them — the picture the first cinematic
    // still shows. At 0.905 it stood on a black foreground silhouette that
    // runs x 0.905-0.94, and read as pasted on.
    // 0.845: still in the heart of the web with its feet in the goo, and far
    // enough left that, with the camera pinned at the room's right end, it
    // stands clear of the brothers' portraits while they talk about it.
    this._buildCreature(STORAGE_GOO_X, 0.842);

    // ---- a cord across the way to it -----------------------------------
    // Grown floor to ceiling just this side of the switch, so the lights are
    // behind it: cut it down (five cuts) or you cannot reach them. A solid
    // gate stands in its footprint until it falls.
    this.switchCord = this.addCuttable({ tex: 'scene_ropemulti', xFrac: 0.322,
      yFrac: STORAGE_FLOOR, full: true, need: 5, widthK: 0.8, label: 'CORD' });
    this.cordGate = this.add.rectangle(this.switchCord.im.x, this.groundY - 300, 40, 600,
                                       0x000000, 0).setDepth(-1);
    this.physics.add.existing(this.cordGate, true);
    this.solidsW.push(this.cordGate);
    this.physics.add.collider(this.player, this.cordGate);
    this.onCut = c => {
      if (c === this.switchCord && this.cordGate) {
        this.cordGate.body.enable = false;
        this.cordGate.destroy(); this.cordGate = null;
        this._showTip('THE SWITCH — E');
      }
    };

    // ---- and nothing past the switch until the lights are on -------------
    // An invisible stop a step beyond the switch, floor to ceiling. Without it
    // you could walk the length of the room in the dark and find the thing by
    // torchlight before anyone had turned a light on, which is the reveal
    // spent on nothing.
    const bg = this.bgGeom, wx = this.fx(0.418);
    this.darkWall = this.add.rectangle(wx, bg.y + (this.groundY - bg.y) / 2, 30,
                                       this.groundY - bg.y, 0x000000, 0).setDepth(-1);
    this.physics.add.existing(this.darkWall, true);
    this.solidsW.push(this.darkWall);
    this.physics.add.collider(this.player, this.darkWall);

    this._staged = false;
    this._leaving = false;
    // Scenes are reused, so a flag left set by the last visit would swallow ESC.
    this._inConversation = false;
    // If this room goes away while its conversation is still up, take the
    // conversation with it — its callbacks belong to this run.
    this.events.once('shutdown', () => {
      const dlg = this.scene.get('IntroDialogueScene');
      if (dlg && dlg.sys.settings.active && dlg.overlay) this.scene.stop('IntroDialogueScene');
    });
  }

  // ---- the fight ------------------------------------------------------
  // Back from the cinematic with "four enemies" already playing. It stands in
  // the goo where it got up — first encounter enemy.gif: it turns to them and
  // opens its claws, then holds there — while the brothers say what this is,
  // over their heads, no panels. Then it comes, slowly, until it is cut.
  _setUpFight(d) {
    playTrack('fightMusic');
    const x = this.fx(STORAGE_GOO_X), y = this.groundY;
    const S = ALIEN_FACE_SHEET, H = this.alienH();
    if (this.anims.exists('alien-face')) {
      this.stander = this.add.sprite(x, y + 2, S.key, 'ae0').setDepth(9)
        .setOrigin(S.cx / S.cw, (S.foot + 1) / S.ch).setScale(H / S.standH);
      this.stander.play('alien-face');
      this.stander.once('animationcomplete', () => {
        if (this.stander && this.stander.active) this.stander.play('alien-stand');
      });
    }
    // He faces it, and holds still while they talk.
    this._holdInput = true;
    this._inConversation = true;
    const p = this.player;
    p._facing = 1;
    heroFlip(p, p._hero, 1);
    // Both of them in the frame: him on the left, it on the right.
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.scrollX = Phaser.Math.Clamp((p.x + x) / 2 - 640, 0, this.worldW - 1280);
    const lines = d.retry ? [] : [
      ['ETERWOLF', "It's not sitting down any more."],
      ['WOLFFEL',  'Looks like we have to fight.']
    ];
    this.time.delayedCall(d.retry ? 200 : 1300, () => this._say(lines));
    // It starts when they have finished (or been skipped), and never before
    // the clip has had its moment. A timer, not a deadline read off the
    // clock: on a reused scene, create() still sees the clock where the room
    // last left it, so "now + 3s" was already in the past and it came at once.
    this._fightPending = true;
    this._fightReady = false;
    this.time.delayedCall(d.retry ? 1400 : 3200, () => { this._fightReady = true; });
  }

  _fightStarts() {
    this._fightPending = false;
    this._holdInput = false;
    this._inConversation = false;
    this.cameras.main.startFollow(this.player, false, 0.1, 0.1);
    const x = this.stander ? this.stander.x : this.fx(STORAGE_GOO_X);
    if (this.stander) { this.stander.destroy(); this.stander = null; }
    // "crawling slowly towards" — a quarter of its height a second until it is
    // hurt. It does not lunge until then either: the first blow is his.
    this.spawnAlien({ x, speed: 0.25, rage: 0.62, calmLunge: false, lungeDelay: 1500 });
    Sfx.ensure(); Sfx.roar();
    this.cameras.main.shake(260, 0.004);
    this._showTip('F  OR  RIGHT-CLICK  —  CUT IT DOWN');
    this.onEnemyKilled = (kx, dir) => this._fightWon(kx, dir);
  }

  // It dropped something: the pistol skids out of the pool toward him, clear
  // of the acid. Taking it is what ends the fight and opens the way back.
  _fightWon(kx, dir) {
    if (this._won) return;
    this._won = true;
    this.time.delayedCall(1300, () => {
      this.dropPistol(kx - dir * 0.62 * this.alienH());
      this._showTip('IT DROPPED SOMETHING');
    });
    this.onPistol = () => {
      once('fight1-won');
      this.cfg.keep = null;
      stopTrack(3500);
      this.time.delayedCall(1800, () => {
        this._say([['ETERWOLF', "Let's get out of here."],
                   ['WOLFFEL',  'Back the way we came.']]);
      });
      this.time.delayedCall(3600, () => this._showTip('WALK BACK  —  THE WAY YOU CAME'));
    };
  }

  fx(f) { return this.bgGeom.x + f * this.bgGeom.w; }
  fy(f) { return this.bgGeom.y + f * this.bgGeom.h; }

  // The thing in the corner: sit and stand up enemy.gif, PLAYED BACKWARDS.
  // The clip was drawn standing and then sitting down; reversed, it is
  // sitting in the goo and then getting up — which is what it does on
  // Eterwolf's "Señor, are you alright?". Until then it holds the first
  // (sitting) frame. The strip was cut against one box shared by all 17
  // frames, so nothing shifts as it rises.
  _buildCreature(xf, footFrac) {
    const KEY = 'scene_creaturerise', N = 17;
    if (!this.textures.exists(KEY)) return;
    const tex = this.textures.get(KEY);
    const src = tex.getSourceImage();
    const fw = Math.floor(src.width / N), fh = src.height;
    const frames = [];
    for (let i = 0; i < N; i++) {
      const n = 'rise' + i;
      if (!tex.has(n)) tex.add(n, 0, i * fw, 0, fw, fh);
      frames.push({ key: KEY, frame: n });
    }
    if (!this.anims.exists('creature-rise')) {
      // 7 a second rather than the gif's 5: it gets up in about two and a
      // half seconds, inside the line that sets it off
      this.anims.create({ key: 'creature-rise', frames, frameRate: 7, repeat: 0 });
    }
    const x = this.fx(xf), y = this.fy(footFrac || STORAGE_FLOOR);
    // Feet sit on row 240 of the shared 246-row box (242 sitting, 238 standing).
    this.creature = this.add.sprite(x, y + 2, KEY, 'rise0')
      .setOrigin(0.5, 241 / fh).setDepth(7);
    // Standing, it is about the brothers' height — the same proportion the
    // fight uses (its alien stands 0.94 of the brother), so it is the same
    // size when it comes at you.
    this.creature.setScale((0.95 * HUMAN_M * this.pxPerM) / (238 - 3));
    this.creatureX = x;
    this._risen = false;
    // Dark with the room until the lights come on; a torch pointed straight at
    // it catches the pale head and nothing else.
    this.creature.setTint(0x141414);
  }

  // Gets up. Called from the conversation, on Eterwolf's line.
  _creatureRise() {
    if (!this.creature || this._risen) return;
    this._risen = true;
    this.creature.play('creature-rise');
    Sfx.ensure(); Sfx.burst(0.5, 0.18, 180, 0.7);     // a wet, low shift of weight
  }

  // The lever art covers the painted box: centred on it, and sized off the
  // lever's own PAINTED bounds so the handle unit, not its transparent
  // margin, is what lines up with the box behind it.
  _buildSwitch(box) {
    if (!this.textures.exists('scene_leveroff')) return;
    const cx = this.fx((box.x0 + box.x1) / 2);
    const cy = this.fy((box.y0 + box.y1) / 2);
    const wantH = (box.y1 - box.y0) * this.bgGeom.h * 1.18;   // just covers it
    const mk = key => {
      const art = paintedBox(this, key);
      const o = this.add.image(cx, cy, key).setDepth(6);
      if (art) {
        o.setOrigin((art.x0 + art.pw / 2) / art.w, (art.y0 + art.ph / 2) / art.h);
        o.setScale(wantH / art.ph);
      } else {
        o.setScale(wantH / o.height);
      }
      return o;
    };
    this.swOff = mk('scene_leveroff');
    this.swOn = this.textures.exists('scene_leveron') ? mk('scene_leveron') : null;
    if (this.swOn) this.swOn.setAlpha(0);
    this.swX = cx; this.swY = cy;
    this.swLabel = this.add.text(cx, cy - wantH / 2 - 14, 'E  —  THE LIGHTS', {
      fontFamily: 'Courier New, monospace', fontSize: '15px', color: '#d9c7a8',
      stroke: '#0d0a08', strokeThickness: 4
    }).setOrigin(0.5, 1).setDepth(8).setAlpha(0);
    this.input.keyboard.on('keydown-E', () => { if (this._atSwitch()) this._throwSwitch(); });
  }

  _atSwitch() {
    return !!this.swOff && !this.roomLit && !!this.player &&
           (!this.switchCord || this.switchCord.dead) &&
           Math.abs(this.player.x - this.swX) < 110 &&
           Math.abs(this.player.y - this.swY) < 260;
  }

  _throwSwitch() {
    if (this.roomLit || this._staged) return;
    if (this.creature) this.time.delayedCall(620, () => this.creature.clearTint());
    // the stop beyond the switch goes with the dark
    if (this.darkWall) {
      this.darkWall.body.enable = false;
      const i = this.solidsW.indexOf(this.darkWall);
      if (i >= 0) this.solidsW.splice(i, 1);
      this.darkWall.destroy(); this.darkWall = null;
    }
    Sfx.ensure(); Sfx.select();
    if (this.swOn) {
      this.tweens.add({ targets: this.swOff, alpha: 0, duration: 110 });
      this.tweens.add({ targets: this.swOn, alpha: 1, duration: 110 });
    }
    if (this.swLabel) this.swLabel.setAlpha(0);
    this.raiseLights();
    this._stageTheThing();
  }

  // Lights on, and then the room is allowed to land before anything moves.
  _stageTheThing() {
    this._staged = true;
    // From the first moment, not from when the panel appears: ESC in the gap
    // before it would otherwise leave for the menu with the launch still
    // pending, and the panel would come up over the menu.
    this._inConversation = true;
    // Controls off while it plays out: he stands still and watches.
    this._holdInput = true;
    this.player.setVelocity(0, 0);
    const hero = this.player._hero;
    if (hero) {
      playAction(this.player, hero, 'idle', this.player._facing);
      this.player._curAnim = heroAnim(hero, 'idle', this.player._facing);
    }
    // Swing the camera round so the thing is in the middle of the frame —
    // between the two figures the conversation brings up — and let the lights
    // land before anyone speaks.
    const look = Math.max(0, Math.min(this.creatureX - 640, this.worldW - 1280));
    this.cameras.main.stopFollow();
    this.tweens.add({ targets: this.cameras.main, scrollX: look, duration: 900,
                      ease: 'Sine.easeInOut' });
    // The conversation runs OVER the live room, with its bar at the top of the
    // screen so the thing on the floor stays in view below it. It gets up on
    // the line that is cued to it; when the last line is done the room shakes
    // and the cinematic takes over.
    this.time.delayedCall(1900, () => {
      this.scene.launch('IntroDialogueScene', {
        lines: STORAGE_MEET_LINES,
        sleeper: null, keepMusic: true, hold: 300, fadeMs: 380,
        overlay: true, barTop: true,
        onLine: (i, line) => { if (line.cue === 'rise') this._creatureRise(); },
        onDone: () => {
          // The guard stays up until the room is gone — ESC during the shake
          // would otherwise race the cinematic to the next scene.
          if (this._leaving) return;
          this._leaving = true;
          const go = () => {
            this.cameras.main.shake(700, 0.007);
            this.time.delayedCall(800, () => {
              this.cameras.main.fadeOut(260, 0, 0, 0);
              this.cameras.main.once('camerafadeoutcomplete',
                () => this.scene.start('EnemyCinematicScene', { cast: this.castId }));
            });
          };
          // It gets all the way up before the cut: skipped before its line,
          // it rises now; mid-rise, the cut waits for it to finish.
          if (!this._risen) this._creatureRise();
          const c = this.creature;
          if (c && c.anims.isPlaying) {
            let went = false;
            const once = () => { if (!went) { went = true; go(); } };
            c.once('animationcomplete', once);
            this.time.delayedCall(2800, once);       // never hang on a missed event
          } else go();
        }
      });
      this.scene.bringToTop('IntroDialogueScene');
    });
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.player) return;
    if (this._mode === 'fight') {
      if (this._fightPending && this._fightReady && !this._sayQueue.length &&
          this.time.now >= this._sayUntil) this._fightStarts();
      return;
    }
    if (this._mode !== 'dark') return;
    this.paintFlicker(time);
    this.paintDark(time);
    if (this.swLabel) this.swLabel.setAlpha(this._atSwitch() ? 1 : 0);
    // the cord says how many cuts it wants when you walk up to it
    const c = this.switchCord;
    if (c && !c.dead && Math.abs(c.im.x - this.player.x) < 1.2 * HUMAN_M * this.pxPerM) {
      if (!this._cordTipAt) {
        this._cordTipAt = 1;
        this._showTip('F  OR RIGHT-CLICK — IT WILL TAKE ' + (c.need - c.hits) + ' CUTS');
      }
    } else this._cordTipAt = 0;
    // walking into the dark past the switch: say why he stops
    if (this.darkWall && this.player.body.blocked.right &&
        this.player.x > this.darkWall.x - 0.5 * this.charH &&
        time > (this._wallTipAt || 0)) {
      this._wallTipAt = time + 4000;
      this._showTip('TOO DARK TO GO ON  —  THE LIGHTS FIRST');
    }
    // The torch catches it: close, and pointed at it. Only the pale head of the
    // thing comes up out of the dark — enough to make you stop.
    if (this.creature && !this.roomLit) {
      const face = this.player._facing || 1;
      const dx = this.creature.x - this.player.x;
      const lit = this.torchOn && dx * face > 0 && Math.abs(dx) < 520;
      this.creature.setTint(lit ? 0x4a4440 : 0x141414);
    }
  }
}

// ================================================================== //
//  THE CINEMATIC                                                      //
//                                                                     //
//  Two stills, held. The second one shakes and screams, and then the  //
//  fight starts — back in the room, lit. "four enemies" comes in on   //
//  the first frame and plays on under the fight.                      //
// ================================================================== //
class EnemyCinematicScene extends Phaser.Scene {
  constructor() { super('EnemyCinematicScene'); }

  create() {
    const W = 1280, H = 720;
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    this._done = false;

    const show = key => {
      if (!this.textures.exists(key)) return null;
      const im = this.add.image(W / 2, H / 2, key).setDepth(1);
      const s = Math.max(W / im.width, H / im.height);
      im.setScale(s);
      return im;
    };

    this.a = show('scene_cine1');
    this.b = show('scene_cine2');
    if (this.b) this.b.setAlpha(0);
    // The song starts on the cut, not after it.
    playTrack('fightMusic');
    // A slow push in on the first still: it is coming, and you are watching.
    if (this.a) this.tweens.add({ targets: this.a, scale: this.a.scale * 1.06,
                                  duration: 1800, ease: 'Sine.easeIn' });

    // A film grain over both, so a still reads as a held frame rather than a
    // picture the game stopped on.
    this.grain = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.02)
      .setDepth(3).setBlendMode(Phaser.BlendModes.ADD);


    // ---- the beats ----
    this.time.delayedCall(1700, () => {
      if (this._done) return;
      if (this.b) this.tweens.add({ targets: this.b, alpha: 1, duration: 140 });
      this.cameras.main.shake(700, 0.012);
      Sfx.ensure(); Sfx.scream ? Sfx.scream() : Sfx.burst(0.5, 0.5, 260, 1.6, 'sawtooth');
    });
    this.time.delayedCall(2500, () => { if (!this._done) this.cameras.main.shake(400, 0.008); });
    this.time.delayedCall(3900, () => this._go());

    // Not skippable. It is four seconds, it is the first time you see the
    // thing, and it is the whole reason the room was dark.
  }

  update(time) {
    if (this.grain) this.grain.setAlpha(0.015 + ((time * 0.07) % 1) * 0.03);
  }

  _go() {
    if (this._done) return;
    this._done = true;
    this.cameras.main.fadeOut(360, 0, 0, 0);
    // Back into the room it was in, lights on, where it is standing waiting.
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('StorageTwoScene', {
      fight: true, spawnXFrac: STORAGE_FIGHT_X, cast: GameState.castId }));
  }
}

// The two mid-game conversations, in the same panel the game opens with.
const STORAGE_DARK_LINES = [
  { who: 'ETERWOLF', text: "It's black in here. La chimba, I'm not going any further." },
  { who: 'WOLFFEL',  text: "Hold on." },
  { who: 'WOLFFEL',  text: "Torches. A whole crate of them." },
  { who: 'ETERWOLF', text: "Now you're talking." }
];

const STORAGE_MEET_LINES = [
  { who: 'ETERWOLF', text: "What is that." },
  { who: 'WOLFFEL',  text: "...is that a person?" },
  { who: 'ETERWOLF', text: "Señor? Señor, are you alright?", cue: 'rise' },
  { who: 'ETERWOLF', text: "..." },
  { who: 'WOLFFEL',  text: "Mk. He looks hungry." }
];

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
    GameState.hasSwords = true;        // ...blades included
    showBladeUnlocked();
    this.castId = this._wantCast;      // read by GameScene.create when it builds the player
    super.create();

    // The wave director is the only part of the combat scene the sandbox does
    // not want: enemies come from the keyboard instead.
    this.waveTriggered = true;
    this.waveActive = false;
    this.spawnQueue = [];
    this.waveSpeed = 55;               // enemy speeds derive from this; NaN without it
    this.finisherEnabled = false;      // the toggle still turns it on here

    // A face for the wall crawler to live on. It used to be 330px of brick
    // across the middle of the yard, which made it a barricade the whole wave
    // shuffled up against and a thing you had to route around to reach
    // anything. It is 100px now — one jump clears 136, so it is a hop — it
    // sits at the far end out of the way, and the wave walks straight through
    // it. It is there to practise against, not to fight.
    const WX = WORLD_W - 300;
    this._testWall = this.addWall(WX, GROUND_Y - 100, GROUND_Y, 30, true);
    this.add.text(WX, GROUND_Y - 118, 'CRAWLER WALL', {
      fontFamily: F_UI, fontSize: '11px', fontStyle: '700', color: '#6f5c44'
    }).setOrigin(0.5, 1).setDepth(1);

    // Jump on the up arrow too, the way it is in the walking stages. In the
    // street fight UP tips the shot 45 degrees and jumping there stays on W
    // and SPACE; here the practice matters more than the extra gun angle, and
    // the 45 is still on the pad's right stick.
    this.input.keyboard.on('keydown-UP', () => this.bufferJump());

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

let _sandboxSaved = null;
function enterSandbox(from) {
  if (!DEV_BUILD || !from || from.scene.key === 'DebugScene') return;
  // It arms you; the story must not inherit that.
  if (!_sandboxSaved) _sandboxSaved = { hasWeapon: GameState.hasWeapon,
                                        hasSwords: GameState.hasSwords,
                                        hasPistol: GameState.hasPistol };
  stopMusic(200);
  from.scene.start('DebugScene');
}

function leaveSandbox(from) {
  if (!from) return;
  from.physics.world.timeScale = 1;
  if (_sandboxSaved) { Object.assign(GameState, _sandboxSaved); _sandboxSaved = null; }
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
// Phaser 3.87 only REPLACES a scene's settings.data when it is started with
// data that is truthy (Systems.start: `t && (i.data = t)`). Start a scene with
// nothing and it keeps whatever it was last started with — and every scene is
// built once and reused. So a later, data-less start of the dialogue panel
// replayed the storage room's overlay payload and froze on its callbacks, and
// a stage entered a second time could inherit `resumed: true` from an old
// fall. One wrapper, so no call site has to remember: no data means no data.
if (Phaser.Scenes && Phaser.Scenes.Systems && !Phaser.Scenes.Systems.prototype.__freshData) {
  const _sysStart = Phaser.Scenes.Systems.prototype.start;
  Phaser.Scenes.Systems.prototype.start = function (data) {
    return _sysStart.call(this, data || {});
  };
  Phaser.Scenes.Systems.prototype.__freshData = true;
}

// Fullscreen, from anywhere: Alt+Enter, or the menu's FULLSCREEN. It has to be
// started from a real key or click (the browser's rule), which both are.
function toggleFullscreen() {
  const g = window.__game;
  if (!g || !g.scale) return;
  try { g.scale.isFullscreen ? g.scale.stopFullscreen() : g.scale.startFullscreen(); } catch (e) {}
}
window.addEventListener('keydown', e => {
  if (e.altKey && (e.key === 'Enter' || e.code === 'Enter')) { e.preventDefault(); toggleFullscreen(); }
});

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  // The single-file build has no container and Phaser appends to the body,
  // which is right there. The hosted build wraps the canvas so the page can
  // lay out around it, and names it here.
  parent: (typeof document !== 'undefined' && document.getElementById('game')) ? 'game' : undefined,
  width: 1280,
  height: 720,
  // Smooth, not pixel art. None of the art is pixel art: the brothers are
  // 256px renders and the stages are paintings, shown at fractional scales.
  // pixelArt:true sampled every painting nearest-neighbour and told the page
  // to enlarge the canvas the same way, so fullscreen doubled pixels unevenly
  // and the scenery shimmered as the camera moved. The few genuinely pixel
  // sprites ask for NEAREST themselves (buildPixelTexture, the old zombies).
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  backgroundColor: '#0a0807',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY }, debug: false } },
  scene: [BootScene, StartScene, MenuScene, CharSelectScene, IntroDialogueScene,
          BunkerScene, ExitScene, JumpScene, BridgeScene, DashScene,
          ShopStreetScene, StoreScene,
          StorageOneScene, StorageTwoScene, EnemyCinematicScene,
          CityScene, ShopFrontScene, ShopScene,
          GameScene, DebugScene]
});

// ---- gamepad ----
// Exposed so the pad can be inspected from the browser console while tuning a
// mapping — `Pad.connected`, `Pad.axes`, `Pad._held` — and so the tests can
// drive it without reaching into the closure.
window.Pad = Pad;
// What the brothers are carrying, so a test can read it back without having
// to infer it from an animation.
window.GameState = GameState;
// Same reason: so the sound can be prodded from the console while tuning it,
// and so a test can count footsteps without listening to them.
window.Sfx = Sfx;
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

