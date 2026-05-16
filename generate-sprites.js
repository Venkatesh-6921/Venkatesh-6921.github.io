'use strict';

// generate-sprites.js — Creates 6-frame pixel art sprite strips for mascot emotions.
// Run: node generate-sprites.js
// Output: assets/mascot/*-sprite.png (192x32 each, 32x32 per frame)

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'assets', 'mascot');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ─── Mini canvas helper (no external deps) ───
// We'll generate PNGs using raw deflate + proper PNG chunks.
// For simplicity, we use a pure-JS PNG encoder.

function createPNG(width, height, pixels) {
  // pixels = flat Uint8Array of RGBA, row-major
  const zlib = require('zlib');

  // Build IDAT data: filter byte (0) + row pixels
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * (width * 4 + 1) + 1 + x * 4;
      rawData[di]     = pixels[si];
      rawData[di + 1] = pixels[si + 1];
      rawData[di + 2] = pixels[si + 2];
      rawData[di + 3] = pixels[si + 3];
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = makeChunk('IHDR', makeIHDR(width, height));
  // IDAT chunk
  const idat = makeChunk('IDAT', compressed);
  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIHDR(w, h) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(w, 0);
  buf.writeUInt32BE(h, 4);
  buf[8] = 8;  // bit depth
  buf[9] = 6;  // color type: RGBA
  buf[10] = 0; // compression
  buf[11] = 0; // filter
  buf[12] = 0; // interlace
  return buf;
}

// CRC32 table + function
const CRC_TABLE = new Uint32Array(256);
(function() {
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
  }
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return c ^ 0xFFFFFFFF;
}

// ─── Pixel art drawing ───
const S = 32; // sprite size
const FRAMES = 6;
const STRIP_W = S * FRAMES;
const STRIP_H = S;

// Color palette
const C = {
  T: [0, 0, 0, 0],          // transparent
  OR: [227, 109, 46, 255],  // orange body
  DK: [180, 80, 30, 255],   // dark orange
  WH: [255, 255, 255, 255], // white face markings
  BK: [30, 30, 30, 255],    // black (eyes, nose)
  BR: [120, 60, 20, 255],   // brown (ears, paws)
  PK: [255, 180, 160, 255], // pink (inner ears, cheeks)
  TL: [227, 109, 46, 255],  // tail orange
  TD: [180, 80, 30, 255],   // tail dark stripe
  RD: [200, 50, 50, 255],   // red (blush)
  Z:  [180, 180, 220, 255], // Zzz color
};

function blankFrame() {
  return new Uint8Array(S * S * 4);
}

function setPx(frame, x, y, color) {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 4;
  frame[i] = color[0];
  frame[i + 1] = color[1];
  frame[i + 2] = color[2];
  frame[i + 3] = color[3];
}

function fillRect(frame, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPx(frame, x + dx, y + dy, color);
}

