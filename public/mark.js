// The Split-Core Q mark (D-017): one description of its shape, used by every
// place Q draws itself, so the live orb, the header mark and the icons agree.
//
// Units: the ring's outer radius is 1. Angles are degrees clockwise from
// twelve o'clock. Nothing here touches the page, so node can test it.

export const PALETTE = {
  cyan: '#00E5FF',
  blue: '#3B82F6',
  violet: '#A855F7',
  accent: '#D946EF',
  navy: '#0B0F1A',
};

// full: three ring segments, the tail in the gap at the lower right, and a
// dark core with a channel around it.
// small (32 px and under): the left gap closes and the others widen, the ring
// thickens and the core loses its shading, because fine cuts blur into mush.
export const SHAPES = {
  full: {
    ringOuter: 1,
    ringInner: 0.66,
    core: 0.5,
    segments: [
      { id: 'upper', from: 277, to: 355, colors: ['cyan', 'cyan'] },   // top left
      { id: 'lower', from: 160, to: 263, colors: ['blue', 'cyan'] },   // bottom left, bluer toward the tail
      { id: 'right', from: 5, to: 116, colors: ['violet', 'accent'] }, // right side
    ],
    tail: { angle: 138, from: 0.6, to: 1.26, half: 0.15, colors: ['violet', 'accent'] },
  },
  small: {
    ringOuter: 1,
    ringInner: 0.56,
    core: 0.36,
    segments: [
      { id: 'left', from: 162, to: 352, colors: ['blue', 'cyan'] },
      { id: 'right', from: 8, to: 112, colors: ['violet', 'accent'] },
    ],
    tail: { angle: 138, from: 0.52, to: 1.26, half: 0.19, colors: ['violet', 'accent'] },
  },
};

const rad = (deg) => (deg * Math.PI) / 180;
const n = (v) => Number(v.toFixed(2));

// A point on a circle of radius r around (cx, cy), at an angle clockwise from the top.
export function polar(cx, cy, r, deg) {
  return [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];
}

// A slice of the ring between two radii and two angles, as SVG path data.
export function sectorPath(cx, cy, outer, inner, from, to) {
  const large = to - from > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, outer, from);
  const [x2, y2] = polar(cx, cy, outer, to);
  const [x3, y3] = polar(cx, cy, inner, to);
  const [x4, y4] = polar(cx, cy, inner, from);
  return `M${n(x1)} ${n(y1)}A${n(outer)} ${n(outer)} 0 ${large} 1 ${n(x2)} ${n(y2)}L${n(x3)} ${n(y3)}A${n(inner)} ${n(inner)} 0 ${large} 0 ${n(x4)} ${n(y4)}Z`;
}

// The tail: a blade along one diagonal, its ends cut level like the reference.
export function tailPoints(cx, cy, R, tail) {
  const [ax, ay] = polar(cx, cy, tail.from * R, tail.angle);
  const [bx, by] = polar(cx, cy, tail.to * R, tail.angle);
  const h = tail.half * R;
  return [[ax - h, ay], [ax + h, ay], [bx + h, by], [bx - h, by]];
}

