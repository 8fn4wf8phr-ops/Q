// Tests for the automatic microphone choice. Run: node scripts/test-mic.mjs
import { autoMic, WIRELESS } from '../public/micpick.js';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`  ${ok ? '✓' : '✕'} ${name}${ok || !detail ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const dev = (deviceId, label) => ({ deviceId, label, kind: 'audioinput' });

const builtIn = dev('aaa', 'MacBook Air Microphone (Built-in)');
const airpods = dev('bbb', 'AirPods');
const iphone = dev('ccc', 'Jacquez’s iPhone Microphone');
const usb = dev('ddd', 'Blue Yeti');

console.log('automatic microphone');
let r = autoMic([dev('default', 'Default - AirPods'), builtIn, airpods]);
check('AirPods as the default, built-in present: uses the built-in mic', r?.deviceId === 'aaa' && r.avoided === 'Default - AirPods', JSON.stringify(r));
r = autoMic([dev('default', 'Default - Jacquez’s iPhone Microphone'), iphone, builtIn]);
check('an iPhone as the default: uses the built-in mic', r?.deviceId === 'aaa', JSON.stringify(r));
check('built-in as the default: follows the default', autoMic([dev('default', 'Default - MacBook Air Microphone (Built-in)'), builtIn, airpods]) === null);
check('a wired USB mic as the default: left alone', autoMic([dev('default', 'Default - Blue Yeti'), usb, builtIn]) === null);
check('wireless default and no built-in mic: follows the default', autoMic([dev('default', 'Default - AirPods'), airpods, usb]) === null);
check('names hidden before the first recording: nothing decided', autoMic([dev('default', ''), dev('aaa', ''), dev('bbb', '')]) === null);
// Q's window (WebKit) lists no "default" entry and drops "(Built-in)": the first device is the default.
r = autoMic([dev('bbb', 'AirPods'), dev('aaa', 'MacBook Air Microphone')]);
check('WebKit-style list (no default entry, no "(Built-in)"): uses the built-in mic', r?.deviceId === 'aaa' && r.avoided === 'AirPods', JSON.stringify(r));
check('WebKit-style list with the built-in first: follows the default', autoMic([dev('aaa', 'MacBook Air Microphone'), dev('bbb', 'AirPods')]) === null);
check('never picks the alias entries themselves', autoMic([dev('default', 'Default - AirPods'), dev('communications', 'Communications - MacBook Air Microphone (Built-in)'), airpods]) === null);
check('empty or missing list does not throw', autoMic([]) === null && autoMic(null) === null);
check('wireless names are recognised', ['AirPods Pro', 'Bluetooth Headset', 'iPad Microphone', 'Hands-Free AG Audio'].every((n) => WIRELESS.test(n)) && !WIRELESS.test('MacBook Air Microphone'));

if (failed) { console.log(`\n${failed} case(s) failed\n`); process.exit(1); }
console.log('\nall passed\n');