// ─── Draw red panda body (shared base) ───
function drawBody(frame, opts = {}) {
  const { eyeOpen = true, mouth = 'smile', armL = 'down', armR = 'down', legSpread = 0, tailWag = 0, blush = false, zzz = false } = opts;

  // Body (round chibi shape)
  // Main body: rows 10-26, cols 8-23
  for (let y = 10; y <= 26; y++) {
    for (let x = 8; x <= 23; x++) {
      // Round shape via distance from center
      const cx = 15.5, cy = 18;
      const dx = (x - cx) / 8, dy = (y - cy) / 9;
      if (dx * dx + dy * dy <= 1.0) {
        // Tail stripes on left side
        if (x <= 10 && (y === 14 || y === 15 || y === 18 || y === 19 || y === 22 || y === 23)) {
          setPx(frame, x, y, C.TD);
        } else {
          setPx(frame, x, y, C.OR);
        }
      }
    }
  }

  // White face markings (cheeks, muzzle)
  for (let y = 12; y <= 20; y++) {
    for (let x = 10; x <= 21; x++) {
      const cx = 15.5, cy = 16;
      const dx = (x - cx) / 6, dy = (y - cy) / 5;
      if (dx * dx + dy * dy <= 0.85) {
        setPx(frame, x, y, C.WH);
      }
    }
  }

  // Ears
  fillRect(frame, 8, 6, 4, 4, C.OR);
  fillRect(frame, 20, 6, 4, 4, C.OR);
  fillRect(frame, 9, 7, 2, 2, C.PK);
  fillRect(frame, 21, 7, 2, 2, C.PK);

  // Eyes
  if (eyeOpen === 'blink') {
    // Closed eyes (line)
    fillRect(frame, 11, 15, 3, 1, C.BK);
    fillRect(frame, 18, 15, 3, 1, C.BK);
  } else if (eyeOpen) {
    // Open eyes
    fillRect(frame, 11, 14, 3, 3, C.BK);
    fillRect(frame, 18, 14, 3, 3, C.BK);
    // Eye shine
    setPx(frame, 12, 14, C.WH);
    setPx(frame, 19, 14, C.WH);
  } else {
    // Closed (sleeping)
    fillRect(frame, 11, 15, 3, 1, C.BK);
    fillRect(frame, 18, 15, 3, 1, C.BK);
  }

  // Nose
  fillRect(frame, 14, 17, 4, 2, C.BK);
  setPx(frame, 15, 17, C.DK);

  // Mouth
  if (mouth === 'smile') {
    setPx(frame, 13, 19, C.BK);
    setPx(frame, 14, 20, C.BK);
    setPx(frame, 15, 20, C.BK);
    setPx(frame, 16, 20, C.BK);
    setPx(frame, 17, 19, C.BK);
  } else if (mouth === 'open') {
    fillRect(frame, 13, 19, 5, 2, C.BK);
    setPx(frame, 14, 19, C.RD);
    setPx(frame, 15, 19, C.RD);
    setPx(frame, 16, 19, C.RD);
  } else if (mouth === 'sad') {
    setPx(frame, 13, 20, C.BK);
    setPx(frame, 14, 19, C.BK);
    setPx(frame, 15, 19, C.BK);
    setPx(frame, 16, 19, C.BK);
    setPx(frame, 17, 20, C.BK);
  } else if (mouth === 'flat') {
    fillRect(frame, 13, 19, 5, 1, C.BK);
  }

  // Blush
  if (blush) {
    setPx(frame, 10, 17, C.RD);
    setPx(frame, 10, 18, C.RD);
    setPx(frame, 20, 17, C.RD);
    setPx(frame, 20, 18, C.RD);
  }

  // Arms
  if (armR === 'up') {
    fillRect(frame, 22, 10, 3, 8, C.OR);
    fillRect(frame, 23, 8, 2, 4, C.OR);
  } else if (armR === 'wave') {
    // Waving arm (animated position varies by frame)
  } else if (armR === 'type') {
    fillRect(frame, 22, 20, 3, 4, C.OR);
  } else {
    fillRect(frame, 22, 16, 3, 6, C.OR);
  }

  if (armL === 'up') {
    fillRect(frame, 7, 10, 3, 8, C.OR);
  } else {
    fillRect(frame, 7, 16, 3, 6, C.OR);
  }

  // Feet
  fillRect(frame, 10, 25, 4, 3, C.BR);
  fillRect(frame, 18, 25, 4, 3, C.BR);

  // Tail (right side, curved)
  const tailOff = tailWag;
  for (let i = 0; i < 6; i++) {
    const tx = 23 + i + (i < 3 ? 0 : tailOff);
    const ty = 18 - i + (i >= 3 ? i - 3 : 0);
    if (tx < S && ty >= 0 && ty < S) {
      setPx(frame, tx, ty, (i % 2 === 0) ? C.TL : C.TD);
      if (tx + 1 < S) setPx(frame, tx + 1, ty, (i % 2 === 0) ? C.TL : C.TD);
    }
  }

  // Zzz for sleeping
  if (zzz) {
    setPx(frame, 22, 8, C.Z);
    setPx(frame, 24, 6, C.Z);
    setPx(frame, 26, 4, C.Z);
  }
}

// ─── Emotion-specific frame generators ───

function genWave(frameIdx) {
  const f = blankFrame();
  const armY = [14, 10, 8, 10, 14, 16][frameIdx]; // arm position cycle
  drawBody(f, { mouth: 'smile', blush: true });
  // Right arm waving
  fillRect(f, 22, armY, 3, 8, C.OR);
  if (frameIdx >= 1 && frameIdx <= 4) {
    fillRect(f, 23, armY - 2, 2, 3, C.OR);
  }
  return f;
}

