// ═══════════════════════════════════════════════════════════════
//  THIS SUMMER — A Song for Claude
//  Split: Amsterdam night left (lyrics) · Claude right (image + ripple)
// ═══════════════════════════════════════════════════════════════

const BPM  = 121;
const BEAT = 60 / BPM;

// ── Lyrics — populated from song.lrc at startup ───────────────
const LYRICS = [];

const SECTION_RE = /^(verse|chorus|pre-chorus|bridge|outro|intro|rap)/i;

function classifyLine(text) {
  const l = text.toLowerCase();
  if (l === 'this summer')                          return { cls: 'chorus', sz: '6.0' };
  if (l.includes('fell in love') || l.includes('muse in claude') || l.includes('fall in love with claude'))
                                                    return { cls: 'chorus', sz: '4.2' };
  if (l.includes('ooh'))                            return { cls: 'small',  sz: '1.8' };
  if (l.includes('everybody out') || l.includes('what are you doing'))
                                                    return { cls: 'chorus', sz: '3.0' };
  if (l.includes('this summer'))                    return { cls: 'chorus', sz: '4.8' };
  return { cls: 'verse', sz: '2.6' };
}

function parseLRC(text) {
  const timeRe = /^\[(\d{2}):(\d{2}\.\d+)\](.*)$/;
  const raw = [];

  for (const line of text.split('\n')) {
    const m = line.trim().match(timeRe);
    if (!m) continue;
    const t    = parseInt(m[1]) * 60 + parseFloat(m[2]);
    const body = m[3].trim();
    if (!body) continue;
    // skip section headers and inline annotations like [rap version here]
    if (SECTION_RE.test(body) || body.startsWith('[')) continue;
    raw.push({ t, text: body });
  }

  // Filter out compressed sections: skip any line whose gap from
  // the previous *kept* line is under 0.9 s (Suno export artefact)
  const kept = [];
  for (const entry of raw) {
    if (kept.length && entry.t - kept[kept.length - 1].t < 0.9) continue;
    kept.push(entry);
  }

  LYRICS.length = 0;
  for (let i = 0; i < kept.length; i++) {
    const { t, text } = kept[i];
    const tout = i + 1 < kept.length ? kept[i + 1].t : t + 4.5;
    const { cls, sz } = classifyLine(text);
    LYRICS.push([t, tout, text, cls, sz]);
  }
}

fetch('song.lrc')
  .then(r => r.text())
  .then(parseLRC)
  .catch(() => console.warn('song.lrc not found — no lyrics'));

// ── Canvas ────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let W, H;

let exportCanvas = document.createElement('canvas');
let exportCtx    = exportCanvas.getContext('2d');
let isExporting  = false, exportChunks = [], mediaRecorder = null;

// ── Images ────────────────────────────────────────────────────
const coverImg = new Image();
coverImg.crossOrigin = 'anonymous';
coverImg.src = 'cover.png';

const bgImg = new Image();
bgImg.src = 'amsterdam.jpg';

// Offscreen canvas for pixel-art downscale
const PIXEL_SIZE = 8;
const pixelCanvas = document.createElement('canvas');
const pixelCtx    = pixelCanvas.getContext('2d');

