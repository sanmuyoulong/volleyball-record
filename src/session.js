const KEY = "volley-console-demo-session-v1";
export const session = {
  async get() { try { return sessionStorage.getItem(KEY) === "demo" ? { kind: "demo" } : null; } catch { return null; } },
  async enterDemo() { sessionStorage.setItem(KEY, "demo"); },
  async signOut() { sessionStorage.removeItem(KEY); }
};
export function navigate(url) {
  if (window.__volleyOfflineNavigate && String(url).startsWith("file:")) {
    const target = new URL(url);
    if (target.pathname !== location.pathname) throw Error("离线版只能在当前文件内跳转。");
    location.assign(target.href); return;
  }
  location.href = url;
}
export function returnPath() {
  const path = location.protocol === "file:" ? `/${new URLSearchParams(location.search).get("page") || "console"}/` : location.pathname;
  const params = new URLSearchParams(location.search); params.delete("page");
  return path + (params.size ? `?${params}` : "");
}
export async function requireSession() {
  if (await session.get()) return true;
  navigate(`../login/?return=${encodeURIComponent(returnPath())}`);
  return false;
}
