// 引导入口：装配各模块并启动首屏渲染。
// 具体职责已拆分到 state.js（数据）/ audit.js（审计）/ ui.js（DOM 工具）/ logic.js（业务逻辑）/ render.js（渲染与弹窗）。
import { initialState, replaceState, STORAGE_KEY } from "./state.js";
import { render, openDataManager } from "./render.js";

document.querySelector("#reset-app").addEventListener("click", () => {
  if (!confirm("确定清除当前比赛并重新开始吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  replaceState(initialState());
  render();
});

document.querySelector("#data-manager").addEventListener("click", openDataManager);

render();