// ── Water shimmer (overlaid on photo) ─────────────────────────
function drawWater(glow) {
  // Canal sits in the bottom ~40% of the photo after the night crop
  const waterY = H * 0.60;
  const t = Date.now() * 0.0006;

  for (let i = 0; i < 6; i++) {
    const phase = t + i * 1.1;
    const y     = waterY + i * (H - waterY - 10) * 0.17;
    const alpha = (0.09 + glow * 0.11) * (Math.sin(phase * 1.3) * 0.3 + 0.7);
    const col   = i % 2 === 0 ? [175, 90, 20] : [200, 130, 40];
    const sh    = ctx.createLinearGradient(W * 0.05, y, W * 0.95, y);
    sh.addColorStop(0,   `rgba(${col[0]},${col[1]},${col[2]},0)`);
    sh.addColorStop(0.2, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
    sh.addColorStop(0.5, `rgba(${col[0]},${col[1]},${col[2]},${alpha * 1.35})`);
    sh.addColorStop(0.8, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
    sh.addColorStop(1,   `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = sh;
    ctx.fillRect(W * 0.05, y - 0.8, W * 0.9, 1.6);
  }
}

const STAR_POS = [
  [0.06,0.05],[0.14,0.11],[0.21,0.03],[0.30,0.08],[0.37,0.15],
  [0.44,0.04],[0.50,0.10],[0.58,0.06],[0.66,0.13],[0.74,0.02],
  [0.82,0.09],[0.90,0.07],[0.11,0.20],[0.28,0.17],[0.46,0.22],
  [0.61,0.16],[0.77,0.21],[0.04,0.28],[0.53,0.26],[0.39,0.25],
];

function drawBackground(glow) {
  // ── Dark base ──
  ctx.fillStyle = '#060810';
  ctx.fillRect(0, 0, W, H);

  // ── Amsterdam photo — pixel art, flipped, anchored to bottom ──
  if (bgImg.complete && bgImg.naturalWidth) {
    const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
    const ca = W / H, ia = iw / ih;
    let sx, sy, sw, sh;

    if (ca > ia) {
      sw = iw; sh = Math.round(iw / ca);
      sx = 0;  sy = ih - sh; // anchor bottom: show canal, crop sky
    } else {
      sh = ih; sw = Math.round(ih * ca);
      sx = Math.round((iw - sw) / 2); sy = 0;
    }
    sy = Math.max(0, Math.min(sy, ih - sh));

    // Step 1: draw at pixel-art resolution with night filter
    const pw = pixelCanvas.width, ph = pixelCanvas.height;
    pixelCtx.save();
    pixelCtx.filter = 'brightness(0.30) saturate(0.55)';
    pixelCtx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, pw, ph);
    pixelCtx.filter = 'none';
    pixelCtx.restore();

    // Step 2: draw back at full size — flipped L↔R, no smoothing (keeps pixels sharp)
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.transform(-1, 0, 0, 1, W, 0); // horizontal mirror
    ctx.drawImage(pixelCanvas, 0, 0, W, H);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;

    // Blue-dark night overlay
    ctx.fillStyle = 'rgba(4, 7, 20, 0.42)';
    ctx.fillRect(0, 0, W, H);

    // Night sky fade — replaces the photo sky at top
    const skyFade = ctx.createLinearGradient(0, 0, 0, H * 0.48);
    skyFade.addColorStop(0,    'rgba(4, 7, 16, 1.0)');
    skyFade.addColorStop(0.55, 'rgba(4, 7, 16, 0.85)');
    skyFade.addColorStop(1,    'rgba(4, 7, 16, 0)');
    ctx.fillStyle = skyFade;
    ctx.fillRect(0, 0, W, H * 0.48);
  }

  // ── Stars in the night sky ──
  const t = Date.now() * 0.001;
  for (let i = 0; i < STAR_POS.length; i++) {
    const [sx, sy] = STAR_POS[i];
    const twk = 0.4 + Math.sin(t * (0.4 + i * 0.27) + i * 1.8) * 0.4;
    ctx.globalAlpha = twk * 0.42;
    ctx.fillStyle = '#d8cdb4';
    ctx.beginPath(); ctx.arc(sx * W, sy * H * 0.40, 0.7 + twk * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Crescent moon — top-left, matching cover art position ──
  const mx = W * 0.10, my = H * 0.10, mr = Math.min(W, H) * 0.022;
  ctx.save();
  ctx.globalAlpha = 0.60;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgb(225, 212, 178)'; ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(mx - mr * 0.5, my - mr * 0.08, mr * 0.86, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Canal shimmer ──
  drawWater(glow);

  // ── Centre divider ──
  const div = ctx.createLinearGradient(W / 2, H * 0.08, W / 2, H * 0.92);
  div.addColorStop(0,    'rgba(200, 115, 55, 0)');
  div.addColorStop(0.25, `rgba(200, 115, 55, ${0.07 + glow * 0.05})`);
  div.addColorStop(0.75, `rgba(200, 115, 55, ${0.07 + glow * 0.05})`);
  div.addColorStop(1,    'rgba(200, 115, 55, 0)');
  ctx.fillStyle = div;
  ctx.fillRect(W / 2 - 0.5, 0, 1, H);
}

// ── Cover image ───────────────────────────────────────────────
function imgBounds() {
  const rw = W / 2;
  const sz = Math.min(rw * 0.60, H * 0.42);
  const ix = W / 2 + (rw - sz) / 2;
  const iy = H * 0.10;
  return { ix, iy, sz };
}

function drawCoverImage(glow) {
  if (!coverImg.complete || !coverImg.naturalWidth) return;
  const { ix, iy, sz } = imgBounds();
  ctx.save();
  ctx.shadowColor = `rgba(220, 100, 40, ${0.15 + glow * 0.28})`;
  ctx.shadowBlur  = 18 + glow * 24;
  ctx.drawImage(coverImg, ix, iy, sz, sz);
  ctx.restore();
}

// ── Ripple blinker ────────────────────────────────────────────
const ripples = [];
let lastBeatPhase = 1;

function tickBlinker(t) {
  const phase = (t * BPM / 60) % 1;
  if (lastBeatPhase > 0.85 && phase < 0.15) {
    ripples.push({ born: t });
  }
  lastBeatPhase = phase;
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (t - ripples[i].born > 1.2) ripples.splice(i, 1);
  }
}

function drawBlinker(glow, t) {
  const { iy, sz } = imgBounds();
  const bx   = W * 0.75;
  const by   = iy + sz + H * 0.10;
  const maxR = Math.min(W, H) * 0.078;

  const phase     = (t * BPM / 60) % 1;
  const beatFlash = phase < 0.12 ? (1 - phase / 0.12) : 0;

  ctx.save();

  // Expanding ripple rings — each beat spawns one
  for (const rp of ripples) {
    const age      = t - rp.born;
    const progress = Math.min(1, age / 1.15);
    const r        = maxR * progress;
    const alpha    = (1 - progress) * (0.55 + glow * 0.35);
    const lw       = 2.8 * (1 - progress * 0.75);

    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(240, 120, 74, ${alpha})`;
    ctx.lineWidth   = lw;
    ctx.shadowColor = `rgba(220, 80, 20, ${alpha * 0.7})`;
    ctx.shadowBlur  = 12;
    ctx.stroke();
  }

  // Centre dot — pulses big→small on each beat
  const dotR = 5 + beatFlash * 10;
  ctx.beginPath();
  ctx.arc(bx, by, dotR, 0, Math.PI * 2);
  ctx.fillStyle   = `rgba(240, 120, 74, ${0.8 + beatFlash * 0.2})`;
  ctx.shadowColor = `rgba(240, 80, 20, ${0.55 + beatFlash * 0.45})`;
  ctx.shadowBlur  = 14 + beatFlash * 22;
  ctx.fill();

  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────
const PARTS = [];
(function seedParticles() {
  for (let i = 0; i < 14; i++) {
    PARTS.push({
      x: Math.random(), y: 0.50 + Math.random() * 0.18,
      r: 1.5 + Math.random() * 4,
      col: Math.random() > 0.5 ? [195, 115, 28] : [205, 80, 18],
      base: 55 + Math.random() * 75,
      vx: (Math.random() - 0.5) * 0.00006,
      vy: (Math.random() - 0.5) * 0.00003,
      phase: Math.random() * Math.PI * 2,
      spd:  0.006 + Math.random() * 0.011,
    });
  }
})();

function drawParticles(glow) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const p of PARTS) {
    p.phase += p.spd;
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
    if (p.y < 0.42) p.y = 0.72; if (p.y > 0.75) p.y = 0.42;

    const a  = (p.base * (Math.sin(p.phase) * 0.2 + 0.8) * (1 + glow * 0.5)) / 255;
    const px = p.x * W, py = p.y * H;
    const [r, g, b] = p.col;
    ctx.globalAlpha = a * 0.10;
    ctx.beginPath(); ctx.arc(px, py, p.r * 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill();
    ctx.globalAlpha = a * 0.72;
    ctx.beginPath(); ctx.arc(px, py, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ── Lyrics on canvas (export only) ───────────────────────────
function drawLyricsCanvas(targetCtx) {
  const t   = (audioEl ? audioEl.currentTime : songTime) + lyricOffset;
  const idx = LYRICS.findIndex(([tin, tout]) => t >= tin && t < tout);
  if (idx === -1) return;
  const [tin, tout, text, cls, sizeVw] = LYRICS[idx];
  const fadeIn  = Math.min(1, (t - tin)  / 0.42);
  const fadeOut = Math.min(1, (tout - t) / 0.42);
  const fontSize = parseFloat(sizeVw || '2.4') * W / 100;
  const color    = cls === 'chorus' ? '#F5905A' : cls === 'small' ? '#C86040' : '#F0784A';

  targetCtx.save();
  targetCtx.globalAlpha  = Math.min(fadeIn, fadeOut);
  targetCtx.textAlign    = 'center';
  targetCtx.textBaseline = 'middle';
  targetCtx.font         = `italic 600 ${fontSize}px 'Instrument Sans', sans-serif`;
  targetCtx.fillStyle    = color;
  targetCtx.shadowColor  = 'rgba(220, 80, 20, 0.85)';
  targetCtx.shadowBlur   = 38;
  targetCtx.fillText(text.toLowerCase(), W / 4, H / 2);
  targetCtx.restore();
}

// ── Audio ─────────────────────────────────────────────────────
let audioEl, audioCtx, analyser, freqData, audioSrcNode;
let isPlaying = false, songTime = 0;

function initAudio() {
  audioEl      = document.getElementById('song');
  audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
  audioSrcNode = audioCtx.createMediaElementSource(audioEl);
  analyser     = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.78;
  audioSrcNode.connect(analyser);
  analyser.connect(audioCtx.destination);
  freqData = new Uint8Array(analyser.frequencyBinCount);

  audioEl.addEventListener('timeupdate', () => {
    songTime = audioEl.currentTime;
    const m = Math.floor(songTime / 60);
    const s = Math.floor(songTime % 60).toString().padStart(2, '0');
    document.getElementById('time').textContent = `${m}:${s}`;
    updateLyrics();
  });
  audioEl.addEventListener('ended', () => { isPlaying = false; showIcon('play'); });
}

function getBass() {
  if (!freqData) return 0;
  let s = 0; for (let i = 0; i < 8; i++) s += freqData[i];
  return s / (8 * 255);
}

// ── Lyric offset (dial with [ / ] while playing) ──────────────
let lyricOffset   = 0;
let offsetHudTimer = null;

function showOffsetHud() {
  const sign = lyricOffset >= 0 ? '+' : '';
  const hud  = document.getElementById('offset-hud');
  hud.textContent = `lyrics ${sign}${lyricOffset.toFixed(2)}s`;
  hud.classList.add('visible');
  clearTimeout(offsetHudTimer);
  offsetHudTimer = setTimeout(() => hud.classList.remove('visible'), 1600);
}

// ── Tap-to-sync mode ──────────────────────────────────────────
let tapMode = false, tapIdx = 0;
const newTimes = [];

function enterTapMode() {
  if (!audioCtx) initAudio();
  tapMode = true; tapIdx = 0; newTimes.length = 0;
  audioEl.currentTime = 0;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  audioEl.play(); showIcon('pause'); isPlaying = true;
  document.getElementById('player').classList.add('visible');
  clearTimeout(fadeTimer);
  document.getElementById('sync-overlay').classList.remove('hidden');
  renderSyncDisplay();
}

function renderSyncDisplay() {
  if (tapIdx >= LYRICS.length) { applyTappedTimes(); return; }
  document.getElementById('sync-line').textContent     = LYRICS[tapIdx][2].toLowerCase();
  document.getElementById('sync-progress').textContent = `${tapIdx + 1} / ${LYRICS.length}`;
  const next = LYRICS[tapIdx + 1];
  document.getElementById('sync-next').textContent     = next ? next[2].toLowerCase() : '';
}

function tapRecord() {
  if (!tapMode || !audioEl) return;
  const t       = audioEl.currentTime;
  const origDur = LYRICS[tapIdx][1] - LYRICS[tapIdx][0];
  newTimes.push([t, t + origDur]);
  const line = document.getElementById('sync-line');
  line.style.color = '#88ff88';
  setTimeout(() => { line.style.color = ''; }, 100);
  tapIdx++;
  renderSyncDisplay();
}

function tapSkip() {
  if (!tapMode) return;
  newTimes.push(null); // keep original
  tapIdx++;
  renderSyncDisplay();
}

function applyTappedTimes() {
  for (let i = 0; i < newTimes.length && i < LYRICS.length; i++) {
    if (newTimes[i]) { LYRICS[i][0] = newTimes[i][0]; LYRICS[i][1] = newTimes[i][1]; }
  }
  activeLyricIdx = -1;
  lyricOffset    = 0;
  exitTapMode();
}

function exitTapMode() {
  tapMode = false;
  document.getElementById('sync-overlay').classList.add('hidden');
}

// ── Lyrics HTML overlay ───────────────────────────────────────
let activeLyricIdx = -1;

function updateLyrics() {
  const el  = document.getElementById('lyric-line');
  const t   = songTime + lyricOffset;
  const idx = LYRICS.findIndex(([tin, tout]) => t >= tin && t < tout);
  if (idx === activeLyricIdx) return;
  activeLyricIdx = idx;

  if (idx === -1) {
    el.classList.remove('visible');
    setTimeout(() => { if (!el.classList.contains('visible')) el.textContent = ''; }, 480);
    return;
  }

  const [, , text, cls, sizeVw] = LYRICS[idx];
  el.classList.remove('visible');
  setTimeout(() => {
    el.textContent    = text;
    el.className      = cls || 'verse';
    const vw = parseFloat(sizeVw || '2.4');
    el.style.fontSize = W < 640
      ? `clamp(12px, ${(vw * 2.0).toFixed(1)}vw, 52px)`
      : vw + 'vw';
    el.classList.add('visible');
  }, 60);
}

// ── Glow state ────────────────────────────────────────────────
let glowIntensity = 0;

function getTargetGlow() {
  const t = songTime;
  if ((t>=50&&t<78)||(t>=112&&t<140)||(t>=170&&t<200)) return 1.0;
  if ((t>=34&&t<50)||(t>=100&&t<112)||(t>=159&&t<170)) return 0.42;
  if (t >= 200) return 0.60;
  return 0.05;
}

// ── Waveform visualizer ───────────────────────────────────────
let waveCanvas = null, waveCtx = null;
let _coverPlaying = false;

function drawWaveform(gi, t) {
  if (!waveCanvas) {
    waveCanvas = document.getElementById('wave-canvas');
    if (!waveCanvas) return;
    waveCtx = waveCanvas.getContext('2d');
  }

  // Use parent track dimensions — more reliable than canvas.clientWidth
  // which can return 0 while the player is faded out
  const track = waveCanvas.parentElement;
  const cw = (track && track.offsetWidth)  || waveCanvas.offsetWidth  || 320;
  const ch = (track && track.offsetHeight) || waveCanvas.offsetHeight || 44;
  if (waveCanvas.width  !== cw) waveCanvas.width  = cw;
  if (waveCanvas.height !== ch) waveCanvas.height = ch;

  waveCtx.clearRect(0, 0, cw, ch);

  // Beat multiplier — bars jump on every kick
  const phase     = (t * BPM / 60) % 1;
  const beatFlash = phase < 0.14 ? (1 - phase / 0.14) : 0;
  const beatMult  = 1 + beatFlash * 0.9;

  const dur       = audioEl ? audioEl.duration : NaN;
  const playPct   = (audioEl && dur > 0 && isFinite(dur)) ? audioEl.currentTime / dur : 0;
  const playheadX = playPct * cw;

  // Bottom progress rail — always-on orange fill, unmistakable progress indicator
  const railH = 3;
  waveCtx.fillStyle = 'rgba(255,255,255,0.06)';
  waveCtx.fillRect(0, ch - railH, cw, railH);
  if (playPct > 0) {
    const pg = waveCtx.createLinearGradient(0, 0, playheadX, 0);
    pg.addColorStop(0,   'rgba(200,70,20,0.90)');
    pg.addColorStop(1,   'rgba(255,140,60,0.95)');
    waveCtx.fillStyle = pg;
    waveCtx.fillRect(0, ch - railH, playheadX, railH);
  }

  // Frequency bars — lower 45% of bins (bass + mids)
  const binCount = analyser ? analyser.frequencyBinCount : 256;
  const usedBins = Math.floor(binCount * 0.45);
  const bars = Math.min(38, Math.max(14, Math.floor(cw / 8)));
  const gap  = 2.5;
  const barW = cw / bars;
  const barAreaH = ch - railH - 2; // leave room for the rail

  for (let i = 0; i < bars; i++) {
    let avg = 0;
    if (isPlaying && freqData) {
      const binStart = Math.floor(i * usedBins / bars);
      const binEnd   = Math.min(usedBins, Math.floor((i + 1) * usedBins / bars));
      let sum = 0;
      for (let b = binStart; b < binEnd; b++) sum += freqData[b];
      avg = binEnd > binStart ? sum / (binEnd - binStart) / 255 : 0;
    } else {
      avg = 0.07 + Math.sin(t * 1.6 + i * 0.45) * 0.05 + Math.sin(t * 0.9 + i * 0.9) * 0.03;
    }

    const barH = Math.max(3, barAreaH * Math.min(0.96, (0.12 + avg * 0.88) * (isPlaying ? beatMult : 1)));
    const x    = i * barW + gap / 2;
    const bw   = Math.max(2, barW - gap);
    const y    = barAreaH - barH; // grow upward from the rail

    const played = (x + bw * 0.5) < playheadX;
    if (played) {
      const alpha = 0.65 + avg * 0.35 + beatFlash * 0.14;
      waveCtx.fillStyle = `rgba(240,110,60,${Math.min(1, alpha).toFixed(2)})`;
    } else {
      const alpha = 0.11 + avg * 0.16;
      waveCtx.fillStyle = `rgba(210,190,170,${alpha.toFixed(2)})`;
    }

    waveCtx.beginPath();
    waveCtx.roundRect(x, y, bw, barH, Math.min(bw / 2, 3));
    waveCtx.fill();
  }

  // Playhead dot on the rail
  if (playheadX > 4 && playheadX < cw - 4) {
    waveCtx.beginPath();
    waveCtx.arc(playheadX, ch - railH / 2, 5, 0, Math.PI * 2);
    waveCtx.fillStyle = '#FFFFFF';
    waveCtx.shadowColor = 'rgba(240,120,74,1)';
    waveCtx.shadowBlur  = 8;
    waveCtx.fill();
    waveCtx.shadowBlur  = 0;
  }

  // Vinyl spin state
  const coverEl = document.getElementById('player-cover');
  if (coverEl && isPlaying !== _coverPlaying) {
    coverEl.classList.toggle('playing', isPlaying);
    _coverPlaying = isPlaying;
  }

  // Vinyl glow pulses on beat
  const vinylWrap = document.getElementById('vinyl-wrap');
  if (vinylWrap && isPlaying) {
    const vg = gi * 0.22 + beatFlash * 0.20;
    vinylWrap.style.filter = `drop-shadow(0 0 ${Math.round(4 + beatFlash * 16)}px rgba(240,100,40,${vg.toFixed(2)}))`;
  } else if (vinylWrap) {
    vinylWrap.style.filter = 'none';
  }

  // Pill border + glow scales with chorus + beat
  const playerEl = document.getElementById('player');
  if (playerEl) {
    const intensity = gi + beatFlash * 0.30;
    playerEl.style.borderColor = `rgba(240,120,74,${(0.08 + intensity * 0.30).toFixed(3)})`;
    playerEl.style.boxShadow   = `0 12px 40px rgba(0,0,0,0.65),0 0 ${Math.round(6 + intensity * 28)}px rgba(220,80,20,${(intensity * 0.20).toFixed(3)})`;
  }
}

// ── Time mini-equalizer ───────────────────────────────────────
let timeVisEl = null, timeVisCtx = null;

function drawTimeVis(t) {
  if (!timeVisEl) {
    timeVisEl = document.getElementById('time-vis');
    if (!timeVisEl) return;
    timeVisCtx = timeVisEl.getContext('2d');
  }

  const tw = timeVisEl.offsetWidth  || 48;
  const th = timeVisEl.offsetHeight || 18;
  if (timeVisEl.width  !== tw) timeVisEl.width  = tw;
  if (timeVisEl.height !== th) timeVisEl.height = th;

  timeVisCtx.clearRect(0, 0, tw, th);

  const phase     = (t * BPM / 60) % 1;
  const beatFlash = phase < 0.14 ? (1 - phase / 0.14) : 0;

  // 9 bars spanning bass-to-presence range, symmetric-ish
  const BINS = [2, 4, 7, 11, 16, 22, 30, 40, 52];
  const n    = BINS.length;
  const bw   = Math.floor(tw / n);
  const gap  = 1.5;

  for (let i = 0; i < n; i++) {
    let h;
    if (isPlaying && freqData) {
      const val = freqData[Math.min(BINS[i], freqData.length - 1)] / 255;
      h = Math.max(2, th * (0.14 + val * 0.86) * (1 + beatFlash * 0.70));
    } else {
      // Idle: ripple from center outward
      const dist = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
      h = 2 + (th * 0.45) * Math.abs(Math.sin(t * 1.8 - dist * 2.2));
    }
    h = Math.min(h, th);

    const x     = i * bw + gap / 2;
    const y     = th - h;
    const alpha = isPlaying ? (0.55 + beatFlash * 0.45) : 0.38;
    timeVisCtx.fillStyle = `rgba(240,110,60,${alpha.toFixed(2)})`;
    timeVisCtx.beginPath();
    timeVisCtx.roundRect(x, y, bw - gap, h, Math.min((bw - gap) / 2, 2));
    timeVisCtx.fill();
  }
}

// ── Render loop ───────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);

  if (analyser) analyser.getByteFrequencyData(freqData);
  glowIntensity += (getTargetGlow() - glowIntensity) * (getTargetGlow() > glowIntensity ? 0.025 : 0.007);
  const gi = Math.min(1, glowIntensity + (isPlaying ? getBass() * 0.10 : 0));
  const t  = isPlaying && audioEl ? audioEl.currentTime : Date.now() * 0.001;

  tickBlinker(t);
  drawBackground(gi);
  drawCoverImage(gi);
  drawBlinker(gi, t);
  drawParticles(gi);
  drawWaveform(gi, t);
  drawTimeVis(t);

  if (isExporting) {
    exportCtx.clearRect(0, 0, W, H);
    exportCtx.drawImage(canvas, 0, 0);
    drawLyricsCanvas(exportCtx);
  }
}

// ── Resize ────────────────────────────────────────────────────
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  exportCanvas.width  = W; exportCanvas.height  = H;
  pixelCanvas.width   = Math.ceil(W / PIXEL_SIZE);
  pixelCanvas.height  = Math.ceil(H / PIXEL_SIZE);
}
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);

// ── Player UI ─────────────────────────────────────────────────
function togglePlay() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (isPlaying) {
    audioEl.pause(); showIcon('play');
  } else {
    audioEl.play(); showIcon('pause');
    document.getElementById('player').classList.add('visible');
    scheduleFade();
  }
  isPlaying = !isPlaying;
}

function showIcon(w) {
  document.getElementById('icon-play').style.display  = w === 'play'  ? 'block' : 'none';
  document.getElementById('icon-pause').style.display = w === 'pause' ? 'block' : 'none';
}

let fadeTimer;
function scheduleFade() {
  clearTimeout(fadeTimer);
  document.getElementById('player').classList.remove('fade');
  fadeTimer = setTimeout(() => {
    if (isPlaying) document.getElementById('player').classList.add('fade');
  }, 3000);
}

document.addEventListener('mousemove', () => {
  if (!isPlaying) return;
  document.getElementById('player').classList.add('visible');
  document.getElementById('player').classList.remove('fade');
  scheduleFade();
});

// ── Export ────────────────────────────────────────────────────
function setExportBtn(recording) {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  btn.classList.toggle('recording', recording);
  btn.title = recording ? 'Stop & save' : 'Export video (.webm)';
}

async function startExport() {
  if (!audioCtx) initAudio();
  if (isExporting) { stopExport(); return; }

  exportCanvas.width = W; exportCanvas.height = H;
  const streamDest  = audioCtx.createMediaStreamDestination();
  audioSrcNode.connect(streamDest);
  const videoStream = exportCanvas.captureStream(30);
  const combined    = new MediaStream([...videoStream.getTracks(), ...streamDest.stream.getTracks()]);

  let mimeType = 'video/webm';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus';
  else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mimeType = 'video/webm;codecs=vp8,opus';

  exportChunks  = [];
  mediaRecorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) exportChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    try { audioSrcNode.disconnect(streamDest); } catch (_) {}
    const blob = new Blob(exportChunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'this-summer.webm'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    isExporting = false; setExportBtn(false);
  };

  isExporting = true; setExportBtn(true);
  mediaRecorder.start(1000);
  audioEl.currentTime = 0;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  audioEl.play(); showIcon('pause'); isPlaying = true;
  document.getElementById('player').classList.add('visible');
  clearTimeout(fadeTimer);
  audioEl.addEventListener('ended', () => {
    setTimeout(() => { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }, 600);
  }, { once: true });
}

function stopExport() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('play-btn').addEventListener('click', togglePlay);
document.getElementById('big-play').addEventListener('click', () => {
  document.getElementById('intro').classList.add('hidden');
  togglePlay();
});
document.getElementById('prog-track').addEventListener('click', function(e) {
  if (!audioEl || !audioEl.duration) return;
  const r = this.getBoundingClientRect();
  audioEl.currentTime = ((e.clientX - r.left) / r.width) * audioEl.duration;
});
document.getElementById('export-btn').addEventListener('click', startExport);
document.getElementById('fs-btn').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    if (tapMode) tapRecord(); else togglePlay();
  }
  if (e.key === 'Escape' && tapMode)  exitTapMode();
  if (e.key === 'ArrowRight' && tapMode) tapSkip();
  if (e.key === '[') { lyricOffset = Math.round((lyricOffset - 0.25) * 100) / 100; activeLyricIdx = -1; showOffsetHud(); }
  if (e.key === ']') { lyricOffset = Math.round((lyricOffset + 0.25) * 100) / 100; activeLyricIdx = -1; showOffsetHud(); }
  if ((e.key === 't' || e.key === 'T') && !tapMode) enterTapMode();
  if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
});
