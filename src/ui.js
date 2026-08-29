// DOM 工具层：根节点引用与纯展示辅助函数。
// 叶子模块，不依赖项目内其他模块，可被 render / logic 直接导入。
export const app = document.querySelector("#app");
export const modalRoot = document.querySelector("#modal-root");
export const toastRoot = document.querySelector("#toast-root");

export function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function toast(message, type = "normal") {
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "error" : ""}`;
  node.textContent = message;
  toastRoot.replaceChildren(node);
  setTimeout(() => node.remove(), 3000);
}

export function showValidation(message) {
  const slot = app.querySelector("#validation-slot");
  if (slot) slot.innerHTML = `<div class="validation-banner">${escapeHTML(message)}</div>`;
}

export function safeFilename(value) {
  return String(value || "排球比赛").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80);
}
