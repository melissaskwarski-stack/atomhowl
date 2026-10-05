'use strict';
// Free-aim art, cut out of a gun sweep.
//
// The sweep GIFs (eterwolf gun.gif, wolffel gun.gif) are one standing figure
// swinging an empty fist from hanging at his side, up past level, to high over
// his head. They are the skeleton for aiming at any angle, but not usable as
// frames straight off the page:
//
//   - the torso leans back 20-odd degrees for the whole middle of the sweep, so
//     scrubbing from "down" to "level" would rock the body, and
//   - the head is thrown back for the level and raised frames and bowed for the
//     low ones — it never looks where the arm points.
//
// So the figure is taken apart into layers the game puts back together:
//
//   torso  one upright torso, no arm and no head (the raised-arm frame, turned
//          upright about the hip, with the arm and head cleared off it)
//   head   the level head off the standing frame, turned at runtime to follow
//          the aim — continuously, so it tracks the arm at every angle
//   arms   one arm per 5 degrees from straight down to straight up, each lifted
//          off the sweep frame whose arm is nearest that angle and hung from
//          the torso's shoulder. Where the sweep has a gap (it never goes
//          straight up) the nearest arm is turned about the shoulder to fill it.
//
// The legs are the hero's own frames and are cut by the hero tool; everything
// here is placed relative to the hip, which is where the two meet.
const { PNG } = require('pngjs');
const D2R = Math.PI / 180;

const mk = (W, H) => ({ W, H, d: new Uint8Array(W * H * 4) });
const clone = im => ({ W: im.W, H: im.H, d: Uint8Array.from(im.d) });

// bilinear, premultiplied: [r, g, b] premultiplied and a in 0..1
function sample(im, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, o = [0, 0, 0, 0];
  const taps = [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]];
  for (const [dx, dy, w] of taps) {
    const X = x0 + dx, Y = y0 + dy;
    if (w <= 0 || X < 0 || Y < 0 || X >= im.W || Y >= im.H) continue;
    const i = (Y * im.W + X) * 4, a = im.d[i + 3] / 255;
    o[0] += im.d[i] * a * w; o[1] += im.d[i + 1] * a * w; o[2] += im.d[i + 2] * a * w; o[3] += a * w;
  }
  return o;
}

// Screen rotation: positive is clockwise (y runs down). Aim angles are the
// other way — up is positive — so an arm turned up by a degrees is rot(-a).
const rotPt = (p, c, deg, d) => {
  const cs = Math.cos(deg * D2R), sn = Math.sin(deg * D2R), ux = p[0] - c[0], uy = p[1] - c[1];
  return [c[0] + ux * cs - uy * sn + (d ? d[0] : 0), c[1] + ux * sn + uy * cs + (d ? d[1] : 0)];
};
// Turn `im` by `deg` about `c`, then move it by `d`.
function transform(im, c, deg, d) {
  const out = mk(im.W, im.H), cs = Math.cos(-deg * D2R), sn = Math.sin(-deg * D2R);
  for (let y = 0; y < im.H; y++) for (let x = 0; x < im.W; x++) {
    const ux = x - c[0] - (d ? d[0] : 0), uy = y - c[1] - (d ? d[1] : 0);
    const sm = sample(im, c[0] + ux * cs - uy * sn, c[1] + ux * sn + uy * cs);
    if (sm[3] < 0.02) continue;
    const k = (y * im.W + x) * 4;
    out.d[k] = Math.round(sm[0] / sm[3]); out.d[k + 1] = Math.round(sm[1] / sm[3]);
    out.d[k + 2] = Math.round(sm[2] / sm[3]); out.d[k + 3] = Math.round(Math.min(1, sm[3]) * 255);
  }
  return out;
}
// a over b, in place on b
function over(b, a) {
  for (let k = 0; k < b.d.length; k += 4) {
    const aa = a.d[k + 3] / 255; if (!aa) continue;
    const ba = b.d[k + 3] / 255, oa = aa + ba * (1 - aa);
    for (let j = 0; j < 3; j++) b.d[k + j] = Math.round((a.d[k + j] * aa + b.d[k + j] * ba * (1 - aa)) / oa);
    b.d[k + 3] = Math.round(oa * 255);
  }
  return b;
}