function genExcited(frameIdx) {
  const f = blankFrame();
  const jump = [0, -2, -5, -3, 0, 0][frameIdx];
  const squash = frameIdx === 4 ? 1.1 : 1.0;
  drawBody(f, { mouth: frameIdx >= 1 && frameIdx <= 3 ? 'open' : 'smile', blush: true });
  // Arms up when jumping
  if (frameIdx >= 1 && frameIdx <= 3) {
    fillRect(f, 22, 8, 3, 8, C.OR);
    fillRect(f, 7, 8, 3, 8, C.OR);
  }
  return f;
}

function genHappy(frameIdx) {
  const f = blankFrame();
  const sway = [-1, 0, 1, 0, -1, 0][frameIdx];
  drawBody(f, { mouth: 'smile', blush: true, tailWag: sway });
  return f;
}

function genCurious(frameIdx) {
  const f = blankFrame();
  const tilt = [-1, -1, 0, 1, 1, 0][frameIdx];
  drawBody(f, { mouth: 'flat' });
  // One eyebrow raised
  if (frameIdx <= 2) {
    fillRect(f, 10, 12, 4, 1, C.DK);
  } else {
    fillRect(f, 18, 12, 4, 1, C.DK);
  }
  return f;
}

function genDisappointed(frameIdx) {
  const f = blankFrame();
  const droop = frameIdx >= 2 && frameIdx <= 4;
  drawBody(f, {
    mouth: droop ? 'sad' : 'flat',
    eyeOpen: droop ? 'blink' : true,
  });
  // Shoulders sag
  if (droop) {
    fillRect(f, 7, 18, 3, 6, C.OR);
    fillRect(f, 22, 18, 3, 6, C.OR);
  }
  return f;
}

function genCoding(frameIdx) {
  const f = blankFrame();
  const typing = frameIdx % 3 === 1;
  drawBody(f, { mouth: 'smile' });
  // Arms in typing position
  if (typing) {
    fillRect(f, 22, 20, 3, 4, C.OR);
    fillRect(f, 7, 20, 3, 4, C.OR);
  } else {
    fillRect(f, 22, 19, 3, 4, C.OR);
    fillRect(f, 7, 19, 3, 4, C.OR);
  }
  return f;
}

function genNeutral(frameIdx) {
  const f = blankFrame();
  const breath = frameIdx === 1 || frameIdx === 2;
  drawBody(f, { mouth: 'smile', eyeOpen: breath ? true : true });
  // Subtle breathing: slightly taller body on inhale
  return f;
}

function genSleeping(frameIdx) {
  const f = blankFrame();
  const zzz = frameIdx >= 2 && frameIdx <= 4;
  drawBody(f, { eyeOpen: false, mouth: 'flat', zzz });
  return f;
}

function genRelaxed(frameIdx) {
  const f = blankFrame();
  const breath = frameIdx === 1 || frameIdx === 3;
  drawBody(f, { mouth: 'smile', blush: breath });
  return f;
}

function genHappyAlt(frameIdx) {
  const f = blankFrame();
  const wag = [-2, -1, 0, 1, 2, 0][frameIdx];
  drawBody(f, { mouth: 'open', blush: true, tailWag: wag });
  return f;
}

// ─── Export sprite strips ───
const EMOTION_MAP = {
  'wave': genWave,
  'excited': genExcited,
  'happy': genHappy,
  'curious': genCurious,
  'disappointed': genDisappointed,
  'coding': genCoding,
  'neutral': genNeutral,
  'sleeping': genSleeping,
  'relaxed': genRelaxed,
  'happy_alt': genHappyAlt,
};

for (const [name, genFn] of Object.entries(EMOTION_MAP)) {
  const strip = new Uint8Array(STRIP_W * STRIP_H * 4);

  for (let f = 0; f < FRAMES; f++) {
    const frameData = genFn(f);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const si = (y * S + x) * 4;
        const di = (y * STRIP_W + (f * S + x)) * 4;
        strip[di]     = frameData[si];
        strip[di + 1] = frameData[si + 1];
        strip[di + 2] = frameData[si + 2];
        strip[di + 3] = frameData[si + 3];
      }
    }
  }

  const png = createPNG(STRIP_W, STRIP_H, strip);
  const outPath = path.join(OUT, `${name}-sprite.png`);
  fs.writeFileSync(outPath, png);
  console.log(`  ✓ ${name}-sprite.png (${STRIP_W}x${STRIP_H})`);
}

console.log('\nDone! 10 sprite sheets generated in assets/mascot/');
