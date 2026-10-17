// Q's saved conversations (v0.4 steps 1 and 2, D-011, D-037): what was said, kept in one
// SQLite file on this Mac using the copy of SQLite built into Node. No audio,
// no network. Nothing here is ever added to what the model is sent; that is a
// later step and a separate decision.
//
// Saving can be paused, conversations can be deleted one at a time or all at
// once, and old ones are removed after the retention period. Everything said
// is also indexed for keyword search (SQLite's FTS5), and the index follows
// every save and delete.

export const MAX_TERMS = 8;

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
    search: () => [], conversation: () => null, exportMarkdown: () => '',
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
    // The search index. Built from the saved turns the first time this version
    // opens an older file, then kept in step by triggers (deletes included, so
    // deleted words can't be found).
    const indexed = db.prepare("select 1 from sqlite_master where name = 'turns_fts'").get();
    db.exec(`
      create virtual table if not exists turns_fts using fts5 (content, content = 'turns', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
      create trigger if not exists turns_ai after insert on turns begin
        insert into turns_fts (rowid, content) values (new.id, new.content);
      end;
      create trigger if not exists turns_ad after delete on turns begin
        insert into turns_fts (turns_fts, rowid, content) values ('delete', old.id, old.content);
      end;
    `);
    if (!indexed) db.exec("insert into turns_fts (turns_fts) values ('rebuild')");
  } catch (err) {
    return unavailable(`couldn't open ${file}: ${err.message}`);
  }

  const q = {
    getSetting: db.prepare('select value from settings where key = ?'),
    setSetting: db.prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value'),
    touch: db.prepare('insert into conversations (id, started_at, last_at) values (?, ?, ?) on conflict (id) do update set last_at = excluded.last_at'),
    add: db.prepare('insert into turns (conv, role, content, at) values (?, ?, ?, ?)'),
    newest: db.prepare('select id, started_at as startedAt, last_at as lastAt from conversations order by last_at desc limit 1'),
    turnsOf: db.prepare('select id, role, content, at from turns where conv = ? order by id'),
    all: db.prepare(`select c.id, c.started_at as startedAt, c.last_at as lastAt, count(t.id) as turns,
      (select content from turns where conv = c.id and role = 'user' order by id limit 1) as firstLine
      from conversations c left join turns t on t.conv = c.id group by c.id order by c.last_at desc`),
    one: db.prepare('select id, started_at as startedAt, last_at as lastAt from conversations where id = ?'),
    find: db.prepare(`select t.conv, t.id, t.role, t.at, snippet(turns_fts, 0, char(2), char(3), '…', 14) as snippet
      from turns_fts join turns t on t.id = turns_fts.rowid where turns_fts match ? order by t.at desc, t.id desc limit ?`),
    removeOne: db.prepare('delete from conversations where id = ?'),
    removeOld: db.prepare('delete from conversations where last_at < ?'),
    counts: db.prepare('select (select count(*) from conversations) as conversations, (select count(*) from turns) as turns, (select min(started_at) from conversations) as oldestAt'),
  };

  // After deleting, merge the search index so the removed words are dropped
  // from it too, rather than only marked as deleted.
  const compact = () => db.exec("insert into turns_fts (turns_fts) values ('optimize')");

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
    remove(conv) {
      const n = validId(conv) ? Number(q.removeOne.run(conv).changes) : 0;
      if (n) compact();
      return n;
    },

    clear() {
      const n = Number(db.prepare('delete from conversations').run().changes);
      db.exec("insert into turns_fts (turns_fts) values ('delete-all')");
      db.exec('vacuum'); // hand the space back and leave nothing behind in free pages
      return n;
    },

    // Drops conversations not touched within the retention period.
    prune(now = Date.now()) {
      const days = api.settings().retentionDays;
      const n = days ? Number(q.removeOld.run(now - days * DAY).changes) : 0;
      if (n) compact();
      return n;
    },

    conversation(conv) {
      const c = validId(conv) ? q.one.get(conv) : null;
      return c ? { ...c, turns: q.turnsOf.all(c.id) } : null;
    },

    // Keyword search over everything said, newest first. The words typed are
    // never passed to SQLite as query syntax: each becomes a quoted word that
    // also matches longer words starting with it ("pyth" finds "Python").
    // Matches in the snippet are wrapped in \u0002 … \u0003 for the page to mark.
    search(text, limit = 50) {
      const words = String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
      const terms = [...new Set(words)].slice(0, MAX_TERMS);
      if (!terms.length) return [];
      return q.find.all(terms.map((w) => `"${w}"*`).join(' '), Math.max(1, Math.min(200, limit | 0)));
    },

    // Conversations as a readable text file. ids: which ones (all if left out).
    exportMarkdown(ids, now = new Date()) {
      const wanted = ids ? ids.filter(validId) : null;
      const convs = q.all.all().filter((c) => !wanted || wanted.includes(c.id)).reverse(); // oldest first
      const when = (ms) => new Date(ms).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      const out = [`# Q conversations`, '', `Exported ${when(now.getTime())} from Q on this Mac. ${convs.length} conversation${convs.length === 1 ? '' : 's'}.`];
      for (const c of convs) {
        out.push('', `## ${when(c.startedAt)}`, '');
        for (const t of q.turnsOf.all(c.id)) out.push(`**${t.role === 'user' ? 'You' : 'Q'}:** ${t.content.replace(/\s*\n\s*/g, ' ')}`, '');
      }
      return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
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