// Distance from p to the segment a-b, and how far along it (0..1) p falls.
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
  return { d: Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t), t };
}

// The arm of one sweep frame on its own: everything within `r` of the bone
// shoulder -> elbow -> fist, plus the fist itself, faded in over the first few
// pixels out of the shoulder so its root blends into whatever torso it is hung
// on. `keep(x, y)` can veto pixels (the head, when the arm passes his face).
function armLayer(im, bone, r, fistR, keep) {
  const out = mk(im.W, im.H);
  const [S, E, T] = bone, ux = E[0] - S[0], uy = E[1] - S[1], uL = Math.hypot(ux, uy) || 1;
  for (let y = 0; y < im.H; y++) for (let x = 0; x < im.W; x++) {
    const k = (y * im.W + x) * 4; if (im.d[k + 3] < 128) continue;
    if (keep && !keep(x, y)) continue;
    const p = [x, y], a = segDist(p, S, E), b = segDist(p, E, T);
    const inArm = Math.min(a.d, b.d) <= r || Math.hypot(x - T[0], y - T[1]) <= fistR;
    if (!inArm) continue;
    // along the upper arm, measured from the shoulder: behind it is torso
    const along = ((x - S[0]) * ux + (y - S[1]) * uy) / uL;
    if (along < -3 && a.d < r + 2 && b.t === 0) continue;
    const fade = Math.max(0, Math.min(1, (along + 3) / 9));
    if (fade <= 0) continue;
    out.d.set(im.d.subarray(k, k + 3), k);
    out.d[k + 3] = Math.round(im.d[k + 3] * fade);
  }
  return out;
}

function bbox(im, thr) {
  let x0 = im.W, y0 = im.H, x1 = -1, y1 = -1;
  for (let y = 0; y < im.H; y++) for (let x = 0; x < im.W; x++)
    if (im.d[(y * im.W + x) * 4 + 3] > (thr || 8)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
function crop(im, b, pad) {
  pad = pad || 1;
  const X0 = b.x0 - pad, Y0 = b.y0 - pad, W = b.x1 - b.x0 + 1 + 2 * pad, H = b.y1 - b.y0 + 1 + 2 * pad;
  const out = mk(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = X0 + x, sy = Y0 + y; if (sx < 0 || sy < 0 || sx >= im.W || sy >= im.H) continue;
    out.d.set(im.d.subarray((sy * im.W + sx) * 4, (sy * im.W + sx) * 4 + 4), (y * W + x) * 4);
  }
  return { im: out, x0: X0, y0: Y0 };
}
function png(im) {
  const p = new PNG({ width: im.W, height: im.H });
  p.data.set(im.d);
  return 'data:image/png;base64,' + PNG.sync.write(p).toString('base64');
}

// Pull the colour of the surrounding figure into holes left inside it, so a
// cleared arm does not leave a notch in the torso. Only fills pixels that were
// opaque in `was` and are enclosed on both sides by what is left.
function inpaint(im, holes, passes) {
  for (let n = 0; n < (passes || 30); n++) {
    let changed = 0;
    const next = Uint8Array.from(im.d);
    for (let y = 1; y < im.H - 1; y++) for (let x = 1; x < im.W - 1; x++) {
      const k = y * im.W + x; if (!holes[k] || im.d[k * 4 + 3] > 200) continue;
      let s = [0, 0, 0], c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const q = ((y + dy) * im.W + x + dx) * 4; if (im.d[q + 3] < 200) continue;
        s[0] += im.d[q]; s[1] += im.d[q + 1]; s[2] += im.d[q + 2]; c++;
      }
      if (c < 3) continue;
      next[k * 4] = s[0] / c; next[k * 4 + 1] = s[1] / c; next[k * 4 + 2] = s[2] / c; next[k * 4 + 3] = 255;
      changed++;
    }
    im.d = next;
    if (!changed) break;
  }
  return im;
}

// Drop everything not joined to the biggest opaque piece: the slivers of arm
// edge and knuckle a capsule leaves behind.
function keepLargest(im) {
  const N = im.W * im.H, lab = new Int32Array(N).fill(-1), sizes = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] >= 0 || im.d[s0 * 4 + 3] < 40) continue;
    const id = sizes.length; let n = 0; const st = [s0]; lab[s0] = id;
    while (st.length) {
      const k = st.pop(); n++;
      const x = k % im.W, y = (k - x) / im.W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= im.W || Y >= im.H) continue;
        const q = Y * im.W + X; if (lab[q] >= 0 || im.d[q * 4 + 3] < 40) continue;
        lab[q] = id; st.push(q);
      }
    }
    sizes.push(n);
  }
  const big = sizes.indexOf(Math.max.apply(null, sizes));
  for (let k = 0; k < N; k++) if (lab[k] !== big) im.d[k * 4 + 3] = 0;
  return im;
}

