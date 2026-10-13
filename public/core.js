// Q Core — Canvas 2D renderer for the Q energy core.
// Visual state comes only from setState() and the level function the app
// passes in (live mic level while recording, live playback level while
// speaking). Nothing here animates "activity" that isn't happening.

const STATES = {
  boot:      { a: [59, 227, 255], b: [30, 91, 255],  c: [139, 92, 255], speed: 0.25, energy: 0.15, think: 0 },
  idle:      { a: [59, 227, 255], b: [30, 91, 255],  c: [139, 92, 255], speed: 0.22, energy: 0.18, think: 0 },
  listening: { a: [80, 235, 255], b: [40, 150, 255], c: [80, 235, 255], speed: 0.4,  energy: 0.45, think: 0 },
  thinking:  { a: [150, 110, 255], b: [59, 227, 255], c: [40, 90, 255], speed: 1.2, energy: 0.4,  think: 1 },
  speaking:  { a: [110, 210, 255], b: [150, 100, 255], c: [59, 227, 255], speed: 0.5, energy: 0.55, think: 0 },
  waiting:   { a: [255, 181, 71], b: [200, 120, 40], c: [255, 210, 120], speed: 0.1,  energy: 0.25, think: 0 },
  error:     { a: [255, 92, 110], b: [150, 40, 60],  c: [255, 92, 110], speed: 0.1,  energy: 0.2,  think: 0 },
  offline:   { a: [120, 138, 165], b: [55, 66, 92],  c: [90, 102, 130], speed: 0.06, energy: 0.06, think: 0 },
};

