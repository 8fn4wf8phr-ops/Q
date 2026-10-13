// Tests for the Split-Core Q mark's geometry. Run: node scripts/test-mark.mjs
import { SHAPES, PALETTE, markSVG, extent, shapeFor, tailPoints, sectorPath, polar } from '../public/mark.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✕'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };

// Gaps between neighbouring segments going clockwise, in degrees.
function gaps(shape) {
  const segs = [...shape.segments].sort((a, b) => a.from - b.from);
  return segs.map((s, i) => { const next = segs[(i + 1) % segs.length]; return { after: s.id, deg: (next.from - s.to + 360) % 360 }; });
}
// Relative luminance and contrast, as in WCAG.
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

console.log('mark geometry');
for (const [name, shape] of Object.entries(SHAPES)) {
  const g = gaps(shape);
  check(`${name}: segments don't overlap`, g.every((x) => x.deg > 0 && x.deg < 180), JSON.stringify(g));
  check(`${name}: every gap is wide enough to survive the rounded edges (6° or more)`, g.every((x) => x.deg >= 6), JSON.stringify(g));
  const right = shape.segments.find((s) => s.id === 'right');
  const afterTail = shape.segments.find((s) => s.from > shape.tail.angle);
  check(`${name}: the tail sits inside its own gap, not across a segment`, shape.tail.angle > right.to + 8 && shape.tail.angle < afterTail.from - 8, `${right.to} < ${shape.tail.angle} < ${afterTail.from}`);
  check(`${name}: the tail starts inside the ring and ends outside it`, shape.tail.from < shape.ringInner + 0.05 && shape.tail.to > shape.ringOuter + 0.15);
  check(`${name}: a dark channel separates the core from the ring`, shape.ringInner - shape.core >= 0.12);
  const e = extent(shape);
  check(`${name}: fits its box at the scale the SVG uses`, Math.max(-e.left, e.right, -e.top, e.bottom) * 0.4 <= 0.5, JSON.stringify(e));
}
check('the small shape has fewer cuts than the full one', SHAPES.small.segments.length < SHAPES.full.segments.length);
check('the small shape has a thicker ring', SHAPES.small.ringOuter - SHAPES.small.ringInner > SHAPES.full.ringOuter - SHAPES.full.ringInner);
check('sizes of 32 px and under use the small shape', shapeFor(16) === SHAPES.small && shapeFor(32) === SHAPES.small && shapeFor(33) === SHAPES.full && shapeFor(256) === SHAPES.full);

console.log('legible without glow');
for (const key of ['cyan', 'blue', 'violet', 'accent']) {
  const c = contrast(PALETTE[key], PALETTE.navy);
  check(`${key} against the navy background: contrast ${c.toFixed(1)} (3 or more)`, c >= 3);
}

console.log('svg');
const count = (s, re) => (s.match(re) || []).length;
const full = markSVG({ size: 256 });
const small = markSVG({ size: 16 });
const mono = markSVG({ size: 22, mono: '#000' });
check('full: three segments with rim lights, a tail and a shaded core', count(full, /<path /g) === 7 && count(full, /<circle /g) === 1 && count(full, /<ellipse /g) === 1, `${count(full, /<path /g)} paths`);
check('small: two segments, a tail and a flat core', count(small, /<path /g) === 3 && count(small, /<circle /g) === 1 && !small.includes('<ellipse'));
check('no blur or filter anywhere', ![full, small, mono, markSVG({ size: 256, glow: true })].some((s) => /filter|blur/i.test(s)));
check('without glow there is no halo', !full.includes('halo') && markSVG({ size: 256, glow: true }).includes('halo'));
check('one-colour version uses only that colour', !/url\(#|#00E5FF|#A855F7/i.test(mono) && mono.includes('#000') && !mono.includes('<defs>'));
check('gradient ids carry the prefix, so two marks can share a page', markSVG({ id: 'hdr' }).includes('id="hdr-upper"') && !markSVG({ id: 'hdr' }).includes('id="q-'));
check('every gradient that is used is defined', [...full.matchAll(/url\(#([\w-]+)\)/g)].every((m) => full.includes(`id="${m[1]}"`)));
check('same input, same output', markSVG({ size: 64 }) === markSVG({ size: 64 }));
check('no NaN or undefined in the output', ![full, small, mono].some((s) => /NaN|undefined/.test(s)));
check('everything is drawn inside the box', [...full.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].every((m) => +m[1] >= 0 && +m[1] <= 256 && +m[2] >= 0 && +m[2] <= 256));
const [px, py] = polar(0, 0, 1, 90);
check('angles run clockwise from twelve o’clock', Math.abs(px - 1) < 1e-9 && Math.abs(py) < 1e-9);
check('helpers are exported for the live orb', typeof sectorPath === 'function' && tailPoints(0, 0, 1, SHAPES.full.tail).length === 4);

if (failed) { console.log(`\n${failed} case(s) failed\n`); process.exit(1); }
console.log('\nall passed\n');
