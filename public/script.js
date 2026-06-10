let activeStyle = "bars";
let running = false;
let animId, stopTimeout, audioCtx, analyser, source, audioEl;
let imageBlob, audioBlob;
let artistName = "", songTitle = "";
let avgEnergy = 0;
let wPhase = 0, vinylAngle = 0, particleFrame = 0;
let particles = [];

const DURATION = 30;
const SMOOTHING = 0.85;

const $ = id => document.getElementById(id);
const inputScreen = $("inputScreen");
const vizScreen = $("vizScreen");
const albumArt = $("albumArt");
const artBg = $("artBg");
const canvas = $("mainCanvas");
const ctx = canvas.getContext("2d");
const phoneFrame = document.querySelector(".phone-frame");
const frameInner = document.querySelector(".frame-inner");
const styleCards = document.querySelectorAll(".style-card");
const startBtn = $("startBtn");
const backBtn = $("backBtn");
const artistInput = $("artistInput");
const titleInput = $("titleInput");
const textOverlay = $("textOverlay");
const displayArtist = $("displayArtist");
const displayTitle = $("displayTitle");
const vizContent = $("vizContent");
const orientBtn = $("orientBtn");
const replayBtn = $("replayBtn");
let isLandscape = false;

function resizeCanvas() {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  canvas.width = r.width * devicePixelRatio;
  canvas.height = r.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

// ---- FILE UI ----
$("imageInput").addEventListener("change", e => {
  imageBlob = e.target.files[0];
  $("imageName").textContent = imageBlob?.name || "";
  $("imageBox").classList.toggle("has-file", !!imageBlob);
  startBtn.disabled = !(imageBlob && audioBlob);
});
$("audioInput").addEventListener("change", e => {
  audioBlob = e.target.files[0];
  $("audioName").textContent = audioBlob?.name || "";
  $("audioBox").classList.toggle("has-file", !!audioBlob);
  startBtn.disabled = !(imageBlob && audioBlob);
});

// ---- STYLE SELECTOR ----
styleCards.forEach(card => {
  card.addEventListener("click", () => {
    styleCards.forEach(s => s.classList.remove("selected"));
    card.classList.add("selected");
    activeStyle = card.dataset.style;
  });
});

// ---- AUDIO ANALYSIS ----
function analyze() {
  if (!analyser) return { energy: 0, beat: false, spectrum: new Uint8Array(128), waveform: new Uint8Array(128) };
  const s = new Uint8Array(analyser.frequencyBinCount);
  const w = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(s);
  analyser.getByteTimeDomainData(w);
  let total = 0;
  for (let i = 0; i < s.length; i++) total += s[i] / 255;
  total /= s.length;
  avgEnergy = avgEnergy * SMOOTHING + total * (1 - SMOOTHING);
  return {
    energy: total,
    beat: avgEnergy > 0 && total > avgEnergy * 1.18,
    spectrum: s,
    waveform: w,
  };
}

// ================================================================
// RENDERERS
// ================================================================

// 1. SPECTRUM BARS - Mirrored bars with overlay and centered text
function renderBars(d, w, h) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, w, h);

  const num = 64;
  const gap = 2;
  const bw = (w - gap * (num + 1)) / num;
  const textH = h * 0.18;
  const barArea = (h - textH) / 2;
  const maxH = barArea * 0.85;
  const cy = h / 2;

  for (let i = 0; i < num; i++) {
    const v = d.spectrum[Math.floor((i / num) * d.spectrum.length)] / 255;
    const bh = Math.max(2, v * maxH);
    const x = gap + i * (bw + gap);
    const a = 0.12 + v * 0.88;
    ctx.fillStyle = `rgba(255,255,255,${a})`;

    ctx.beginPath();
    ctx.roundRect(x, cy - textH / 2 - bh, bw, bh, [0, 0, 2, 2]);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(x, cy + textH / 2, bw, bh, [2, 2, 0, 0]);
    ctx.fill();
  }
}

// 2. FLUID WAVE - Smooth flowing waveform
function renderWave(d, w, h) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, w, h);

  const amp = h * 0.38;
  const cy = h / 2;
  const steps = 120;

  for (let side = 0; side < 2; side++) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const idx = Math.floor((i / steps) * d.spectrum.length);
      const v = d.spectrum[idx] / 255;
      const x = (i / steps) * w;
      const wave = Math.sin(wPhase + i * 0.12) * 0.5 + Math.sin(wPhase * 0.7 + i * 0.08) * 0.3 + Math.sin(i * 0.05) * 0.2;
      const y = cy + (side ? -1 : 1) * wave * amp * (0.25 + v * 0.75);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const alpha = side ? 0.35 : 0.85;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = side ? 2 : 3.5;
    ctx.shadowColor = "rgba(255,255,255,0.3)";
    ctx.shadowBlur = side ? 8 : 15;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (d.beat) {
    const g = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.5);
    g.addColorStop(0, "rgba(255,255,255,0.15)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  wPhase += 0.035;
}

