// 共享浏览器启动配置。
// Playwright 与 Chrome 的路径支持环境变量覆盖，便于在其他电脑或 CI 上运行；
// 未设置时回退到本机开发环境的默认路径。
//
//   PLAYWRIGHT_PATH  playwright 包的绝对路径（或指向其 index.js）
//   CHROME_PATH      Chrome/Chromium 可执行文件的绝对路径

import { createRequire } from "node:module";

const PLAYWRIGHT_PATH =
  process.env.PLAYWRIGHT_PATH ||
  "C:/Users/23183/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const require = createRequire(import.meta.url);

// 启动一个 headless Chrome 浏览器，返回 playwright Browser 实例。
// 可传入额外 launch 参数（会覆盖默认值）。
export function launchBrowser(options = {}) {
  const { chromium } = require(PLAYWRIGHT_PATH);
  return chromium.launch({ headless: true, executablePath: CHROME_PATH, ...options });
}
