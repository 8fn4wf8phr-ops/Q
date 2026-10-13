// Which microphone Q uses when you haven't chosen one.
// macOS makes AirPods or a nearby iPhone the default input on its own, and a
// wireless mic cuts Q's voice: the headphones switch to call mode while the mic
// is open and back when it closes, dropping the sound each time. So when the
// default is wireless and this Mac has a built-in mic, Q uses the built-in one.

export const WIRELESS = /iphone|ipad|airpods|bluetooth|hands-free|headset/i;
const BUILT_IN = /built-in|macbook|imac/i;
const ALIAS = new Set(['default', 'communications']); // the browser's stand-ins for devices it also lists by themselves

// inputs: the browser's audio input list ({ deviceId, label }). Labels are
// empty until the microphone has been allowed once; then nothing can be decided.
// Returns the built-in device to use and the default it replaces, or null to
// follow the system default.
export function autoMic(inputs) {
  const named = (inputs || []).filter((d) => d && d.label);
  const def = named.find((d) => d.deviceId === 'default') || named[0];
  if (!def || !WIRELESS.test(def.label)) return null;
  const builtIn = named.find((d) => !ALIAS.has(d.deviceId) && BUILT_IN.test(d.label) && !WIRELESS.test(d.label));
  return builtIn ? { deviceId: builtIn.deviceId, label: builtIn.label, avoided: def.label } : null;
}
