// Q Core — Canvas 2D renderer for the Q energy core, in the Split-Core shape
// (D-017, D-036). The shape itself comes from mark.js, so the live orb and the
// static marks agree.
// Visual state comes only from setState() and the level function the app
// passes in (live mic level while recording, live playback level while
// speaking). Nothing here animates "activity" that isn't happening.

import { SHAPES, tailPoints } from './mark.js';

// a: the upper-left segment, b: the blue it deepens to and the core's tint,
// c: the right segment and the tail. The working states keep cyan on the left
// and violet on the right so the mark stays itself; waiting, error and offline
// take one colour over the whole mark.
const STATES = {
  boot:      { a: [0, 229, 255],   b: [59, 130, 246], c: [168, 85, 247],  speed: 0.25, energy: 0.15, think: 0 },
  idle:      { a: [0, 229, 255],   b: [59, 130, 246], c: [168, 85, 247],  speed: 0.22, energy: 0.18, think: 0 },
  listening: { a: [110, 242, 255], b: [40, 150, 255], c: [150, 125, 255], speed: 0.4,  energy: 0.45, think: 0 },
  thinking:  { a: [120, 200, 255], b: [85, 110, 255], c: [192, 100, 255], speed: 1.2,  energy: 0.4,  think: 1 },
  speaking:  { a: [60, 236, 255],  b: [70, 140, 255], c: [205, 92, 250],  speed: 0.5,  energy: 0.55, think: 0 },
  waiting:   { a: [255, 181, 71], b: [200, 120, 40], c: [255, 210, 120], speed: 0.1,  energy: 0.25, think: 0 },
  error:     { a: [255, 92, 110], b: [150, 40, 60],  c: [255, 92, 110], speed: 0.1,  energy: 0.2,  think: 0 },
  offline:   { a: [120, 138, 165], b: [55, 66, 92],  c: [90, 102, 130], speed: 0.06, energy: 0.06, think: 0 },
};

