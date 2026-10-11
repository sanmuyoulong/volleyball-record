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

// 应用内确认弹窗，返回 Promise<boolean>。直接挂到 body，不依赖 #modal-root，
// 因此赛事页等没有 modal-root 的页面也能用；同时避免沙箱 iframe 中原生 confirm 被静默拦截。
export function confirmDialog(message, { okText = "确定", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-message">${escapeHTML(message)}</p>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-act="cancel">取消</button>
          <button class="primary-button ${danger ? "danger" : "blue"}" type="button" data-act="ok">${escapeHTML(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "ok") close(true);
      else if (act === "cancel") close(false);
      else if (event.target === overlay) close(false);
    });
    overlay.querySelector('[data-act="ok"]')?.focus();
  });
}
