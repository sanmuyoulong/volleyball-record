// 场区与队伍身份分开保存：换边不改变 A/B、轮次、发球权或数据归属。
export const COURT_SOURCES = {
  standard: "https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf",
  vnl2026: "https://images.volleyballworld.com/image/upload/fl_attachment/fivb-prd/rga3nbp8jdsecv8e9txg.pdf"
};

export function courtPolicy(profile, maxSets, configured = "auto") {
  // VNL 特别规程仅用于五局三胜；本应用三局两胜沿用逐局安排。
  if (Number(maxSets) !== 5 || profile !== "test2026") return "standard";
  return configured === "standard" ? "standard" : "vnl2026";
}

export function needsDecidingCourtChoice(nextNumber, maxSets, policy) {
  return nextNumber === Number(maxSets) && policy === "standard";
}

export function changesBetweenSets(nextNumber, maxSets, policy) {
  if (nextNumber <= 1 || nextNumber > Number(maxSets)) return false;
  // VNL 2026 §6.9(d)：局间仅在第二、三局之间换边，不能推导为第四局后再换。
  if (policy === "vnl2026") return nextNumber === 3;
  return nextNumber !== Number(maxSets); // 决胜局场区由重新掷币决定。
}

export function physicalLeftTeam(set) {
  // 未迁移的旧快照不知道原场区，保持它原有的显示，不猜测历史。
  const initial = [0, 1].includes(set?.initialLeftTeam) ? set.initialLeftTeam : Number(Boolean(set?.courtChanged));
  return initial ^ Number(Boolean(set?.courtChanged));
}

export function scoreTeamOrder(set, manuallySwapped = false) {
  const left = physicalLeftTeam(set) ^ Number(Boolean(manuallySwapped));
  return [left, 1 - left];
}

export function nextSetLeftTeam(previous, nextNumber, maxSets, policy) {
  return physicalLeftTeam(previous) ^ Number(changesBetweenSets(nextNumber, maxSets, policy));
}

export function shouldChangeAtEight(set, maxSets) {
  return set.number === Number(maxSets) && !set.courtChanged && Math.max(...set.score) >= 8;
}

export function courtPolicyLabel(policy) {
  return policy === "vnl2026" ? "VNL 2026 换边" : "逐局换边";
}

export function courtPolicyDescription(policy) {
  return policy === "vnl2026"
    ? "局间仅在第 2 局结束后换边；第 5 局沿用第 4 局场区。决胜局领先队到 8 分时换边。"
    : "普通局之间逐局换边；决胜局开局按重新掷币结果选边，领先队到 8 分时再换边。";
}
