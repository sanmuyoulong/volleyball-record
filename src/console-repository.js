// Async repository boundary; all writes use atomic revision checks.
import { validateFinal } from "./console-domain.js";
import { normalizeStatistics, validateStatistics } from "./statistics-state.js";
const NAME = "volley-console-v1";
const KINDS = ["teams", "events", "matches", "meta"];
let database;
export function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => KINDS.forEach(k => request.result.createObjectStore(k, { keyPath: "id" }));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("数据库升级被其他页面阻止，请关闭其他记录页面后重试。"));
  });
  database.catch(() => { database = null; });
  return database;
}
export const repository = {
  async list(kind) { const db = await openDatabase(); return new Promise((resolve, reject) => { const r = db.transaction(kind).objectStore(kind).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); },
  async get(kind, id) { const db = await openDatabase(); return new Promise((resolve, reject) => { const r = db.transaction(kind).objectStore(kind).get(id); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error); }); },
  async put(kind, item, expected = 0) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(kind, "readwrite"), store = tx.objectStore(kind), read = store.get(item.id);
      let saved, reason;
      read.onsuccess = () => {
        if ((read.result?.revision || 0) !== expected) { reason = Error("记录已在其他页面更新。当前修改尚未保存，请导出备份后重新载入。"); tx.abort(); return; }
        const now = new Date().toISOString();
        saved = { ...structuredClone(item), revision: expected + 1, createdAt: read.result?.createdAt || item.createdAt || now, updatedAt: now };
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = tx.onerror = () => reject(reason || tx.error || Error("本机保存失败，请导出备份。"));
    });
  },
  async backup() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KINDS), data = {};
      KINDS.forEach(k => { const r = tx.objectStore(k).getAll(); r.onsuccess = () => { data[k] = r.result; }; });
      tx.oncomplete = () => resolve({ type: "volley-console-backup", version: 1, exportedAt: new Date().toISOString(), data });
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  },
  async restore(backup) {
    validateBackup(backup);
    const db = await openDatabase();
    // Additive import only; id collisions are remapped as one transaction.
    const fresh = structuredClone(backup.data), maps = Object.fromEntries(KINDS.map(k => [k, new Map()]));
    const existing = await Promise.all(KINDS.map(k => this.list(k)));
    KINDS.forEach((k, i) => { const ids = new Set(existing[i].map(x => x.id)); fresh[k].forEach(x => maps[k].set(x.id, ids.has(x.id) ? `${k}-${crypto.randomUUID()}` : x.id)); });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KINDS, "readwrite");
      KINDS.forEach(k => fresh[k].forEach(x => {
        const old = x.id; x.id = maps[k].get(old); x.revision = 1;
        if (k === "matches") {
          x.tournamentId = x.tournamentId ? maps.events.get(x.tournamentId) : null;
          if (!x.tournamentId) x.teams.forEach(t => { t.id = maps.teams.get(t.id) || t.id; });
          if (x.scoring) { x.scoring.matchId = x.id; x.scoring.tournamentId = x.tournamentId; }
        }
        if (k === "events") x.teams.forEach(t => { if (t.libraryId) t.libraryId = maps.teams.get(t.libraryId) || t.libraryId; });
        if (k === "meta") x.id = `imported-meta-${crypto.randomUUID()}`;
        tx.objectStore(k).add(x);
      }));
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }
};
export function validateBackup(b) {
  if (b?.type !== "volley-console-backup" || b.version !== 1 || !b.data) throw Error("不是有效的控制台备份文件。");
  KINDS.forEach(k => {
    if (!Array.isArray(b.data[k])) throw Error("备份缺少数据表。");
    const ids = new Set(); b.data[k].forEach(x => { if (!x || typeof x.id !== "string" || !x.id || ids.has(x.id)) throw Error("备份含无效或重复编号。"); ids.add(x.id); });
  });
  const events = new Set(b.data.events.map(x => x.id));
  b.data.events.forEach(x => { if (typeof x.name !== "string" || !Array.isArray(x.teams)) throw Error("赛事数据不完整。"); });
  b.data.teams.forEach(x => { if (typeof x.name !== "string" || !Array.isArray(x.roster)) throw Error("队伍数据不完整。"); });
  b.data.matches.forEach(x => {
    if (!x.meta || !Array.isArray(x.teams) || x.teams.length !== 2 || x.teams.some(t => !t || typeof t.name !== "string" || !Array.isArray(t.roster))) throw Error("比赛数据不完整。");
    if (x.tournamentId && !events.has(x.tournamentId)) throw Error("比赛引用的赛事缺失。");
    if (!x.missing && (!x.scoring?.meta || !Array.isArray(x.scoring.teams) || !x.statistics)) throw Error("比赛记录内容缺失。");
    if (x.scoring?.match && (!Array.isArray(x.scoring.match.sets) || x.scoring.match.sets.some(s => !Array.isArray(s.score) || s.score.length !== 2 || s.score.some(n => !Number.isSafeInteger(n) || n < 0)))) throw Error("计分记录的局比分无效。");
    for (const side of ["home", "away"]) {
      const stats = x.statistics?.[side];
      if (stats == null) continue;
      if (stats.version !== 1 || !Array.isArray(stats.players) || stats.players.length !== 14 || stats.setterStatistics?.players?.length > 4) throw Error("技术统计记录格式无效。");
      if (stats.screen === "table" && validateStatistics(normalizeStatistics(stats))) throw Error("技术统计的队伍或名单信息不完整。");
    }
    if (x.manualConfirmed && !x.scoring?.match) validateFinal(x);
  });
}
export async function migrateLegacy() {
  if (await repository.get("meta", "legacy-v1")) return;
  const originals = {};
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key.startsWith("volley-record-")) originals[key] = localStorage.getItem(key); }
  const parse = key => { try { return JSON.parse(originals[key]); } catch { return null; } };
  const events = parse("volley-record-tournaments-v1") || [];
  const records = new Map();
  events.forEach(event => (event.matches || []).forEach(summary => records.set(summary.id, { summary, eventId: event.id })));
  Object.keys(originals).filter(k => k.startsWith("volley-record-match-")).forEach(k => { const key = k.slice("volley-record-match-".length); if (!records.has(key)) records.set(key, { summary: {}, eventId: null }); });
  const { newMatch, copy } = await import("./console-domain.js");
  const active = parse("volley-record-state-v1");
  if (active?.matchId && !records.has(active.matchId)) records.set(active.matchId, { summary: {}, eventId: active.tournamentId || null });
  const migrated = [];
  records.forEach(({ summary, eventId }, key) => {
    const raw = parse(`volley-record-match-${key}`) || (active?.matchId === key ? active : null);
    const teams = raw?.teams || [{ name: summary.teamA || "记录缺失", roster: [] }, { name: summary.teamB || "记录缺失", roster: [] }];
    const belonging = events.some(e => e.id === eventId) ? eventId : null;
    const m = newMatch(raw?.meta || { competition: "旧比赛记录" }, teams, belonging);
    m.id = key; m.missing = !raw;
    if (raw) { m.scoring = copy(raw); m.scoring.matchId = key; m.scoring.tournamentId = belonging; }
    migrated.push(m);
  });
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(KINDS, "readwrite"), meta = tx.objectStore("meta");
    const request = meta.get("legacy-v1");
    request.onsuccess = () => {
      if (request.result) return;
      events.forEach(e => tx.objectStore("events").put({ ...copy(e), teams: e.teams || [], matches: undefined, revision: 1, archived: false }));
      migrated.forEach(m => tx.objectStore("matches").put({ ...m, revision: 1 }));
      meta.put({ id: "legacy-v1", originals, migratedAt: new Date().toISOString() });
    };
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