const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (x, y, k) => x + (y - x) * k;
const mixC = (x, y, k) => [mix(x[0], y[0], k), mix(x[1], y[1], k), mix(x[2], y[2], k)];
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const SHAPE = SHAPES.full;
const WHITE = [255, 255, 255];
const ang = (deg) => (deg * Math.PI) / 180 - Math.PI / 2; // mark.js counts clockwise from twelve o'clock
// Segments in the order the ring draws itself in on start: clockwise from the top.
const ORDER = [...SHAPE.segments].sort((x, y) => x.from - y.from);

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
    const rOut = r * SHAPE.ringOuter;
    const rIn = r * SHAPE.ringInner;
    const rCore = r * SHAPE.core;
    const pt = (rad, deg) => [cx + rad * Math.cos(ang(deg)), cy + rad * Math.sin(ang(deg))];
    const sector = (outer, inner, from, to) => {
      ctx.beginPath();
      ctx.arc(cx, cy, outer, ang(from), ang(to));
      ctx.arc(cx, cy, inner, ang(to), ang(from), true);
      ctx.closePath();
    };
    // The ring draws itself in clockwise from the top while Q starts up.
    const sweep = 360 * clamp(asm / 0.72);
    const shown = ORDER.filter((s) => sweep > s.from).map((s) => ({ ...s, to: Math.min(s.to, sweep) }));
    const paint = (s) => {
      // right: bluer at the top, full violet toward the tail. lower: blue by the tail, cyan up the side. upper: cyan.
      const [from, to] = s.id === 'right' ? [mixC(c.c, c.b, 0.4), c.c] : s.id === 'lower' ? [c.b, c.a] : [c.a, mixC(c.a, WHITE, 0.18)];
      const g = ctx.createLinearGradient(...pt(rOut, s.from), ...pt(rOut, s.to));
      g.addColorStop(0, rgba(from, ease));
      g.addColorStop(1, rgba(to, ease));
      return g;
    };
    const glowOf = (s) => (s.id === 'right' ? c.c : s.id === 'lower' ? c.b : c.a);

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

    // Ring glow: each segment lights the space around it, more with energy and live audio.
    ctx.lineCap = 'butt';
    const rMid = (rOut + rIn) / 2;
    for (const s of shown) {
      ctx.beginPath(); ctx.arc(cx, cy, rMid, ang(s.from), ang(s.to));
      ctx.lineWidth = (rOut - rIn) * 1.9; ctx.strokeStyle = rgba(glowOf(s), (0.05 + c.energy * 0.05) * ease); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rMid, ang(s.from), ang(s.to));
      ctx.lineWidth = (rOut - rIn) * 1.35; ctx.strokeStyle = rgba(glowOf(s), (0.1 + c.energy * 0.1 + this.level * 0.15) * ease); ctx.stroke();
    }

    // The dark channel between ring and core, then the core itself: a navy sphere.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(5,8,18,${0.92 * ease})`;
    ctx.beginPath(); ctx.arc(cx, cy, rIn - r * 0.01, 0, Math.PI * 2); ctx.fill();
    const sphere = ctx.createRadialGradient(cx - rCore * 0.3, cy - rCore * 0.4, rCore * 0.05, cx, cy, rCore);
    sphere.addColorStop(0, rgba(mixC([46, 70, 180], c.b, 0.35), ease));
    sphere.addColorStop(0.5, rgba(mixC([18, 28, 96], c.b, 0.12), ease));
    sphere.addColorStop(1, `rgba(7,11,34,${ease})`);
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, rCore, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.strokeStyle = rgba(c.b, 0.55 * ease);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.13 * ease})`;
    ctx.beginPath(); ctx.ellipse(cx - rCore * 0.32, cy - rCore * 0.44, rCore * 0.4, rCore * 0.22, -0.49, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';

    // The core brightens with live audio (your voice while listening, Q's while speaking).
    if (this.level > 0.02) {
      const pulse = ctx.createRadialGradient(cx, cy, 0, cx, cy, rCore);
      pulse.addColorStop(0, rgba(c.a, 0.5 * this.level));
      pulse.addColorStop(1, rgba(c.b, 0));
      ctx.fillStyle = pulse;
      ctx.beginPath(); ctx.arc(cx, cy, rCore, 0, Math.PI * 2); ctx.fill();
    }

    // Tick ring (holographic dial), in the channel
    const tickRot = this.reducedMotion ? 0 : -this.phase * 0.15;
    ctx.strokeStyle = rgba(c.a, 0.22 * ease);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = tickRot + (i / 72) * Math.PI * 2;
      const r1 = r * 0.625;
      const r2 = r * (i % 6 === 0 ? 0.565 : 0.595);
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    }
    ctx.stroke();

    // Thinking spinner, inside the core — only while the model is actually generating
    if (c.think > 0.02) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const sr = rCore * (0.8 - i * 0.18);
        const st = this.phase * (2.2 + i * 0.9) * (i % 2 ? -1 : 1);
        ctx.lineWidth = 2.2 - i * 0.4;
        ctx.strokeStyle = rgba(i === 1 ? c.c : c.a, 0.85 * c.think);
        ctx.beginPath();
        ctx.arc(cx, cy, sr, st, st + 1.2);
        ctx.stroke();
      }
    }

    // The ring: solid segments, so the shape reads even with every glow removed.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.035;
    for (const s of shown) {
      const fill = paint(s);
      sector(rOut, rIn, s.from, s.to);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = fill; ctx.stroke();
      sector(rOut, rOut - r * 0.07, s.from, s.to); // lit outer rim
      ctx.fillStyle = `rgba(255,255,255,${0.2 * ease})`; ctx.fill();
    }

    // A band of light travelling round the ring.
    if (!this.reducedMotion && ctx.createConicGradient && shown.length) {
      ctx.save();
      ctx.beginPath();
      for (const s of shown) {
        ctx.moveTo(...pt(rOut, s.from));
        ctx.arc(cx, cy, rOut, ang(s.from), ang(s.to));
        ctx.arc(cx, cy, rIn, ang(s.to), ang(s.from), true);
        ctx.closePath();
      }
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const band = ctx.createConicGradient(this.phase * 0.6, cx, cy);
      const k = 0.16 + c.energy * 0.3;
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.07, `rgba(255,255,255,${k})`);
      band.addColorStop(0.16, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, 'rgba(255,255,255,0)');
      band.addColorStop(0.57, `rgba(255,255,255,${k * 0.5})`);
      band.addColorStop(0.66, 'rgba(255,255,255,0)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.fillRect(cx - rOut, cy - rOut, rOut * 2, rOut * 2);
      ctx.restore();
    }

    // Q tail — a blade in its own gap at the lower right, extending last
    const tailK = clamp((asm - 0.68) / 0.32);
    if (tailK > 0) {
      const t = SHAPE.tail;
      const reach = t.from + (t.to - t.from) * (1 - Math.pow(1 - tailK, 3));
      const pts = tailPoints(cx, cy, r, { ...t, to: reach });
      ctx.globalCompositeOperation = 'lighter';
      const [mx0, my0] = pt(r * t.from, t.angle);
      const [mx1, my1] = pt(r * reach, t.angle);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = rgba(c.c, (0.1 + c.energy * 0.1 + this.level * 0.15) * tailK);
      ctx.lineWidth = r * t.half * 2.6;
      ctx.beginPath(); ctx.moveTo(mx0, my0); ctx.lineTo(mx1, my1); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      const fill = ctx.createLinearGradient(mx0, my0, mx1, my1);
      fill.addColorStop(0, rgba(c.c, tailK));
      fill.addColorStop(1, rgba(mixC(c.c, WHITE, 0.28), tailK));
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.lineWidth = r * 0.035;
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (const q of pts.slice(1)) ctx.lineTo(...q);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * tailK})`; // lit upper edge
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.beginPath(); ctx.moveTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';

    // Particles
    for (const p of this.particles) {
      const pr = r * (p.orbit + this.level * 0.25);
      const x = cx + Math.cos(p.angle) * pr;
      const y = cy + Math.sin(p.angle) * pr * 0.92;
      const tw = this.reducedMotion ? 0.6 : 0.45 + 0.55 * Math.sin(this.time * 2 + p.tw);
      ctx.fillStyle = rgba(p.orbit > 1.5 ? c.c : c.a, 0.55 * tw * ease * (0.4 + c.energy));
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
