// Cuts a streaming reply into pieces to speak. Free of browser APIs so
// scripts/test-chunk.mjs can run it in Node.
//
// Pieces normally end at a sentence. The first piece of a reply may instead
// end at a clause break (comma, semicolon, colon, dash) once a few words are
// ready, so Q can start talking before the model has finished its sentence.
// Later pieces gain nothing from that: they are synthesized while earlier
// audio is still playing.

const SENTENCE = /[.!?…]+["'”’)\]]*\s+|\n+/g;
const CLAUSE = /[,;:—–]\s+/g;
export const MIN_CLAUSE_WORDS = 3; // "Sure, …" is too short to be worth speaking alone

const letters = (s) => s.replace(/[^\p{L}\p{N}]/gu, '').length;
const words = (s) => s.split(/\s+/).filter((w) => letters(w) > 0).length;

// buf: text received so far and not yet spoken. Returns the complete pieces,
// the unfinished remainder, and whether the piece was cut at a clause.
export function takeChunks(buf, allowClause = false) {
  const chunks = [];
  let last = 0;
  let m;
  SENTENCE.lastIndex = 0;
  while ((m = SENTENCE.exec(buf))) {
    const end = m.index + m[0].length;
    const s = buf.slice(last, end).trim();
    if (letters(s) >= 2) chunks.push(s);
    last = end;
  }
  if (chunks.length || !allowClause) return { chunks, rest: buf.slice(last), clause: false };

  CLAUSE.lastIndex = 0;
  while ((m = CLAUSE.exec(buf))) {
    if (words(buf.slice(0, m.index)) < MIN_CLAUSE_WORDS) continue;
    const end = m.index + m[0].length;
    return { chunks: [buf.slice(0, end).trim()], rest: buf.slice(end), clause: true };
  }
  return { chunks, rest: buf, clause: false };
}
