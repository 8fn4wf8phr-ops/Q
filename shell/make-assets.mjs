// Writes the SVGs Q's window is built with, from the one description of the
// mark in public/mark.js: the app icon (large and small cut) and the menu bar
// icon. Run by shell/build.sh:  node shell/make-assets.mjs <output folder>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { markSVG } from '../public/mark.js';

const out = process.argv[2];
if (!out) { console.error('usage: node shell/make-assets.mjs <output folder>'); process.exit(1); }
mkdirSync(out, { recursive: true });
// macOS app icons leave about a tenth of the canvas clear around the tile.
writeFileSync(join(out, 'icon.svg'), markSVG({ size: 1024, tile: 0.1, glow: true, shape: 'full', id: 'icon' }));
writeFileSync(join(out, 'icon-small.svg'), markSVG({ size: 1024, tile: 0.1, shape: 'small', id: 'icon' }));
// One colour: macOS tints it to suit a light or dark menu bar.
writeFileSync(join(out, 'menubar.svg'), markSVG({ size: 36, mono: '#000', shape: 'small', id: 'bar' }));