// Build the layers.
//
// cfg (all in sweep-GIF pixels):
//   hip       the pivot the torso leans about, and where the legs meet it
//   shoulder  the shoulder joint on the upright (standing) frame
//   neck      the base of the neck on the standing frame: the head turns here
//   headCut   y of the line the head is cut along on the standing frame, and
//             headX [x0, x1], the columns the head occupies
//   base      the sweep frame the torso is taken from (arm raised clear)
//   lean      { frame: degrees } how far each used frame leans back
//   arms      [{ f, S?, E, T, grip }] per used frame: elbow, fist tip and grip
//             (S defaults to the shoulder carried through that frame's lean)
//   r, fistR  arm half-width and fist radius
//   step      degrees between arm frames
function build(sweep, cfg) {
  const W = sweep.W, H = sweep.H;
  const frame = i => ({ W, H, d: Uint8Array.from(sweep.frames[i]) });
  const hip = cfg.hip;
  // the torso's own shoulder and neck, carried through its turn
  const S0 = rotPt(cfg.shoulder, hip, cfg.baseTurn || 0);
  const N0 = rotPt(cfg.neck, hip, cfg.baseTurn || 0);
  const leanOf = f => (cfg.lean && cfg.lean[f]) || 0;
  // a torso leaning back (top toward his back, i.e. west) has turned
  // anticlockwise on screen, which is a negative screen rotation
  const shoulderIn = f => rotPt(cfg.shoulder, hip, (cfg.lean0 || 0) - leanOf(f));

  // ---- torso ----
  const bf = cfg.base, baseArm = cfg.arms.find(a => a.f === bf);
  let torso = frame(bf);
  {
    const S = baseArm.S || shoulderIn(bf);
    const arm = armLayer(torso, [S, baseArm.E, baseArm.T], cfg.r + 3, cfg.fistR + 5);
    const holes = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) if (arm.d[k * 4 + 3] > 0) {
      // the part of the arm out past the shoulder goes; the shoulder itself stays
      const y = Math.floor(k / W), x = k % W;
      const along = (x - S[0]) * (baseArm.E[0] - S[0]) + (y - S[1]) * (baseArm.E[1] - S[1]);
      if (along > 0 && Math.hypot(x - S[0], y - S[1]) > cfg.r * 0.8) { torso.d[k * 4 + 3] = 0; holes[k] = 1; }
    }
    // Clearing the raised arm takes a bite out of the chest under the armpit.
    // The chest's front edge is carried up from the rows below the arm and
    // what was cleared behind it is filled back in with the shirt around it.
    const front = y => { for (let x = W - 1; x >= 0; x--) if (torso.d[(y * W + x) * 4 + 3] > 128) return x; return -1; };
    const r0 = Math.round(S[1] + 16), r1 = Math.round(S[1] + 32);
    let n = 0, sy = 0, sx = 0, syy = 0, sxy = 0;
    for (let y = r0; y <= r1; y++) { const x = front(y); if (x < 0) continue; n++; sy += y; sx += x; syy += y * y; sxy += x * y; }
    const b = n > 2 ? (n * sxy - sx * sy) / (n * syy - sy * sy) : 0, a = n ? (sx - b * sy) / n : S[0];
    const fill = new Uint8Array(W * H);
    for (let y = Math.round(S[1] - 6); y < r0; y++) {
      const fx = a + b * y;
      for (let x = 0; x <= fx; x++) if (holes[y * W + x]) fill[y * W + x] = 1;
    }
    inpaint(torso, fill, 40);
    keepLargest(torso);
  }
  // stand it up (or part of the way: cfg.baseTurn, clockwise)
  const turnB = cfg.baseTurn || 0;
  if (turnB) torso = transform(torso, hip, turnB);
  // and take the head off: everything above the neck cut in the head's columns
  // (the cut rides with the neck, which the turn has moved)
  const cutY = cfg.headCut + (N0[1] - cfg.neck[1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // behind the nape the cut goes a little lower: the back of a thrown-back
    // head sits below the neckline there
    const lim = x < N0[0] - 6 ? cutY + 2 : cutY - 3;
    if (x < cfg.headX[0] || x > cfg.headX[1]) continue;
    if (y >= lim) {
      // Long hair down his back is cut by this line too. Feathered over a few
      // rows, the neck band's hair behind it shows through instead of a hard
      // edge across it (cfg.backFade rows, behind the nape only).
      const fr = cfg.backFade || 0;
      if (fr && x < N0[0] - 6 && y < lim + fr) {
        const k = (y * W + x) * 4 + 3;
        torso.d[k] = Math.round(torso.d[k] * (y - lim + 1) / (fr + 1));
      }
      continue;
    }
    // (the cut is made on the turned torso, so it is a plain row)
    torso.d[(y * W + x) * 4 + 3] = 0;
  }
  // nothing below the waist: the legs are the hero's own frames
  for (let y = cfg.waist + (cfg.overlap || 6); y < H; y++) for (let x = 0; x < W; x++) torso.d[(y * W + x) * 4 + 3] = 0;
  // the last rows fade, so the belt sits over the legs without a hard edge
  for (let y = cfg.waist; y < cfg.waist + (cfg.overlap || 6); y++) {
    const f = 1 - (y - cfg.waist) / (cfg.overlap || 6);
    for (let x = 0; x < W; x++) { const k = (y * W + x) * 4 + 3; torso.d[k] = Math.round(torso.d[k] * f); }
  }

  // ---- head ----
  // Off the standing frame, where he looks straight ahead: everything above
  // the cut in the head's columns, the last rows faded into the collar. The
  // cut can slope (it runs from the nape down to the throat), so the collar at
  // the back of the neck stays with the shirt instead of riding on the head.
  //
  // It turns about the top of the neck (hf.pivot, by the ear), the way a head
  // nods — turning it about the base of the neck swung the whole head forward
  // and back like a pendulum, and its cut-off bottom edge with it.
  const hf = cfg.headFrom, fh = frame(hf.frame || 0), FADE = 6;
  const cutAt = x => hf.cut + (x - hf.neck[0]) * (hf.slope || 0);
  const head = mk(W, H);
  for (let x = hf.x[0]; x <= hf.x[1]; x++) {
    const c = cutAt(x);
    for (let y = 0; y < c + 2; y++) {
      const k = (y * W + x) * 4; if (fh.d[k + 3] < 128) continue;
      head.d.set(fh.d.subarray(k, k + 4), k);
      if (y >= c + 2 - FADE) head.d[k + 3] = Math.round(head.d[k + 3] * (c + 2 - y) / (FADE + 1));
    }
  }
  // The neck: a band of skin and hair across the cut, drawn BEHIND the torso
  // and the head and turned half as far as the head. Whatever the head's turn
  // uncovers — the throat when he looks up, the nape when he looks down, the
  // hair at the back of Eterwolf's head — is neck rather than nothing. Shirt
  // (neutral black, or Eterwolf's dark green) is left out: the torso has its
  // own, and this one would only show as a second collar.
  const neckL = mk(W, H);
  const keepNeck = (r, g, b) => r >= g && r - b >= 4;
  const band = hf.band || [14, 12];          // rows above and below the cut
  for (let x = hf.x[0]; x <= hf.x[1]; x++) {
    const c = cutAt(x);
    for (let y = Math.max(0, Math.floor(c - band[0])); y < Math.min(H, c + band[1]); y++) {
      const k = (y * W + x) * 4; if (fh.d[k + 3] < 128) continue;
      if (!keepNeck(fh.d[k], fh.d[k + 1], fh.d[k + 2])) continue;
      neckL.d.set(fh.d.subarray(k, k + 4), k);
    }
  }
  const P = hf.pivot || [hf.neck[0], hf.neck[1] - 12];

  // ---- arms, one per step ----
  const src = cfg.arms.map(a => {
    const S = a.S || shoulderIn(a.f);
    const ang = Math.atan2(-(a.T[1] - a.E[1]), a.T[0] - a.E[0]) / D2R;   // the forearm: where the gun points
    return Object.assign({}, a, { S, ang });
  });
  const step = cfg.step || 5, arms = [];
  for (let A = -90; A <= 90 + 1e-6; A += step) {
    let best = src[0];
    src.forEach(s => { if (Math.abs(s.ang - A) < Math.abs(best.ang - A)) best = s; });
    const im = frame(best.f);
    const keep = cfg.keep ? (x, y) => cfg.keep(best, x, y) : null;
    const layer = armLayer(im, [best.S, best.E, best.T], cfg.r, cfg.fistR, keep);
    // hang it from the upright shoulder, then turn it the rest of the way
    const d = [S0[0] - best.S[0], S0[1] - best.S[1]];
    const turn = -(A - best.ang);
    const moved = transform(layer, best.S, turn, d);
    const grip = rotPt(best.grip, best.S, turn, d);
    const tip = rotPt(best.T, best.S, turn, d);
    arms.push({ ang: A, from: best.f, turn: Math.round(-turn), im: moved, grip, tip });
  }
  return { torso, head, neckL, arms, W, H, S0, N0, P };
}