// 3. OSCILLOSCOPE - Symmetrical bars (spectrum style)
function renderOscilloscope(d, w, h) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const num = 56;
  const gap = 2;
  const bw = (w * 0.5 - gap * (num / 2 + 1)) / (num / 2);
  const maxH = h * 0.42;

  // Subtle center axis
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  for (let i = 0; i < num; i++) {
    const v = d.spectrum[Math.floor((i / num) * d.spectrum.length)] / 255;
    const bh = Math.max(2, v * maxH);
    const a = 0.12 + v * 0.88;

    // Left side (grows left from center)
    const lx = cx - bw - gap - Math.floor(i / 2) * (bw + gap);
    // Right side (grows right from center)
    const rx = cx + gap + Math.floor(i / 2) * (bw + gap);

    ctx.fillStyle = `rgba(255,255,255,${a})`;

    if (i % 2 === 0 && lx >= 0) {
      ctx.beginPath();
      ctx.roundRect(lx, cy - bh, bw, bh, [1, 1, 0, 0]);
      ctx.fill();
    } else if (rx + bw <= w) {
      ctx.beginPath();
      ctx.roundRect(rx, cy - bh, bw, bh, [1, 1, 0, 0]);
      ctx.fill();
    }
  }
}

// 4. VINYL SPIN - Spinning record with album art
function renderVinyl(d, w, h) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.4;
  const labelR = maxR * 0.4;
  const spindleR = maxR * 0.06;

  // Rotate entire vinyl group on canvas
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(vinylAngle * Math.PI / 180);

  // Grooves
  for (let i = 0; i < 18; i++) {
    const r = maxR * (0.42 + (i / 18) * 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(40,40,50,${0.3 + (i / 18) * 0.4})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Vinyl body
  const grad = ctx.createRadialGradient(-maxR * 0.2, -maxR * 0.2, 0, 0, 0, maxR);
  grad.addColorStop(0, "#222");
  grad.addColorStop(0.5, "#1a1a1a");
  grad.addColorStop(1, "#0d0d0d");
  ctx.beginPath();
  ctx.arc(0, 0, maxR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Label (album art clipped circle)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, labelR, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(albumArt, -labelR, -labelR, labelR * 2, labelR * 2);
  ctx.restore();

  // Label border
  ctx.beginPath();
  ctx.arc(0, 0, labelR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Spindle hole
  ctx.beginPath();
  ctx.arc(0, 0, spindleR, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, spindleR * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#888";
  ctx.fill();

  ctx.restore(); // restore from vinyl group rotation

  // Tone arm effect with energy
  if (d.energy > 0.05) {
    const ea = d.energy * 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR + 4, -Math.PI * 0.75 - ea, -Math.PI * 0.75 + ea);
    ctx.strokeStyle = `rgba(255,255,255,${d.energy * 0.15})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  vinylAngle += 0.5 + d.energy * 2;
}

// 5. PARTICLES - Particle system reacting to audio
function renderParticles(d, w, h) {
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, 0, w, h);

  // Spawn or maintain particles
  const targetCount = 60 + Math.floor(d.energy * 120);
  while (particles.length < targetCount) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5 - 0.5,
      r: 1 + Math.random() * 3,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1 + Math.random() * 1.5,
      hue: 260 + Math.random() * 60,
    });
  }
  while (particles.length > targetCount + 20) particles.shift();

  const cx = w / 2, cy = h / 2;

  for (const p of particles) {
    p.life += 0.008;
    if (p.life >= p.maxLife) {
      p.x = cx + (Math.random() - 0.5) * w * 0.5;
      p.y = cy + (Math.random() - 0.5) * h * 0.5;
      p.life = 0;
      p.maxLife = 1 + Math.random() * 1.5;
    }

    const t = p.life / p.maxLife;
    const pulse = 1 + d.energy * 2;
    p.vx += (Math.random() - 0.5) * 0.3 + (cx - p.x) * 0.001 * d.energy * 3;
    p.vy += (Math.random() - 0.5) * 0.3 + (cy - p.y) * 0.001 * d.energy * 3;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.x += p.vx * pulse;
    p.y += p.vy * pulse;

    const alpha = (1 - t) * (0.4 + d.energy * 0.6);
    const r = p.r * (1 + d.energy * 1.5);

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, ${60 + d.energy * 30}%, ${alpha})`;
    ctx.shadowColor = `hsla(${p.hue}, 80%, 70%, ${alpha * 0.5})`;
    ctx.shadowBlur = 10 + d.energy * 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Beat flash
  if (d.beat) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.6);
    g.addColorStop(0, "rgba(108,92,231,0.2)");
    g.addColorStop(1, "rgba(108,92,231,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  particleFrame++;
}

// 6. FULL FRAME - Full-width gradient bars with floating album art
function renderFullFrame(d, w, h) {
  ctx.clearRect(0, 0, w, h);

  const num = 48;
  const gap = 1;
  const bw = (w - gap * (num + 1)) / num;

  for (let i = 0; i < num; i++) {
    const v = d.spectrum[Math.floor((i / num) * d.spectrum.length)] / 255;
    const bh = Math.max(1, v * h * 0.95);
    const x = gap + i * (bw + gap);

    const hue = 260 + v * 40;
    ctx.fillStyle = `hsla(${hue}, 80%, ${50 + v * 40}%, ${0.6 + v * 0.4})`;
    ctx.beginPath();
    ctx.roundRect(x, h - bh, bw, bh, [1, 1, 0, 0]);
    ctx.fill();
  }

  // Center album art
  const artSize = Math.min(w, h) * 0.42;
  const cx = (w - artSize) / 2;
  const cy = (h - artSize) / 2;
  const r = 12;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, artSize, artSize, r);
  ctx.clip();
  ctx.drawImage(albumArt, cx, cy, artSize, artSize);
  ctx.restore();

  ctx.strokeStyle = `rgba(255,255,255,${0.1 + d.energy * 0.2})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx, cy, artSize, artSize, r);
  ctx.stroke();

  if (d.beat) {
    ctx.shadowColor = "rgba(108,92,231,0.4)";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.roundRect(cx, cy, artSize, artSize, r);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// Renderer map
const RENDERERS = {
  bars: renderBars,
  wave: renderWave,
  oscilloscope: renderOscilloscope,
  vinyl: renderVinyl,
  particles: renderParticles,
  fullframe: renderFullFrame,
};

function requiresAlbumArt(style) {
  return style === "fullframe" || style === "vinyl";
}

// ================================================================
// MAIN LOOP
// ================================================================
function frame() {
  if (!running) return;
  try {
    const d = analyze();
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;
    if (w === 0 || h === 0) { animId = requestAnimationFrame(frame); return; }

    RENDERERS[activeStyle](d, w, h);
  } catch (e) {
    console.error("frame error:", e);
  }
  animId = requestAnimationFrame(frame);
}

// ================================================================
// START
// ================================================================
async function startVisualization() {
  startBtn.disabled = true;
  const imgUrl = URL.createObjectURL(imageBlob);
  const audUrl = URL.createObjectURL(audioBlob);
  artistName = artistInput.value.trim();
  songTitle = titleInput.value.trim();

  albumArt.src = imgUrl;
  albumArt.style.transform = "none";
  artBg.style.backgroundImage = `url(${imgUrl})`;
  phoneFrame.style.backgroundImage = `url(${imgUrl})`;
  phoneFrame.style.backgroundSize = "cover";
  phoneFrame.style.backgroundPosition = "center";
  inputScreen.classList.remove("active");
  vizScreen.classList.add("active");

  particles = [];
  vinylAngle = 0;
  wPhase = 0;

  // Text overlay
  if (activeStyle === "bars" || activeStyle === "wave" || activeStyle === "particles" || activeStyle === "oscilloscope") {
    textOverlay.classList.add("active");
    displayArtist.textContent = artistName;
    displayTitle.textContent = songTitle;
  } else {
    textOverlay.classList.remove("active");
  }

  // Fullframe: album art visible and centered
  if (activeStyle === "fullframe") {
    albumArt.style.position = "absolute";
    albumArt.style.objectFit = "cover";
    albumArt.style.display = "block";
  }
  // Vinyl: canvas draws everything, hide the img element
  if (activeStyle === "vinyl") {
    albumArt.style.display = "none";
  }

  await new Promise(r => requestAnimationFrame(r));
  resizeCanvas();

  audioEl = new Audio(audUrl);
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source = audioCtx.createMediaElementSource(audioEl);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  avgEnergy = 0;
  running = true;
  await audioCtx.resume();
  audioEl.play();
  stopTimeout = setTimeout(stop, DURATION * 1000);
  frame();
  startBtn.disabled = false;
}

// ================================================================
// STOP
// ================================================================
function stop() {
  running = false;
  cancelAnimationFrame(animId);
  clearTimeout(stopTimeout);
  audioEl?.pause();
  audioCtx?.close();
  audioEl = audioCtx = analyser = source = null;
  textOverlay.classList.remove("active");
}

startBtn.addEventListener("click", startVisualization);

backBtn.addEventListener("click", () => {
  stop();
  vizScreen.classList.remove("active");
  inputScreen.classList.add("active");
});

replayBtn.addEventListener("click", () => {
  stop();
  startVisualization();
});

orientBtn.addEventListener("click", () => {
  isLandscape = !isLandscape;
  vizContent.classList.toggle("landscape", isLandscape);
  orientBtn.textContent = isLandscape ? "📱" : "🖥️";
  requestAnimationFrame(() => {
    resizeCanvas();
    if (isLandscape) {
      phoneFrame.style.borderRadius = "16px";
    } else {
      phoneFrame.style.borderRadius = "28px";
    }
  });
});

window.addEventListener("resize", resizeCanvas);

// roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const t = Array.isArray(r) ? r : [r];
    const tl = t[0] || 0, tr = t[1] || tl, br = t[2] || tl, bl = t[3] || tl;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}
