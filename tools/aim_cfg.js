'use strict';
// Where things are on the gun sweeps and on the leg clips, for tools/lib/aimrig.js.
// All in source-GIF pixels (256x256), measured off zoomed frames.
//
//   hip        the belt centre on the sweep: the upper body is hung from here
//   shoulder   the shoulder joint on the torso frame (`base`)
//   neck       the base of the neck on the torso frame: the head turns about it
//   headCut    rows above this, in columns headX, are the torso frame's own head
//   headFrom   the level head: frame, cut row at the neck (sloping from nape to
//              throat), its columns, its neck point, and the pivot it nods
//              about (the top of the neck, behind the ear)
//   arms       per sweep frame used: shoulder S, elbow E, fist tip T and grip
//              (the centre of the fist, where the gun's handle goes)
//   headPitch  [k, lo, hi]: the head turns k times the aim, within lo..hi
//   legs       the three leg states: where each clip's waist is cut, and what
//              else below it has to go (a hand on a knee, the free arm)
module.exports = {
  wf: {
    // better aim gun.gif: the same standing figure as wolffel gun.gif, with
    // a denser, cleaner sweep (arm frames every few degrees from +40 to -66)
    sweep: 'wf_betteraim_east.gif',
    hip: [131, 108], shoulder: [125, 60], waist: 110, overlap: 8,
    // the torso frame leans back ~17 degrees; turned 10 of them upright, so a
    // hanging arm comes down beside his chest instead of behind it
    base: 8, baseTurn: 10, neck: [106, 50], headCut: 51, headX: [78, 136],
    headFrom: { frame: 0, cut: 47, slope: 0.5, x: [110, 152], neck: [126, 50], pivot: [123, 38] },
    r: 10, fistR: 10, step: 5, headPitch: [0.5, -30, 26],
    arms: [
      { f: 8,  S: [125, 60],     E: [154.5, 39.8], T: [189, 11],  grip: [182.9, 16.1] },
      { f: 11, S: [125, 60],     E: [155.8, 43.1], T: [195, 21],  grip: [188, 24.9] },
      { f: 13, S: [125.1, 60],   E: [157.7, 48.3], T: [200, 33],  grip: [192.5, 35.7] },
      { f: 15, S: [125, 60],     E: [157.9, 50.7], T: [202, 42],  grip: [194.2, 43.6] },
      { f: 17, S: [125, 60],     E: [159.4, 52.9], T: [204, 47],  grip: [196.1, 48.1] },
      { f: 19, S: [125.3, 60],   E: [159.1, 55.3], T: [204, 52],  grip: [196, 52.6] },
      { f: 20, S: [125.4, 59.9], E: [160, 66.4],   T: [205, 67],  grip: [197, 66.9] },
      { f: 21, S: [125.8, 59.9], E: [160.3, 69.4], T: [205, 75],  grip: [197.1, 74] },
      { f: 22, S: [126.7, 59.8], E: [161.3, 71.3], T: [205, 82],  grip: [197.2, 80.1] },
      { f: 23, S: [127.2, 59.8], E: [159.3, 80.2], T: [201, 97],  grip: [193.6, 94] },
      { f: 24, S: [127.6, 59.7], E: [159.6, 83.5], T: [198, 107], grip: [191.2, 102.8] },
      // the low ones, where the fist comes down past the belt (read off the grid)
      { f: 26, S: [131, 59.6],   E: [151, 97],     T: [177, 131], grip: [171.5, 124] },
      { f: 28, S: [134.2, 59.7], E: [145, 100],    T: [167, 139], grip: [162, 131] },
      { f: 30, S: [136.2, 61.3], E: [142, 103],    T: [160, 144], grip: [156, 135] }
    ],
    legs: {
      // standing: the sweep's own legs, off the frame with the arm out level
      idle: { frame: 20, cut: { x: 0, y: 106 }, fromBack: 16 },
      // moving: the walk-and-fire clip, already what he does moving with a gun
      run: { clip: 'run', cut: 132, probe: 3, fps: 14, air: 4 },
      crouch: { clip: 'crouch', frame: 5, cut: { x: 92, y: 138, slope: 0.12 },
                erase: [[146, 134, 178, 186]], hip: [104, 140] }
    }
  },
  ew: {
    sweep: 'ew_gunsweep_east.gif',
    hip: [128, 108], shoulder: [120, 63], waist: 110, overlap: 8,
    base: 8, neck: [112, 55], headCut: 55, headX: [76, 125], backFade: 8,
    headFrom: { frame: 0, cut: 54, x: [98, 150], neck: [126, 54], pivot: [123, 42], band: [14, 30] },
    r: 10, fistR: 9, step: 5, headPitch: [0.45, -24, 22],
    arms: [
      { f: 8,  S: [120, 63], E: [153.7, 46],   T: [185, 21],  grip: [178.7, 26] },
      { f: 11, S: [120, 63], E: [155.5, 51.9], T: [189, 30],  grip: [182.3, 34.4] },
      { f: 12, S: [120, 63], E: [154.6, 52.7], T: [191, 36],  grip: [183.7, 39.3] },
      { f: 13, S: [120, 63], E: [155.1, 54.7], T: [193, 42],  grip: [185.4, 44.5] },
      { f: 14, S: [120, 63], E: [156.3, 63.2], T: [195, 53],  grip: [187.3, 55] },
      { f: 16, S: [120, 63], E: [155.5, 74.4], T: [195, 68],  grip: [187.1, 69.3] },
      { f: 26, S: [121, 63], E: [156, 74.3],   T: [196, 73],  grip: [188, 73.3] },
      { f: 27, S: [122, 63], E: [155.4, 77.6], T: [195, 83],  grip: [187.1, 81.9] },
      { f: 28, S: [125, 63], E: [153.9, 86.7], T: [192, 99],  grip: [184.4, 96.5] },
      { f: 29, S: [127, 63], E: [151.1, 91.4], T: [187, 109], grip: [179.8, 105.5] },
      { f: 30, S: [129, 63], E: [149.3, 91.4], T: [180, 117], grip: [173.9, 111.9] }
    ],
    legs: {
      idle: { frame: 20, cut: { x: 0, y: 106 }, fromBack: 16 },
      // the run-and-fire clip is drawn facing west (east is its mirror)
      run: { clip: 'sprint', cut: 110, probe: 3, fps: 14, air: 4 },
      crouch: { clip: 'crouch', frame: 9, cut: { x: 60, y: 176, slope: 0.3 },
                erase: [[102, 200, 124, 228]], hip: [84, 184] }
    }
  }
};