// Everything relative to the hip, cropped, as data URIs.
function pack(built, cfg, pre) {
  const hip = cfg.hip, frames = {}, meta = {};
  const put = (name, im, org) => {
    const b = bbox(im); const c = crop(im, b, 1);
    frames[name] = png(c.im);
    return [c.x0 - org[0], c.y0 - org[1]];     // texture top-left, from `org`
  };
  const rel = p => [+(p[0] - hip[0]).toFixed(1), +(p[1] - hip[1]).toFixed(1)];
  meta.torso = { key: pre + 'torso', at: put(pre + 'torso', built.torso, hip) };
  // The head's texture is placed from its pivot (the top of the neck); the
  // pivot sits where it does on the standing frame, relative to the neck.
  const hf = cfg.headFrom, P = built.P;
  meta.head = { key: pre + 'head', at: put(pre + 'head', built.head, P) };
  meta.headAt = rel([built.N0[0] + P[0] - hf.neck[0], built.N0[1] + P[1] - hf.neck[1]]);
  // the neck band turns about the base of the neck
  meta.neckBand = { key: pre + 'neck', at: put(pre + 'neck', built.neckL, hf.neck) };
  meta.neck = rel(built.N0);
  meta.shoulder = rel(built.S0);
  meta.step = cfg.step || 5;
  meta.arms = built.arms.map((a, i) => ({
    key: pre + 'arm' + i, ang: a.ang, at: put(pre + 'arm' + i, a.im, hip), grip: rel(a.grip)
  }));
  // how far the head follows the arm: pitch = clamp(k * aim, lo, hi) degrees
  meta.headPitch = cfg.headPitch || [0.5, -30, 26];
  return { frames, meta };
}

