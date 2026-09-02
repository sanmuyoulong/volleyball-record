// 引导入口：装配各模块并启动首屏渲染。
// 具体职责已拆分到 state.js（数据）/ audit.js（审计）/ ui.js（DOM 工具）/ logic.js（业务逻辑）/ render.js（渲染与弹窗）。
import { initialState, normalizeState, readMatch, replaceState, setActiveMatch, STORAGE_KEY, syncActiveMatch, state, createSet } from "./state.js";
import { render, openDataManager } from "./render.js";
import { awardPoint, startMatch } from "./logic.js";

// 仅用于端到端测试的调试入口：浏览器流程测试通过 addInitScript 设置
// window.__VOLLEY_TEST__ 后挂载，生产环境不暴露任何全局钩子。
if (window.__VOLLEY_TEST__) {
  window.__volley = {
    awardPoint,
    startMatch,
    syncActiveMatch,
    getState: () => state,
    // 测试专用：在当前比赛后直接开下一局（沿用首局轮次），便于在 e2e 中快速打完多局。
    startNextSet(firstServer = 0) {
      const nextNumber = state.match.sets.length + 1;
      state.match.sets.push(createSet(nextNumber, state.firstLineups, firstServer));
      state.match.currentSetIndex = state.match.sets.length - 1;
      return state.match.currentSetIndex;
    }
  };
}

// 从赛事进入某场比赛时 URL 会带上 ?match=<id>，这里把对应的归档载入活动槽。
// 不带参数直接访问 /record/ 时行为与独立记分完全一致。
const requestedMatchId = new URLSearchParams(location.search).get("match");
if (requestedMatchId) {
  const archived = readMatch(requestedMatchId);
  if (archived) {
    const restored = normalizeState(archived);
    replaceState(restored);
    setActiveMatch(requestedMatchId, restored.tournamentId || null);
  }
}

document.querySelector("#reset-app").addEventListener("click", () => {
  if (!confirm("确定清除当前比赛并重新开始吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  replaceState(initialState());
  setActiveMatch(null);
  render();
});

document.querySelector("#data-manager").addEventListener("click", openDataManager);

render();