const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (x, y, k) => x + (y - x) * k;
const mixC = (x, y, k) => [mix(x[0], y[0], k), mix(x[1], y[1], k), mix(x[2], y[2], k)];
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export class QCore {
  constructor(canvas, { reducedMotion = false, assemble = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.stateName = 'boot';
    this.cur = { ...STATES.boot, a: [...STATES.boot.a], b: [...STATES.boot.b], c: [...STATES.boot.c] };
    this.levelFn = null;
    this.level = 0;
    this.phase = 0;
    this.time = 0;
    this.assemble = reducedMotion || !assemble ? 1 : 0;
    this.ripples = [];
    this.rippleClock = 0;
    this.particles = Array.from({ length: 26 }, (_, i) => ({
      orbit: 1.12 + Math.random() * 0.8,
      angle: Math.random() * Math.PI * 2,
      speed: (0.15 + Math.random() * 0.35) * (i % 2 ? 1 : -1),
      size: 0.6 + Math.random() * 1.4,
      tw: Math.random() * Math.PI * 2,
    }));
    this.last = 0;
    this.running = false;
    this.pauseWhenIdle = false; // compact mode: stop redrawing once the idle orb has settled
    this.quietFor = 0;
    this.resize();
    new ResizeObserver(() => { this.resize(); if (this.reducedMotion || !this.running) this.draw(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(); });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setState(name) {
    if (!STATES[name]) name = 'idle';
    this.stateName = name;
    this.quietFor = 0;
    if (this.reducedMotion) {
      const s = STATES[name];
      this.cur = { ...s, a: [...s.a], b: [...s.b], c: [...s.c] };
      this.draw();
    }
    this.kick();
  }

  setLevelSource(fn) { this.levelFn = fn; }

  start() {
    if (this.reducedMotion) { this.draw(); return; }
    this.kick();
  }

  kick() {
    if (this.reducedMotion || this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    if (document.hidden) { this.running = false; return; }
    const quiet = this.stateName === 'idle' || this.stateName === 'offline';
    const minGap = quiet && this.assemble >= 1 ? 1000 / 30 - 1 : 0; // ~30fps when idle
    const elapsed = now - this.last;
    this.quietFor = quiet ? this.quietFor + Math.max(0, now - (this.prevFrame ?? now)) : 0;
    this.prevFrame = now;
    // Two seconds is enough for the colours to finish easing into the idle look.
    if (this.pauseWhenIdle && this.assemble >= 1 && this.quietFor > 2000) {
      this.draw();
      this.running = false;
      this.prevFrame = null;
      return;
    }
    if (elapsed >= minGap) {
      const dt = Math.min(elapsed / 1000, 0.1);
      this.last = now;
      this.update(dt);
      this.draw();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const target = STATES[this.stateName];
    const k = 1 - Math.exp(-dt * 4);
    const c = this.cur;
    c.a = mixC(c.a, target.a, k);
    c.b = mixC(c.b, target.b, k);
    c.c = mixC(c.c, target.c, k);
    c.speed = mix(c.speed, target.speed, k);
    c.energy = mix(c.energy, target.energy, k);
    c.think = mix(c.think, target.think, k);

    const raw = this.levelFn && (this.stateName === 'listening' || this.stateName === 'speaking') ? clamp(this.levelFn()) : 0;
    this.level = mix(this.level, raw, raw > this.level ? 0.5 : 0.12);

    this.time += dt;
    this.phase += dt * c.speed;
    if (this.assemble < 1) this.assemble = Math.min(1, this.assemble + dt / 1.4);

    for (const p of this.particles) p.angle += dt * p.speed * (0.4 + c.speed);

    // Ripples only spawn from real audio energy.
    this.rippleClock -= dt;
    if (this.level > 0.08 && this.rippleClock <= 0) {
      this.ripples.push({ r: 0, a: 0.35 + this.level * 0.5 });
      this.rippleClock = 0.32;
    }
    for (const rp of this.ripples) { rp.r += dt * 0.55; rp.a *= Math.exp(-dt * 2.2); }
    this.ripples = this.ripples.filter((rp) => rp.r < 1 && rp.a > 0.02);
  }

  draw() {
    const { ctx, w, h, cur: c } = this;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.3;
    const asm = this.assemble;
    const ease = 1 - Math.pow(1 - asm, 3);
    const breathe = this.reducedMotion ? 0 : Math.sin(this.time * 1.3) * 0.012;
    const r = R * (1 + breathe + this.level * 0.05);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Halo
    const halo = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.3);
    halo.addColorStop(0, rgba(c.b, 0.16 * (0.5 + c.energy) * ease));
    halo.addColorStop(0.45, rgba(c.a, 0.07 * (0.5 + c.energy + this.level) * ease));
    halo.addColorStop(1, rgba(c.a, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Orbits (faint full path + one bright travelling segment each),
    // clipped so they pass behind the core instead of across its face.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, r * 1.04, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    for (let i = 0; i < 3; i++) {
      const rx = r * (1.42 + i * 0.2);
      const ry = rx * (0.24 + i * 0.09);
      const rot = -0.55 + i * 1.05 + (this.reducedMotion ? 0 : this.phase * 0.04 * (i % 2 ? 1 : -1));
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(c.b, 0.16 * ease);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      ctx.stroke();
      const th = this.phase * (0.9 + i * 0.35) + i * 2.1;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(i === 1 ? c.c : c.a, 0.75 * ease);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, th, th + 0.7 + c.energy * 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // Ripples
    for (const rp of this.ripples) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(c.a, rp.a);
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.05 + rp.r * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Dark glass interior
    ctx.globalCompositeOperation = 'source-over';
    const glass = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r * 0.95);
    glass.addColorStop(0, `rgba(40,60,110,${0.35 * ease})`);
    glass.addColorStop(0.6, `rgba(8,12,26,${0.85 * ease})`);
    glass.addColorStop(1, `rgba(4,6,14,${0.6 * ease})`);
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.93, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';

    // Tick ring (holographic dial)
    const tickRot = this.reducedMotion ? 0 : -this.phase * 0.15;
    ctx.strokeStyle = rgba(c.a, 0.22 * ease);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const ang = tickRot + (i / 72) * Math.PI * 2;
      const r1 = r * 0.72;
      const r2 = r * (i % 6 === 0 ? 0.665 : 0.695);
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
    }
    ctx.stroke();

    // Thinking spinner — only while the model is actually generating
    if (c.think > 0.02) {
      for (let i = 0; i < 3; i++) {
        const sr = r * (0.5 - i * 0.08);
        const st = this.phase * (2.2 + i * 0.9) * (i % 2 ? -1 : 1);
        ctx.lineWidth = 2.2 - i * 0.4;
        ctx.strokeStyle = rgba(i === 1 ? c.b : c.a, 0.85 * c.think);
        ctx.beginPath();
        ctx.arc(cx, cy, sr, st, st + 1.2);
        ctx.stroke();
      }
    }

    // Main ring
    const sweep = Math.PI * 2 * clamp(asm / 0.72);
    const start = -Math.PI / 2;
    const ringPath = () => { ctx.beginPath(); ctx.arc(cx, cy, r, start, start + sweep); };
    ctx.lineCap = 'round';
    ringPath(); ctx.lineWidth = R * 0.3; ctx.strokeStyle = rgba(c.a, 0.05 + c.energy * 0.05); ctx.stroke();
    ringPath(); ctx.lineWidth = R * 0.17; ctx.strokeStyle = rgba(c.b, 0.12 + c.energy * 0.1 + this.level * 0.15); ctx.stroke();
    let band;
    if (ctx.createConicGradient) {
      band = ctx.createConicGradient(this.reducedMotion ? 0 : this.phase * 0.6, cx, cy);
      band.addColorStop(0, rgba(c.a, 1));
      band.addColorStop(0.33, rgba(c.b, 0.95));
      band.addColorStop(0.66, rgba(c.c, 0.95));
      band.addColorStop(1, rgba(c.a, 1));
    } else {
      band = rgba(c.a, 1);
    }
    ringPath(); ctx.lineWidth = R * 0.085; ctx.strokeStyle = band; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - R * 0.012, start, start + sweep);
    ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(235,250,255,${0.55 * ease})`; ctx.stroke();

    // Q tail — a blade cutting through the lower-right of the ring
    const tailK = clamp((asm - 0.68) / 0.32);
    if (tailK > 0) {
      const dir = Math.PI / 4;
      const ux = Math.cos(dir), uy = Math.sin(dir);
      const nx = -uy, ny = ux;
      const r0 = r * 0.58;
      const r1 = r0 + (r * 1.5 - r0) * (1 - Math.pow(1 - tailK, 3));
      const wdt = R * 0.22;
      const p = (d, off) => [cx + ux * d + nx * off, cy + uy * d + ny * off];
      const pts = [p(r0, 0), p(r0 + (r1 - r0) * 0.45, wdt * 0.5), p(r1, 0), p(r0 + (r1 - r0) * 0.45, -wdt * 0.5)];
      const glow = ctx.createLinearGradient(...p(r0, 0), ...p(r1, 0));
      glow.addColorStop(0, rgba(c.b, 0.0));
      glow.addColorStop(0.4, rgba(c.a, 0.35));
      glow.addColorStop(1, rgba(c.c, 0.15));
      ctx.strokeStyle = glow;
      ctx.lineWidth = R * 0.2;
      ctx.beginPath(); ctx.moveTo(...p(r0, 0)); ctx.lineTo(...p(r1, 0)); ctx.stroke();
      const fill = ctx.createLinearGradient(...p(r0, 0), ...p(r1, 0));
      fill.addColorStop(0, rgba(c.b, 0.25));
      fill.addColorStop(0.5, rgba(c.a, 0.95));
      fill.addColorStop(1, 'rgba(240,252,255,1)');
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (const q of pts.slice(1)) ctx.lineTo(...q);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * tailK})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...p(r0 + (r1 - r0) * 0.15, 0)); ctx.lineTo(...p(r1, 0)); ctx.stroke();
    }

    // Particles
    for (const pt of this.particles) {
      const pr = r * (pt.orbit + this.level * 0.25);
      const x = cx + Math.cos(pt.angle) * pr;
      const y = cy + Math.sin(pt.angle) * pr * 0.92;
      const tw = this.reducedMotion ? 0.6 : 0.45 + 0.55 * Math.sin(this.time * 2 + pt.tw);
      ctx.fillStyle = rgba(pt.orbit > 1.5 ? c.c : c.a, 0.55 * tw * ease * (0.4 + c.energy));
      ctx.beginPath();
      ctx.arc(x, y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