// ---- legs ----------------------------------------------------------------
// The legs under the aim are the hero's own frames with everything above the
// waist cleared: the upper body is drawn over them from the layers above.
//
// opt.cut    { x, y, slope }: clear what is above the line through (x, y)
// opt.erase  boxes [x0, y0, x1, y1] to clear below it too — a hand resting on
//            a knee, the free arm swinging past the hip
// opt.skin   also clear skin-coloured pixels below the cut (bare hands)
// Anything cleared inside the silhouette (between opaque pixels on its row)
// is filled back in from the leg around it.
const isSkin = (r, g, b) => r > 140 && r - b > 60 && r > g + 25 && (r + g + b) / 3 > 95;
function legs(frame, W, H, opt) {
  const im = { W, H, d: Uint8Array.from(frame) };
  const c = opt.cut, cleared = new Uint8Array(W * H);
  const above = (x, y) => y < c.y + (x - c.x) * (c.slope || 0);
  // bare hands below the cut, grown by a pixel so their shaded edges go too
  const skin = new Uint8Array(W * H);
  if (opt.skin) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (im.d[k * 4 + 3] >= 30 && isSkin(im.d[k * 4], im.d[k * 4 + 1], im.d[k * 4 + 2])) skin[k] = 1;
  }
  const grown = new Uint8Array(skin);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (skin[y * W + x])
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) grown[(y + dy) * W + x + dx] = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (im.d[k * 4 + 3] < 30) continue;
    if (above(x, y)) { im.d[k * 4 + 3] = 0; continue; }
    const inBox = (opt.erase || []).some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
    if (inBox || grown[k]) { im.d[k * 4 + 3] = 0; cleared[k] = 1; }
  }
  // fill only what is enclosed on its row, so a hand hanging off the edge of a
  // leg goes rather than turning into more leg
  const fill = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (im.d[(y * W + x) * 4 + 3] >= 128) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    for (let x = l + 1; x < r; x++) if (cleared[y * W + x]) fill[y * W + x] = 1;
  }
  inpaint(im, fill, 40);
  keepLargest(im);          // specks of sleeve and glove the erase cut loose
  return im.d;
}
// Centre of the widest solid run across rows y..y+n of an RGBA frame: the
// pelvis, with strands, tassels and free hands (thin or separate) ignored.
function pelvisX(frame, W, y, n) {
  let best = null;
  for (let r = y; r <= y + (n || 0); r++) {
    let x = 0;
    while (x < W) {
      while (x < W && frame[(r * W + x) * 4 + 3] < 128) x++;
      const a = x; while (x < W && frame[(r * W + x) * 4 + 3] >= 128) x++;
      if (x - a > 0 && (!best || x - a > best.w)) best = { a, w: x - a };
    }
  }
  return best ? best.a + (best.w - 1) / 2 : W / 2;
}
// Where the hip is in a frame: on the waist row, a fixed distance in from the
// back edge (the back is the left edge for a figure facing east).
function hipOf(frame, W, waistY, fromBack, west) {
  let edge = -1;
  if (!west) { for (let x = 0; x < W; x++) if (frame[(waistY * W + x) * 4 + 3] > 128) { edge = x; break; } }
  else { for (let x = W - 1; x >= 0; x--) if (frame[(waistY * W + x) * 4 + 3] > 128) { edge = x; break; } }
  return [edge + (west ? -fromBack : fromBack), waistY];
}
// A frame's hip on the hero's canvas, through the same placement the cutter
// uses (box centred, clip's ground on CH-2) — so it lands on the drawn frame.
function onCanvas(d, i, p, CW, CH, mirror) {
  const b = d.boxes[i], w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  const ground = d._groundRow !== undefined ? d._groundRow : Math.max.apply(null, d.boxes.map(v => v.maxY));
  const ox = Math.floor((CW - w) / 2), oy = (CH - h - 2) - (d._pinEach ? 0 : (ground - b.maxY));
  const lx = mirror ? (w - 1 - (p[0] - b.minX)) : (p[0] - b.minX);
  return [ox + lx, oy + (p[1] - b.minY)];
}

