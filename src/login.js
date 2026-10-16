import { session, navigate } from "./session.js";
import { app, toast } from "./ui.js";
const requested = new URLSearchParams(location.search).get("return") || "/console/";
// Only allow known local routes; never execute a supplied URL or cross-origin return.
const safe = /^\/(console|record|tournaments)\/(?:\?[^#]*)?$/.test(requested) ? requested : "/console/";
const destination = `..${safe}`;
app.innerHTML = `<section class="console-login page-enter"><span class="eyebrow">LOCAL DEMO</span><h1>进入控制台</h1><p>先在这台设备上管理比赛、赛事和队伍。</p><div class="console-panel"><h2>本机演示身份</h2><p>当前还没有真实账号与云端数据库，无需填写密码。数据只保存于当前浏览器，进入演示不等于完成真实登录。</p><p>退出不删除记录；关闭标签页后需重新进入。请通过备份迁移到另一浏览器或离线 HTML。</p></div><button class="primary-button blue" id="enter-demo">进入本机控制台</button><a class="text-button" href="../record/">直接使用比赛记录工具 →</a></section>`;
document.querySelector("#enter-demo").onclick = async event => {
  event.target.disabled = true;
  try { await session.enterDemo(); navigate(destination); } catch { toast("浏览器未允许会话存储，请检查隐私设置。", "error"); event.target.disabled = false; }
};
