#!/usr/bin/env node
// Turn the raw main-menu capture into something a browser will actually play.
//
// Three things are wrong with the file as exported:
//
//  1. It is HEVC in a QuickTime container. Safari copes; Chrome and Firefox
//     largely do not, and a Chromium built without the patented decoders
//     cannot open it at all. So it is re-encoded to VP9/WebM *and* H.264/MP4
//     and the page offers both, letting the browser take whichever it decodes.
//  2. The tail is a CapCut outro card. Everything from CUT_AT on is dropped.
//  3. The footage is a slow push-in, so a plain loop visibly snaps back. The
//     clip is mirrored (forward, then reversed) to make the loop seamless;
//     reversing a slow push-in just reads as a slow pull-out.
//
// Re-run after replacing public/assets/main_menu_video.mov, then rebuild.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public/assets/main_menu_video.mov');
const OUT = base => path.join(ROOT, 'public/assets/main_menu_video.' + base);
const FFMPEG = require('ffmpeg-static');

// Last clean second of footage. Raise this if a re-export drops the outro,
// lower it if the card starts earlier — check with:
//   ffmpeg -ss <t> -i <src> -frames:v 1 probe.png
const CUT_AT = 7.0;

if (!fs.existsSync(SRC)) {
  console.error('missing', path.relative(ROOT, SRC));
  process.exit(1);
}

// trim -> split -> reverse one copy (dropping the shared frame) -> join
const LOOP =
  `[0:v]trim=0:${CUT_AT},setpts=PTS-STARTPTS,split[a][b];` +
  `[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];` +
  `[a][r]concat=n=2:v=1[v]`;

// The menu track is a separate file and the video plays muted, so audio is
// dropped rather than re-encoded.
const ENCODES = [
  ['webm', ['-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1',
            '-cpu-used', '4', '-pix_fmt', 'yuv420p']],
  ['mp4',  ['-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0',
            '-pix_fmt', 'yuv420p', '-crf', '25', '-preset', 'slow',
            '-movflags', '+faststart']]
];

for (const [ext, args] of ENCODES) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', SRC, '-filter_complex', LOOP, '-map', '[v]', '-an',
    ...args, OUT(ext)], { stdio: 'inherit' });
  console.log(`${ext}: ${Math.round(fs.statSync(OUT(ext)).size / 1024)}KB`);
}
console.log(`looped ${CUT_AT}s of clean footage, mirrored to ${(CUT_AT * 2).toFixed(1)}s`);