// Everything a hero tool needs: the upper-body layers, the three leg states
// cut onto the hero's own canvas (east and west), and where each leg frame's
// hip is so the game can hang the upper body from it.
//   L       tools/lib/clipcut
//   clips   the hero's loaded clips (the leg sources are looked up here)
//   cfg     tools/aim_cfg.js entry
function heroAim(L, clips, cfg, dir, CW, CH, cut) {
  const path = require('path');
  const sw = L.decodeGif(path.join(dir, cfg.sweep));
  sw.frames.forEach(f => L.stripMatte(f, sw.W, sw.H));
  const packed = pack(build(sw, cfg), cfg, 'aim_');
  const frames = packed.frames, hips = {}, keys = {};
  const emit = (name, d, hipsSrc, mirror) => {
    keys[name] = d.frames.map((_, i) => {
      const k = name + '_' + i;
      frames[k] = cut(d, i, mirror);
      const h = onCanvas(d, i, hipsSrc[i], CW, CH, mirror);
      hips[k] = [h[0], h[1]];
      return k;
    });
  };
  const lg = cfg.legs;
  // standing: the sweep's legs, placed by the standing frame's body box
  {
    const f = sw.frames[lg.idle.frame], b0 = L.bbox(sw.frames[0], sw.W, sw.H);
    const d = { W: sw.W, H: sw.H, frames: [legs(f, sw.W, sw.H, { cut: lg.idle.cut })], boxes: [b0], _groundRow: b0.maxY };
    emit('aimidle', d, [cfg.hip], false);
    emit('aimidleW', d, [cfg.hip], true);
  }
  // moving: the hero's own sprint. Its fists stay up by the chest (unlike the
  // run-and-shoot clips, whose free hand swings past the hip), and it is the
  // gait he runs with everywhere else, so aiming does not change how he moves.
  {
    const src = clips[lg.run.clip], out = [], hs = [], boxes = [], px = [];
    const ic = lg.idle.cut.y, idleLegs = legs(sw.frames[lg.idle.frame], sw.W, sw.H, { cut: lg.idle.cut });
    // calibrate against the standing legs: where the hip sits from the pelvis
    const calib = cfg.hip[0] - pelvisX(idleLegs, sw.W, ic + lg.run.probe, 2);
    for (let i = 0; i < src.frames.length; i++) {
      const cy = lg.run.cut + (lg.run.cuts ? lg.run.cuts[i] || 0 : 0);
      const im = legs(src.frames[i], src.W, src.H, { cut: { x: 0, y: cy }, skin: true });
      out.push(im); boxes.push(src.boxes[i]);
      px.push(pelvisX(im, src.W, cy + lg.run.probe, 2));
    }
    // the pelvis reads a little differently frame to frame (a knee coming
    // through, a hand): smooth it round the loop so the torso does not shimmy
    const n = px.length, sm = px.map((_, i) => (px[(i + n - 1) % n] + 2 * px[i] + px[(i + 1) % n]) / 4);
    for (let i = 0; i < n; i++) {
      const cy = lg.run.cut + (lg.run.cuts ? lg.run.cuts[i] || 0 : 0);
      hs.push([sm[i] + calib + ((lg.run.dx || [])[i] || 0), cy + (cfg.hip[1] - ic)]);
    }
    const d = { W: src.W, H: src.H, frames: out, boxes, _groundRow: src._groundRow, _pinEach: src._pinEach };
    emit('aimrun', d, hs, false);
    emit('aimrunW', d, hs, true);
  }
  // crouched: down on a knee, from the end of his own crouch clip
  {
    const src = clips[lg.crouch.clip], i = lg.crouch.frame;
    const f = legs(src.frames[i], src.W, src.H, { cut: lg.crouch.cut, erase: lg.crouch.erase, skin: !!lg.crouch.skin });
    const d = { W: src.W, H: src.H, frames: [f], boxes: [src.boxes[i]], _groundRow: src._groundRow };
    emit('aimcrouch', d, [lg.crouch.hip], false);
    emit('aimcrouchW', d, [lg.crouch.hip], true);
  }
  // in the air: his own jump clip's legs — going up, at the top, coming down —
  // each cut at the belt, the hands that hang past it cleared, and the hip
  // found on the pelvis the way the run's is
  if (lg.air && clips[lg.air.clip]) {
    const src = clips[lg.air.clip], A2 = lg.air, out = [], hs = [], boxes = [];
    const ic = lg.idle.cut.y, idleLegs = legs(sw.frames[lg.idle.frame], sw.W, sw.H, { cut: lg.idle.cut });
    const calib = cfg.hip[0] - pelvisX(idleLegs, sw.W, ic + (A2.probe || 3), 2);
    A2.frames.forEach((fi, n) => {
      const cy = A2.cuts[n];
      const im = legs(src.frames[fi], src.W, src.H, { cut: { x: 0, y: cy }, erase: A2.erase || [], skin: true });
      out.push(im); boxes.push(src.boxes[fi]);
      hs.push([pelvisX(im, src.W, cy + (A2.probe || 3), 2) + calib + ((A2.dx || [])[n] || 0), cy + (cfg.hip[1] - ic)]);
    });
    const d = { W: src.W, H: src.H, frames: out, boxes, _groundRow: src._groundRow, _pinEach: src._pinEach };
    emit('aimairs', d, hs, false);
    emit('aimairsW', d, hs, true);
  }
  const A = (k, fps, rep) => ({ fps, repeat: rep === undefined ? -1 : rep, keys: k });
  const rev = a => a.slice().reverse();
  const air = lg.run.air || 0;
  const anims = {
    aimidle: A(keys.aimidle, 4), aimidleW: A(keys.aimidleW, 4),
    // moving with the aim: the sprint. Moving against it (backing away while
    // he keeps the gun on what he is facing) plays the same strides backwards.
    aimrun: A(keys.aimrun, lg.run.fps || 14), aimrunW: A(keys.aimrunW, lg.run.fps || 14),
    aimrunB: A(rev(keys.aimrun), lg.run.fps || 14), aimrunBW: A(rev(keys.aimrunW), lg.run.fps || 14),
    // off the ground he keeps aiming: on his jump's legs (up, top, down) if
    // they were cut, else on the stride with the legs most apart
    aimair: A([keys.aimairs ? keys.aimairs[1] : keys.aimrun[air]], 4),
    aimairW: A([keys.aimairsW ? keys.aimairsW[1] : keys.aimrunW[air]], 4),
    aimcrouch: A(keys.aimcrouch, 4), aimcrouchW: A(keys.aimcrouchW, 4)
  };
  if (keys.aimairs) ['up', 'top', 'down'].forEach((ph, n) => {
    anims['aimair' + ph] = A([keys.aimairs[n]], 4);
    anims['aimair' + ph + 'W'] = A([keys.aimairsW[n]], 4);
  });
  packed.meta.hips = hips;
  return { frames, anims, aim: packed.meta };
}

module.exports = { heroAim, legs, pelvisX, hipOf, onCanvas, isSkin, keepLargest, build, pack, transform, over, rotPt, armLayer, sample, mk, clone, bbox, crop, png, inpaint };
