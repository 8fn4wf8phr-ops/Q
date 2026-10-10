// Each user message is sent to the model with its time in square brackets
// (see server.js). A small model sometimes starts its reply by copying that
// stamp back, which Q would then read aloud. This filter sits on the reply
// stream and removes a leading bracketed timestamp, and nothing else.
//
// Replies that don't start with "[" pass straight through with no delay.
// One that does is held only until its "]" arrives, or 60 characters.

const LOOKS_LIKE_STAMP = /\b(AM|PM)\b|\b20\d\d\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+[A-Z][a-z]{2}/;
const HOLD_LIMIT = 60;

// Returns { push(text) → text to emit now, end() → anything still held }.
export function createEchoFilter() {
  let held = '';
  let open = true;
  let skipSpace = false; // the space that followed a removed stamp may arrive in a later token
  const afterStamp = (text) => {
    const out = text.trimStart();
    if (out) skipSpace = false;
    return out;
  };
  return {
    push(text) {
      if (!open) return skipSpace ? afterStamp(text) : text;
      held += text;
      const body = held.trimStart();
      if (!body) return '';
      if (body[0] !== '[') { open = false; return held; }
      const close = body.indexOf(']');
      if (close < 0) {
        if (body.length <= HOLD_LIMIT) return '';
        open = false;
        return held;
      }
      open = false;
      if (!LOOKS_LIKE_STAMP.test(body.slice(1, close))) return held;
      skipSpace = true;
      return afterStamp(body.slice(close + 1));
    },
    end() {
      const rest = open ? held : '';
      open = false;
      held = '';
      return rest;
    },
  };
}
