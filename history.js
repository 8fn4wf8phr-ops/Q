// Q's saved conversations (v0.4 step 1, D-011): what was said, kept in one
// SQLite file on this Mac using the copy of SQLite built into Node. No audio,
// no network. Nothing here is ever added to what the model is sent; that is a
// later step and a separate decision.
//
// Saving can be paused, conversations can be deleted one at a time or all at
// once, and old ones are removed after the retention period.

import { mkdirSync, chmodSync, statSync } from 'node:fs';
import path from 'node:path';

export const RETENTION_CHOICES = [30, 90, 365, 0]; // days; 0 keeps conversations until they are deleted
const DEFAULT_SETTINGS = { enabled: true, retentionDays: 90 };
const DAY = 86_400_000;
const validId = (id) => typeof id === 'string' && /^[\w-]{8,64}$/.test(id);

// Something with the same shape that stores nothing, for when SQLite can't be used.
function unavailable(reason) {
  return {
    available: false, reason, file: null,
    settings: () => ({ ...DEFAULT_SETTINGS, enabled: false }),
    setSettings() { return this.settings(); },
    record: () => false, latest: () => null, list: () => [], remove: () => 0, clear: () => 0, prune: () => 0,
    stats: () => ({ conversations: 0, turns: 0, oldestAt: null, bytes: 0 }),
    close() {},
  };
}

export async function openHistory(file) {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { return unavailable('needs Node 22.5 or newer'); }
  let db;
  try {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    db = new DatabaseSync(file);
    if (file !== ':memory:') chmodSync(file, 0o600); // readable by this user only
    // secure_delete overwrites removed rows, so "delete" doesn't leave the words in the file.
    db.exec(`
      pragma foreign_keys = on;
      pragma secure_delete = on;
      create table if not exists conversations (id text primary key, started_at integer not null, last_at integer not null);
      create table if not exists turns (id integer primary key, conv text not null references conversations(id) on delete cascade,
        role text not null check (role in ('user', 'assistant')), content text not null, at integer not null);
      create index if not exists turns_conv on turns (conv, id);
      create table if not exists settings (key text primary key, value text not null);
    `);
  } catch (err) {
    return unavailable(`couldn't open ${file}: ${err.message}`);
  }

  const q = {
    getSetting: db.prepare('select value from settings where key = ?'),
    setSetting: db.prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value'),
    touch: db.prepare('insert into conversations (id, started_at, last_at) values (?, ?, ?) on conflict (id) do update set last_at = excluded.last_at'),
    add: db.prepare('insert into turns (conv, role, content, at) values (?, ?, ?, ?)'),
    newest: db.prepare('select id, started_at as startedAt, last_at as lastAt from conversations order by last_at desc limit 1'),
    turnsOf: db.prepare('select role, content, at from turns where conv = ? order by id'),
    all: db.prepare('select c.id, c.started_at as startedAt, c.last_at as lastAt, count(t.id) as turns from conversations c left join turns t on t.conv = c.id group by c.id order by c.last_at desc'),
    removeOne: db.prepare('delete from conversations where id = ?'),
    removeOld: db.prepare('delete from conversations where last_at < ?'),
    counts: db.prepare('select (select count(*) from conversations) as conversations, (select count(*) from turns) as turns, (select min(started_at) from conversations) as oldestAt'),
  };

  const api = {
    available: true,
    reason: null,
    file,

    settings() {
      const out = { ...DEFAULT_SETTINGS };
      const enabled = q.getSetting.get('enabled');
      const days = q.getSetting.get('retentionDays');
      if (enabled) out.enabled = enabled.value === '1';
      if (days && RETENTION_CHOICES.includes(Number(days.value))) out.retentionDays = Number(days.value);
      return out;
    },

    // Unknown or invalid values are ignored, never stored.
    setSettings({ enabled, retentionDays } = {}) {
      if (typeof enabled === 'boolean') q.setSetting.run('enabled', enabled ? '1' : '0');
      if (RETENTION_CHOICES.includes(retentionDays)) q.setSetting.run('retentionDays', String(retentionDays));
      return api.settings();
    },

    // One finished exchange: what he said and what Q answered. Returns whether it was stored.
    record(conv, userText, replyText, at = Date.now()) {
      if (!api.settings().enabled || !validId(conv)) return false;
      if (typeof userText !== 'string' || typeof replyText !== 'string' || !userText.trim() || !replyText.trim()) return false;
      db.exec('begin');
      try {
        q.touch.run(conv, at, at);
        q.add.run(conv, 'user', userText, at);
        q.add.run(conv, 'assistant', replyText, at);
        db.exec('commit');
        return true;
      } catch (err) {
        db.exec('rollback');
        throw err;
      }
    },

    // The most recent conversation, if it was active within maxAgeMs; used to carry on after a restart.
    latest(maxAgeMs = Infinity, now = Date.now()) {
      const c = q.newest.get();
      if (!c || now - c.lastAt > maxAgeMs) return null;
      return { ...c, turns: q.turnsOf.all(c.id) };
    },

    list: () => q.all.all(),
    remove: (conv) => (validId(conv) ? Number(q.removeOne.run(conv).changes) : 0),

    clear() {
      const n = Number(db.prepare('delete from conversations').run().changes);
      db.exec('vacuum'); // hand the space back and leave nothing behind in free pages
      return n;
    },

    // Drops conversations not touched within the retention period.
    prune(now = Date.now()) {
      const days = api.settings().retentionDays;
      return days ? Number(q.removeOld.run(now - days * DAY).changes) : 0;
    },

    stats() {
      let bytes = 0;
      try { if (file !== ':memory:') bytes = statSync(file).size; } catch { /* not written yet */ }
      return { ...q.counts.get(), bytes };
    },

    close: () => db.close(),
  };
  return api;
}
