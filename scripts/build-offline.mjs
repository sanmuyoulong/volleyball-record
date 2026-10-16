// 生成真正可通过 file:// 打开的单文件：HTML、CSS、图标和全部原生 ES 模块均内嵌。
// 保留原生模块语义（含循环引用、实时绑定与顶层 await），无需 CDN 或构建依赖。
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputPath = resolve(projectRoot, process.argv[2] || "output/Volley-Record-离线版.html");
const json = value => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
const pages = {};
for (const [key, path] of [["home", "index.html"], ["record", "record/index.html"], ["tournaments", "tournaments/index.html"], ["console", "console/index.html"], ["login", "login/index.html"], ["help", "help/index.html"]]) {
  const html = await readFile(resolve(projectRoot, path), "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!body || !title) throw Error(`Missing HTML page: ${path}`);
  pages[key] = { title, body: body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "") };
}

const imports = {};
for (const filename of (await readdir(resolve(projectRoot, "src"))).filter(p => p.endsWith(".js")).sort()) {
  let code = await readFile(resolve(projectRoot, "src", filename), "utf8");
  // 本项目模块使用相邻文件的显式 .js 路径，将其映射为 import map 的稳定名称。
  code = code.replace(/(\bfrom\s*["']|\bimport\s*\(\s*["'])(\.\/[^"']+\.js)(["'])/g, (_, prefix, path, quote) => `${prefix}volley/${path.slice(2)}${quote}`);
  // 赛事模块的程序跳转也使用单文件路由；仅修改离线副本，不改线上源文件。
  code = code.replace(/\blocation\.href\s*=\s*([^;\r\n]+);/g, "window.__volleyOfflineNavigate($1);");
  if (/\bfrom\s*["']\.\.?\//.test(code) || /\bimport\s*\(\s*["']\.\.?\//.test(code)) throw Error(`Unbundled import in ${filename}`);
  imports[`volley/${filename}`] = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

const css = (await readFile(resolve(projectRoot, "styles.css"), "utf8")).replace(/<\/style/gi, "<\\/style");
if (/url\s*\(/i.test(css)) throw Error("CSS gained external resources; inline them before making the offline release.");
const icon = (await readFile(resolve(projectRoot, "assets/favicon.ico"))).toString("base64");
const attribution = { statement: "已开源至 GitHub 仓库：", github: "https://github.com/sanmuyoulong/volleyball-record" };
const attributionStyles = `
.offline-authorship { width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 20px 16px 28px; border-top: 1px solid #dce1e8; color: #5b6470; font-size: 12px; line-height: 1.8; text-align: center; }
.offline-authorship span, .offline-authorship a { display: inline-block; margin: 0 8px; }
.offline-authorship a { color: #155eef; text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
@media print {
  #offline-authorship { display: block !important; position: fixed; left: 0; right: 0; bottom: 0; width: auto; margin: 0; padding: 0; border: 0; background: white; color: #5b6470; font-size: 6pt; line-height: 1; white-space: nowrap; z-index: 1000; }
  body.printing-full-match > #offline-authorship { display: block !important; }
  #offline-authorship a { color: inherit; text-decoration: none; }
}
`;
const metadata = { format: "volley-record-offline", version: 1, created: new Date().toISOString(), modules: Object.keys(imports).length, attribution };
const bootstrap = `
const pages = ${json(pages)};
const params = new URLSearchParams(location.search);
const requestedPage = params.get("page") || (params.has("mode") || params.has("match") ? "record" : "home");
const page = Object.hasOwn(pages, requestedPage) ? requestedPage : "home";
document.title = pages[page].title + " · 离线版";
document.body.innerHTML = pages[page].body;
const authorship = document.createElement("footer");
authorship.id = "offline-authorship";
authorship.className = "offline-authorship";
authorship.setAttribute("aria-label", "著作声明");
authorship.innerHTML = '<span>${attribution.statement}</span><a href="${attribution.github}" target="_blank" rel="noopener noreferrer">github.com/sanmuyoulong/volleyball-record</a>';
document.body.append(authorship);
// 打印时提前放置固定页脚，确保第一页也带有仓库链接；屏幕中仍显示在页面底部。
window.addEventListener("beforeprint", () => document.body.prepend(authorship));
window.addEventListener("afterprint", () => document.body.append(authorship));
const virtualOrigin = "https://offline.volley.invalid";
const virtualBase = virtualOrigin + (page === "home" ? "/" : "/" + page + "/");

function localURL(href) {
  if (!href || href.startsWith("#") || /^(?:file:|blob:|data:|mailto:|tel:|javascript:)/i.test(href)) return null;
  const destination = new URL(href, virtualBase);
  if (destination.origin !== virtualOrigin) return null;
  const pathname = destination.pathname;
  let route;
  if (pathname === "/" || pathname === "/index.html") route = "home";
  else if (pathname === "/record/" || pathname === "/record/index.html") route = "record";
  else if (pathname === "/tournaments/" || pathname === "/tournaments/index.html") route = "tournaments";
  else if (pathname === "/console/" || pathname === "/console/index.html") route = "console";
  else if (pathname === "/login/" || pathname === "/login/index.html") route = "login";
  else if (pathname === "/help/" || pathname === "/help/index.html") route = "help";
  else throw Error("离线包中没有这个页面：" + pathname);
  const target = new URL(location.href);
  target.search = destination.search;
  target.searchParams.set("page", route);
  target.hash = destination.hash;
  return target.href;
}

window.__volleyOfflineNavigate = href => {
  const target = localURL(href);
  if (!target) throw Error("无法跳转到离线页面");
  location.href = target;
};
function rewriteLinks(root) {
  const links = root.querySelectorAll ? [...root.querySelectorAll("a[href]")] : [];
  if (root.matches?.("a[href]")) links.push(root);
  for (const a of links) {
    if (a.hasAttribute("download")) continue;
    const target = localURL(a.getAttribute("href"));
    if (target) a.setAttribute("href", target);
  }
}
rewriteLinks(document.body);
const observer = new MutationObserver(records => {
  for (const r of records) {
    if (r.type === "attributes") rewriteLinks(r.target);
    else r.addedNodes.forEach(rewriteLinks);
  }
});
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
document.addEventListener("click", event => {
  const a = event.target.closest?.("a[href]");
  if (a) rewriteLinks(a);
}, true);

const label = document.querySelector(".brand small");
if (label) label.textContent += " · 离线版";
try {
  if (page === "record") await import("volley/record-entry.js");
  else if (page === "tournaments") await import("volley/tournaments-redirect.js");
  else if (page === "console") await import("volley/console.js");
  else if (page === "login") await import("volley/login.js");
  rewriteLinks(document.body);
  document.documentElement.dataset.offlineReady = "true";
} catch (error) {
  console.error(error);
  const notice = document.createElement("p");
  notice.className = "validation-banner";
  notice.textContent = "页面启动失败。请使用新版 Chrome 或 Edge 打开此文件。";
  (document.querySelector("main") || document.body).prepend(notice);
}
`;

const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="Volley Record 排球记录工具离线单文件版，含计分、技术统计、二传分析与赛事管理" />
<link rel="author" href="${attribution.github}" />
<title>Volley Record · 离线版</title>
<link rel="icon" href="data:image/x-icon;base64,${icon}" />
<style>${css}\n${attributionStyles}</style>
<script type="application/json" id="offline-package-info">${json(metadata)}</script>
<script type="importmap">${json({ imports })}</script>
</head><body><noscript>请使用允许 JavaScript 的浏览器打开此文件。</noscript>
<script type="module">${bootstrap.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>
`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(`Offline HTML: ${relative(projectRoot, outputPath)} (${Buffer.byteLength(html)} bytes, ${Object.keys(imports).length} embedded modules)`);
