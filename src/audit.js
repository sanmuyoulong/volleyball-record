// 审计日志层：只追加记录所有改变比赛事实的操作，并支持安全撤销最近一个有效操作。
import { formatClock } from "./rules.js";
import { state, currentSet, clone, saveRecoverySnapshot } from "./state.js";

export function latestReversibleAction() {
  return [...(state.match?.auditLog || [])].reverse().find(entry => entry.reversible && !entry.reversed) || null;
}

export function recordAuditAction(type, label, before, meta = {}) {
  if (!state.match) return null;
  const set = currentSet();
  const entry = {
    id: `${Date.now()}-${state.match.auditLog.length + 1}`,
    at: formatClock(),
    timestamp: new Date().toISOString(),
    type,
    label,
    setNumber: set?.number || null,
    score: set ? `${set.score[0]}:${set.score[1]}` : "—",
    meta,
    reversible: Boolean(before),
    reversed: false,
    before
  };
  state.match.auditLog.push(entry);
  if (state.match.auditLog.length > 250) state.match.auditLog.splice(0, state.match.auditLog.length - 250);
  saveRecoverySnapshot(label, type !== "score");
  return entry;
}

export function reverseLatestAction(reason) {
  const entry = latestReversibleAction();
  if (!entry?.before) return { ok: false, message: "没有可撤销的操作。" };
  const auditLog = state.match.auditLog;
  state.match = { ...clone(entry.before), auditLog, undoStack: [] };
  entry.reversed = true;
  auditLog.push({
    id: `${Date.now()}-${auditLog.length + 1}`,
    at: formatClock(),
    timestamp: new Date().toISOString(),
    type: "correction",
    label: `撤销：${entry.label}`,
    setNumber: currentSet()?.number || null,
    score: currentSet() ? `${currentSet().score[0]}:${currentSet().score[1]}` : "—",
    meta: { reason: reason || "记录员纠错", reversedActionId: entry.id },
    reversible: false,
    reversed: false,
    before: null
  });
  saveRecoverySnapshot(`纠错：${entry.label}`, true);
  return { ok: true, entry };
}