// How far the mark reaches from its centre in each direction, in ring radii.
export function extent(shape) {
  const xs = [-1, 1];
  const ys = [-1, 1];
  for (const [x, y] of tailPoints(0, 0, 1, shape.tail)) { xs.push(x); ys.push(y); }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

export const shapeFor = (size) => (size <= 32 ? SHAPES.small : SHAPES.full);

// The mark as a standalone SVG.
//   size   edge of the square, in px
//   shape  'full' | 'small'; chosen from the size if left out
//   glow   a soft halo behind the mark; the mark must read without it
//   mono   one flat colour (for a menu bar icon), e.g. '#000'
//   id     prefix for gradient ids, so several marks can share a page
//   tile   a dark rounded square behind the mark, for places with a light or
//          unknown background (app icon, browser tab). A number is the margin
//          around the tile as a share of the size (macOS app icons leave one).
export function markSVG({ size = 64, shape, glow = false, mono = null, id = 'q', tile = false } = {}) {
  const s = typeof shape === 'string' ? SHAPES[shape] : shape || shapeFor(size);
  const isSmall = s === SHAPES.small;
  const margin = typeof tile === 'number' ? tile : 0;
  const box = size * (1 - margin * 2);
  // On a tile the mark sits a touch up and left, so ring and tail together look centred.
  const c = size / 2 - (tile !== false ? box * 0.025 : 0);
  const R = box * (tile !== false ? 0.33 : glow ? 0.36 : 0.4); // leaves room for the tail, and for the halo when there is one
  const out = [];
  const defs = [];
  if (tile !== false && !mono) {
    defs.push(`<linearGradient id="${id}-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a30"/><stop offset="1" stop-color="#070a16"/></linearGradient>`);
    out.push(`<rect x="${n(size * margin)}" y="${n(size * margin)}" width="${n(box)}" height="${n(box)}" rx="${n(box * 0.225)}" fill="url(#${id}-tile)"/>`);
  }
  const fill = (key, colors, from, to) => {
    if (mono) return mono;
    const [x1, y1] = from;
    const [x2, y2] = to;
    defs.push(`<linearGradient id="${id}-${key}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"><stop offset="0" stop-color="${PALETTE[colors[0]]}"/><stop offset="1" stop-color="${PALETTE[colors[1]]}"/></linearGradient>`);
    return `url(#${id}-${key})`;
  };

  if (glow && !mono) {
    defs.push(`<radialGradient id="${id}-halo"><stop offset="0.45" stop-color="${PALETTE.blue}" stop-opacity="0.32"/><stop offset="0.75" stop-color="${PALETTE.violet}" stop-opacity="0.12"/><stop offset="1" stop-color="${PALETTE.violet}" stop-opacity="0"/></radialGradient>`);
    out.push(`<circle cx="${n(c)}" cy="${n(c)}" r="${n(tile !== false ? box * 0.46 : size * 0.5)}" fill="url(#${id}-halo)"/>`);
    // Keep the channel between ring and core dark; the halo belongs outside the ring.
    out.push(`<circle cx="${n(c)}" cy="${n(c)}" r="${n(R * s.ringInner)}" fill="${PALETTE.navy}"/>`);
  }

  // A hairline stroke in the fill colour rounds the corners; the gaps are cut wide enough to allow for it.
  const edge = n(R * 0.035);
  for (const seg of s.segments) {
    const paint = fill(seg.id, seg.colors, polar(c, c, R * s.ringOuter, seg.from), polar(c, c, R * s.ringOuter, seg.to));
    out.push(`<path d="${sectorPath(c, c, R * s.ringOuter, R * s.ringInner, seg.from, seg.to)}" fill="${paint}" stroke="${paint}" stroke-width="${edge}" stroke-linejoin="round"/>`);
    // A lit outer rim, so the ring has an edge even with no glow around it.
    if (!isSmall && !mono) out.push(`<path d="${sectorPath(c, c, R * s.ringOuter, R * (s.ringOuter - 0.07), seg.from, seg.to)}" fill="#fff" opacity="0.2"/>`);
  }

  const pts = tailPoints(c, c, R, s.tail);
  const tailPaint = fill('tail', s.tail.colors, pts[0], pts[2]);
  out.push(`<path d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z" fill="${tailPaint}" stroke="${tailPaint}" stroke-width="${edge}" stroke-linejoin="round"/>`);

  if (mono) {
    out.push(`<circle cx="${n(c)}" cy="${n(c)}" r="${n(R * s.core * 0.8)}" fill="${mono}"/>`);
  } else if (isSmall) {
    out.push(`<circle cx="${n(c)}" cy="${n(c)}" r="${n(R * s.core)}" fill="#16226b"/>`);
  } else {
    defs.push(`<radialGradient id="${id}-core" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="#3550c8"/><stop offset="0.45" stop-color="#14206a"/><stop offset="1" stop-color="#070b22"/></radialGradient>`);
    out.push(`<circle cx="${n(c)}" cy="${n(c)}" r="${n(R * s.core)}" fill="url(#${id}-core)" stroke="${PALETTE.blue}" stroke-opacity="0.55" stroke-width="${n(R * 0.02)}"/>`);
    out.push(`<ellipse cx="${n(c - R * 0.16)}" cy="${n(c - R * 0.22)}" rx="${n(R * 0.2)}" ry="${n(R * 0.11)}" fill="#fff" opacity="0.13" transform="rotate(-28 ${n(c - R * 0.16)} ${n(c - R * 0.22)})"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Q">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${out.join('')}</svg>`;
}
