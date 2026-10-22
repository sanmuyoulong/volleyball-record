// 网站与离线文件共用同一份声明；比赛数据不参与生成声明。
export const LEGAL_VERSION = "2026-10-22";
export const PROJECT_URL = "https://github.com/sanmuyoulong/volleyball-record";
export const LEGAL_SECTIONS = [
  ["服务性质与赛事使用", "Volley Record 是独立提供的排球计分、技术统计及赛事管理辅助工具，当前版本免费使用。个人、学校、球队、俱乐部及赛事组织者可用于训练和实际比赛，包括具有商业性质的赛事；允许在自有设备或内部环境中运行。本项目与 FIVB、中国排球协会及其他规则发布机构无隶属、认证或背书关系。正式记录与判罚应以赛事规程及裁判组确认结果为准。"],
  ["源码、复制与转售", "源码公开供学习、研究和内部修改使用；可原样免费分享官方离线 HTML，并保留本声明及项目来源。未经项目权利人另行书面授权，不得将本软件或基于其受保护代码、界面制作的副本包装转售、作为付费软件分发，或对外部署同类服务平台（包括免费复制站点及收费平台），也不得冒称官方产品。依法享有的权利及第三方有效许可不受本条限制。此为附有用途限制的源码公开许可，不属于 OSI 定义的开源许可。"],
  ["比赛数据与报告", "上述软件复制与运营限制不限制您正常使用、打印、发布或交付自己合法录入的比赛数据及生成的报表，也不要求您为实际比赛或报表使用另行购买软件授权。您对相关内容依法享有的权益不因使用本工具而转移。请在有合法依据的范围内录入和分享队员、裁判等人员信息；导出资料可能含姓名等个人信息，分享前请核对权限。"],
  ["本机保存与网络访问", "当前应用将比赛记录、导入名单和控制台资料保存在本机浏览器的 localStorage / IndexedDB，不自动上传这些内容，也未提供真实账号或云端备份。网站访问、在线视频及外部链接可能连接托管方或其他第三方服务，并产生相应访问日志。离线文件在不访问外部链接时可断网运行。请及时导出 JSON 备份；清理浏览器、无痕模式或更换设备、站点及文件位置可能导致无法读取原记录。"],
  ["第三方权利", "排球规则事实、通用表格和数学公式不因本声明成为本项目专有内容。规则原文、具有独创性的版式、图片、标识、音视频及第三方组件的权利和许可由其各自权利人享有或另行规定；本声明不授予这些第三方内容的额外权利。引用来源或注明版权不等于已经取得授权。如对本项目内容有权利疑问，请通过项目仓库联系维护者。"],
  ["使用边界与责任", "本工具按当前状态提供，不保证无错误、持续可用或适配所有赛事。分析报告仅反映已录入的数据，可能受漏记、误记和规则配置影响；请复核比分、名单和统计，并保留必要备份。上述说明不排除或限制法律规定不得排除的责任，也不减免另行约定的付费服务义务。"],
  ["未来收费与版本", "未来可能另行提供云同步、多设备协作、机构管理、部署维护或定制等收费服务，具体功能、价格、数据处理方式和服务责任将在启用前另行说明，付费服务由用户另行选择。当前未开通这些收费服务；本声明不承诺未来所有版本永久免费。后续收费不自动改变已合法取得的本版本许可，也不撤销此前依法取得的其他许可。"]
];

export function legalNoticeHTML() {
  return `<div class="legal-summary"><span>© 2026 Volley Record · 当前版本免费用于比赛记录</span><a href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer">源码与项目仓库</a></div><details id="usage-copyright"><summary>使用与版权声明 <small>复制转售、对外部署须另行授权</small></summary><div class="legal-content"><p class="legal-version">适用于网站与官方离线版 · 版本 ${LEGAL_VERSION}</p>${LEGAL_SECTIONS.map(([title, body]) => `<section><h2>${title}</h2><p>${body}</p></section>`).join("")}<p><a href="${PROJECT_URL}/blob/main/LICENSE.md" target="_blank" rel="noopener noreferrer">项目许可全文</a> · <a href="${PROJECT_URL}/issues" target="_blank" rel="noopener noreferrer">授权咨询与权利反馈</a></p></div></details><p class="legal-print-note">Volley Record · 非官方辅助工具，记录请复核 · 比赛数据与报表可正常使用，软件复制转售须授权 · 源码与许可：github.com/sanmuyoulong/volleyball-record</p>`;
}

export function mountLegalNotice() {
  if (document.querySelector("#legal-notice")) return;
  const footer = document.createElement("footer");
  footer.id = "legal-notice";
  footer.className = "legal-notice";
  footer.setAttribute("aria-label", "使用与版权声明");
  footer.innerHTML = legalNoticeHTML();
  document.body.append(footer);
  const openFromHash = () => { if (location.hash === "#usage-copyright") footer.querySelector("details").open = true; };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
}

if (typeof document !== "undefined") mountLegalNotice();
