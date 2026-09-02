# Volley Record 项目交接文档

> 文档日期：2026-08-29  
> 当前基线：本次 GitHub 推送后的 `main`
> 项目状态：可公开访问的前端原型，适合小规模试用，尚未按正式赛事生产系统标准验收

## 1. 项目概览

Volley Record 是一套排球电子记录与计分网站，目标是用数字化流程代替手写记录表。项目依据仓库内的纸质记录表和位置轮次表设计界面，并参考 FIVB 规则实现比赛流程、轮转、暂停、换人、自由人、判罚、纠错、局间交接和赛后汇总。

- GitHub：<https://github.com/sanmuyoulong/volleyball-record>
- 生产网站：<https://volleyball-record.vercel.app/>
- Sites 私有预览：<https://volley-record-oscar.berry-bread-6188.chatgpt.site/>
- 联系邮箱：`2318390047@qq.com`
- 当前仓库状态：按项目所有者要求使用私有仓库，未来可能公开和开源
- 当前部署：Vercel Hobby 通过 GitHub `main` 自动部署；Sites 用于私有预览和持续发布

项目的定位目前仍是“可运行、可演示、可小规模试用的专业原型”，不应直接宣称为 FIVB 官方认证系统。

### 1.1 产品目标与市场切入

长期目标是把 Volley Record 发展为面向高校、俱乐部和业余赛事组织者的排球赛事管理平台，覆盖赛前组织、赛中专业记录、实时公开比分、赛后排名与赛事归档。现有单场电子记录台是平台的核心规则引擎，而不是最终产品的全部。

第一阶段不追求覆盖所有运动或堆叠所有赛事功能，而是先完成一届 4–8 支球队的小型排球赛事闭环：

1. 创建赛事。
2. 添加球队并导入名单。
3. 生成循环赛或单淘汰赛程。
4. 分配管理员、记录员和只读观众权限。
5. 从比赛列表进入现有专业电子记录台。
6. 通过公开链接查看实时比分。
7. 自动计算积分、排名和晋级结果。
8. 导出并归档整届赛事资料。

首要目标用户是高校院系联赛、校级比赛、城市业余联赛、排球俱乐部和基层赛事执行团队。产品差异化应保持为“无需专用硬件、浏览器直接使用、具备接近正式记录表的规则深度，并能在场馆网络不稳定时可靠记录”。一站式平台是长期方向，近期评价标准是能否让一个真实组织者完整办完一届小型赛事并愿意再次使用或付费。

在赛事管理闭环和真实付费意愿得到验证前，暂不优先开发在线报名收费、社交社区、AI 分析、视频直播、专用硬件、多人同时修改同一场比赛、其他运动项目或复杂智能排程。第一版多人体验应采用“一台主记录设备写入，其他设备实时只读”，降低比赛事实冲突和现场风险。

## 2. 需求与参考材料

仓库根目录包含两份核心参考材料：

- `assets/记录表.pdf`：第一页是比赛记录表，第二页是使用方法及相关规则。
- `assets/中文位置表.pdf`：每局开始前提交的双方位置轮次表。

规则资料：

- FIVB 2025–2028 Official Volleyball Rules：<https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf>
- FIVB 2026 指定赛事规则试行说明：<https://www.fivb.com/fivb-board-of-administration-approves-rule-tests-for-2026-competitions/>

当前首页提供两个比赛配置：

| 配置 | 普通换人上限 | 适用范围 |
| --- | ---: | --- |
| FIVB 2025–2028 正式基线 | 每队每局 6 次 | 普通正式室内排球比赛 |
| FIVB 2026 指定国际赛事试行 | 每队每局 8 次 | VNL、U17 世锦赛和洲际锦标赛等指定测试赛事 |

两种配置共用同一套电子记录表样式。纸质记录表不再作为一个单独的规则版本。

## 3. 当前用户流程

1. 首页选择规则配置。
2. 填写比赛名称、日期、计划时间、场馆、场次编号和三局两胜/五局三胜。
3. 填写或导入双方球队名称、号码、队员姓名、自由人、队长和主教练。
4. 填写裁判员、记录员和司线员信息。
5. 填写第一局双方 I–VI 号位并选择首先发球队伍。
6. 进入计分页，通过加分、减分、暂停、换人、自由人和判罚按钮记录比赛。
7. 每局结束后填写下一局位置轮次表，计分栏保留此前各局比分。
8. 达到胜局数后完成赛后核对、结束时间和备注确认。
9. 导出完整比赛 JSON，或通过浏览器打印对话框保存完整比赛 PDF。

首页另有“联系与反馈”入口，显示项目邮箱并通过 `mailto:` 唤起用户设备的默认邮件客户端。

## 4. 已实现功能

### 4.1 赛前设置

- 四步赛前信息向导。
- 三局两胜和五局三胜选择。
- 双方最多 14 人名单、队长、主教练和最多 2 名自由人。
- CSV 与 `.xlsx` 名单导入、预览和校验。
- CSV 模板下载。
- 双方首发位置轮次与首先发球队伍校验。
- 可载入完整样例比赛。

### 4.2 比赛控制

- 得分与发球权联动。
- 获得发球权时自动完成六轮轮转。
- 普通局 25 分、决胜局 15 分，均需领先 2 分。
- 三局两胜第三局、五局三胜第五局自动使用决胜局逻辑。
- 决胜局领先队达到 8 分时记录交换场区。
- 每队每局 2 次、每次 30 秒的暂停倒计时。
- 普通换人次数、场上/场下名单、换人配对和回换校验。
- 自由人后排资格、对应常规球员、回合间隔、第二自由人切换、必须离场提醒和重新指定。
- 不当请求、延误、行为警告、罚分、驱逐和取消比赛资格记录。
- 判罚得分自动进入比分和纸质记录表视图。

### 4.3 记录、纠错与恢复

- 比分、位置轮次、发球轮次、暂停、换人、自由人和判罚自动写入电子记录表。
- 减分只允许撤销最后一次符合条件的普通得分。
- 操作日志最多保留 250 条。
- 纠错只能撤销最近一个有效可逆操作，并要求填写原因。
- 最近 5 个关键恢复快照保存在浏览器本地。
- 完整比赛 JSON 导出与导入。
- 比赛结束前提供记录员、双方队长和裁判员确认流程。
- 比赛正式结束前仍可返回并纠正最后一次有效操作。

### 4.4 展示与导出

- 实时总局分、当前比分、发球队员和历史局比分。
- 双方完整名单、号码、主教练及当前查看局的轮次表。
- 比赛概览页和每局一页的 A4 横向打印布局。
- “导出完整比赛 PDF”实际调用浏览器打印功能，用户需选择“另存为 PDF”。
- 页面根节点在规则切换、赛前步骤切换和计分操作中保持稳定，入场动画只在真正切换页面时播放。
- 桌面和移动端响应式布局。

### 4.5 赛事管理（MVP）

赛事管理为赛前组织与赛后归档闭环，独立于记分核心，记分逻辑对赛事完全无感知：

- 创建赛事（名称、地点、开始日期、备注）。
- 录入队伍：用「队伍数量」（2–32）一次生成对应数量的队伍行，再填写每队名称与分组（1–8 组）；在队伍行内同步录入该队名单（号码 / 姓名 / 自由人）。不再提供「赛制」下拉与自动排程。
- 创建比赛：在赛事详情点「新建比赛」，弹窗选择主队与客队，双方名单一并带入记录页；进入比赛落在赛前设置向导（`screen="setup"`，两队已预填），无需手动建队。
- 对阵图（bracket）功能已移除：不再按赛制自动生成 fixture / 对阵图。
- 小组积分表：按排球规则排名（胜场 → 局胜率 → 小分胜率），按分组分表；无已记录比赛时显示提示文案。
- 比赛记录回流：每场记分通过 `syncActiveMatch()` 把赛果写回所属赛事的比赛列表摘要（队名、`局分 x : y`、状态），积分表实时更新。
- 删除：删除单场比赛（「比赛」列表里的删除按钮，应用内确认弹窗生效）会一并清理其归档；删除赛事会连带清理其下全部比赛归档。

纯函数引擎位于 `src/tournament-rules.js`（`computeStandings` 积分计算、`resultFromMatch` 赛果推导），与 `rules.js` 同一定位，可独立单测；`generateSchedule` 赛程生成已随对阵图移除。

## 5. 技术架构

项目是无框架、无打包器、无运行时第三方依赖的静态前端：

| 文件 / 目录 | 职责 |
| --- | --- |
| `index.html` | 平台介绍首页与功能导航，链接到各独立功能页 |
| `record/index.html` | 比赛记分入口、赛前设置与计分页模板，引用 `../src/app.js` |
| `tournaments/index.html` | 赛事管理独立栏目页（列表、创建、详情、赛制/队伍/对阵图/积分表），引用 `../src/tournaments.js` |
| `styles.css` | 全部界面、响应式和打印样式（根目录） |
| `src/` | 前端 ES 模块：`app.js` 引导入口；`state.js` 数据层；`audit.js` 审计；`ui.js` DOM 工具；`logic.js` 比赛业务 mutation；`render.js` 渲染与弹窗；`rules.js` 规则纯函数；`roster-import.js` 名单解析；`tournament-rules.js` 赛事纯函数引擎（赛程/积分/赛果）；`tournaments.js` 赛事管理页面 |
| `assets/` | 静态资源：`favicon.ico`、参考 PDF（记录表.pdf / 中文位置表.pdf）、示例截图 |
| `server.mjs` | 本地静态文件服务器，默认端口 `4173` |
| `tests/` | Node 单元测试（引用 `../src/rules.js`、`../src/roster-import.js`） |
| `scripts/` | Chrome 端到端、视觉流程、PDF、名单导入和赛后确认检查 |
| `.openai/hosting.json` / `scripts/build-sites.mjs` | Sites 项目标识与生产构建适配；`dist/` 为忽略的构建产物 |

### 5.1 目录布局与分层设计

项目采用「多页面入口 + 源码/资源分层」结构，目的是为后续增加独立功能模块建立清晰边界，同时保留零运行时依赖的静态前端特性。

```text
volleyball-record/
├── index.html            # 平台介绍首页与多功能导航
├── record/index.html     # 独立比赛记分页面，引用 ../src/app.js
├── tournaments/index.html # 赛事管理页面（列表与详情），引用 ../src/tournaments.js
├── styles.css            # 全部界面、响应式、打印样式
├── server.mjs            # 本地静态服务器，默认端口 4173
├── package.json          # 开发、测试与 Sites 生产构建脚本
├── .openai/hosting.json  # Sites 项目标识
├── HANDOFF.md / README.md
├── src/                  # 前端 ES 模块（同目录相对引用 ./xxx.js）
│   ├── app.js            # 引导入口：根节点监听 + 启动 render()
│   ├── state.js          # 数据层：状态/存储/初始化·恢复·归一化/保存/快照
│   ├── audit.js          # 审计：可逆操作栈（latestReversibleAction/recordAuditAction/reverseLatestAction）
│   ├── ui.js             # DOM 工具：根节点 + escapeHTML/toast/showValidation
│   ├── logic.js          # 业务：改变比赛事实的 mutation（得分/换人/制裁/轮转…）
│   ├── render.js         # 渲染：三屏调度/模板/事件绑定/弹窗/导出
│   ├── rules.js          # 规则纯函数（可独立测试）
│   ├── roster-import.js  # CSV/XLSX 名单解析
│   └── tournaments.js    # 赛事管理页面：赛事列表/创建/详情与比赛增删
├── assets/               # 静态资源（favicon + 参考 PDF + 示例图）
│   ├── favicon.ico
│   ├── 记录表.pdf  中文位置表.pdf
│   └── sample-page.png  rules-selection.png
├── tests/                # Node 单元测试，引用 ../src/rules.js、../src/roster-import.js
├── scripts/              # 浏览器端到端（_browser.mjs 统一启动，截图默认落 assets/）
├── dist/  output/  tmp/  # 构建/生成产物，已 gitignore
└── .workbuddy/           # 本地记忆（绝不提交，见第 17 节维护原则）
```

分层约束与迁移要点：

1. 模块之间一律使用 `./xxx.js` 同目录相对引用；比赛应用由 `record/index.html` 通过 `../src/app.js` 启动，测试引用 `../src/*`，浏览器脚本默认访问 `/record/`。
2. 模块依赖方向：`state.js` / `audit.js` / `ui.js` 是叶子（无内部依赖）；`logic.js` 依赖这三个；`render.js` 同时依赖 `logic.js` 与 `state.js`。`render.js` ↔ `logic.js` 存在双向调用（渲染触发业务、业务回调重渲染），采用 ESM 循环导入 + 运行时调用，链接期安全。
3. 测试只依赖 `rules.js` / `roster-import.js` 的纯函数，不引用 `app.js` 内部符号，拆分不会破坏单测。
4. 部署：Sites 使用 `npm run build` 生成 Cloudflare Worker 兼容的 `dist/`；Vercel 仍可直接托管源目录中的静态文件。前端无运行时第三方依赖。
5. 本地记忆目录 `.workbuddy/` 由本机生成、含个人工作日志，按约定绝不提交；提交时显式 `git add <明确文件>`，不使用 `git add -A`。
6. 赛事管理页面（`tournaments/index.html` + `src/tournaments.js`）只依赖 `state.js` 的数据层原语，不加载记分应用；进入比赛一律通过跳转 `/record/?match=<id>` 完成，因此记分逻辑对赛事的存在无感知。

页面状态由 `state.screen` 控制：

- `landing`：规则选择和联系入口。
- `setup`：四步赛前信息向导。
- `score`：比赛操作和记录表。

`#app` 承载页面内容，`#modal-root` 承载弹窗，`#toast-root` 承载短时提示。同一屏幕内采用局部更新，避免重复创建带入场动画的页面根节点。

## 6. 状态与数据模型

当前没有服务器数据库，所有比赛数据只保存在用户当前浏览器：

- 主状态键：`volley-record-state-v1`（始终代表"当前正在记录的这一场"）
- 恢复快照键：`volley-record-recovery-v1`
- 赛事索引键：`volley-record-tournaments-v1`
- 活动比赛槽：`volley-record-active-match-v1`
- 比赛归档键：`volley-record-match-<matchId>`

顶层状态主要包括：

- `competitionProfile`：`official` 或 `test2026`。
- `meta`：比赛名称、日期、时间、场馆、场次和赛制。
- `teams`：双方球队、教练、队长和名单。
- `officials`：裁判组和记录员。
- `firstLineups` / `firstServer`：第一局位置与发球信息。
- `match`：胜局、局记录、判罚、自由人控制、审计日志和赛后确认。
- `viewSetIndex`：当前在记录表中查看的局。
- `matchId` / `tournamentId`：当前比赛的归属；两者为 `null` 时表示一场不归属任何赛事的独立比赛。

每局 `set` 主要保存：

- `score`、`lineups`、`onCourt`。
- `firstServer`、`servingTeam`、`rotationIndex`、`serviceRounds`。
- `timeouts`、`substitutions`、`subPairs`、`subCount`。
- `liberoState`、`liberoReplacements`。
- `sanctions`、`rallies`、`events`。
- `courtChanged`、`ended`、`winner` 和局起止时间。

修改数据结构时必须同时更新：

1. `initialState()` 或 `createSet()` 的默认值。
2. `normalizeState()` 的旧数据兼容逻辑。
3. JSON 导入/导出和恢复快照测试。
4. 对应的渲染与打印代码。

### 6.1 赛事与比赛归属

赛事只是比赛的容器，不参与任何记分规则。采用「活动槽 + 归档」模型：

- 赛事索引 `volley-record-tournaments-v1`：数组，每项为 `{ id, name, venue, startDate, note, createdAt, matches[] }`。
- `matches[]` 只保存摘要 `{ id, teamA, teamB, scoreText, status, updatedAt }`，不保存完整比赛数据。
- 每场比赛的完整数据归档在 `volley-record-match-<matchId>`，由 `state.js` 的 `syncActiveMatch()` 在每次 `saveState()` 时写入，并刷新所属赛事里的摘要。
- `state.matchId` / `state.tournamentId` 记录归属；两者为 `null` 即独立比赛，行为与赛事功能上线前完全一致，旧数据无需迁移。

关键约束：

1. 切换或新建比赛前必须先归档当前活动槽里的比赛（`src/tournaments.js` 的 `archiveCurrentMatch()`），否则未归档的进度会丢。
2. 从 JSON 导入比赛时必须清空 `matchId` / `tournamentId` 并清除活动槽，否则导入的数据会写回原比赛归档、覆盖真实记录。
3. 恢复快照**不**清空归属（快照本来就属于当前这场比赛）。
4. 同一时刻只有一个活动比赛，符合实际使用场景：一次只记录一场比赛。

## 7. 关键规则实现说明

- `setTarget()`：比赛的最后可能局为 15 分，其他局为 25 分。
- `isSetComplete()`：达到目标分且分差至少为 2。
- `isMatchComplete()`：一方达到 `setsToWin`。
- `rotateServiceIndex()`：使用 `(index + 1) % 6` 轮转。
- `courtPositionForIndex()`：根据当前轮转下标换算实际 I–VI 号位。
- `validateLineup()`：检查六人完整、无重复且均在名单内。
- `COMPETITION_PROFILES`：控制每局普通换人上限。

加分时需同时维护比分、回合、发球权、轮转、发球轮次、事件日志和局结束判断。任何新增比赛操作都应遵循以下顺序：

1. 在修改前获取 `matchSnapshot()`。
2. 原子性修改比赛状态。
3. 调用 `recordAuditAction()` 写入类型、标签和必要元数据。
4. 重新渲染并保存。
5. 为正常流程和纠错流程补充测试。

规则逻辑在正式赛事使用前应由熟悉 FIVB 记录工作的裁判员或记录员逐项验收，尤其是特殊换人、自由人重新指定、行为判罚、球队不完整和异常比赛结束等边界情况。

## 8. 本地运行

要求：

- Node.js 18 或更高版本。
- 端到端测试默认使用 Windows 上的 Google Chrome。

启动：

```powershell
npm run dev
```

访问：

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/record/
```

项目没有运行时第三方依赖。`server.mjs` 用于本地预览；`npm run build` 生成 Sites 部署产物；Vercel 仍可直接托管源目录中的静态文件。

## 9. 测试与验证

### 9.1 单元测试

```powershell
npm test
```

覆盖规则胜负判定、决胜局、轮转、轮次校验、自由人资格、名单导入，以及赛事积分计算和赛果推导。当前预期为 15 项通过（对阵图赛程生成相关测试已随功能移除）。

### 9.2 浏览器流程测试

先保持本地服务器运行，再打开另一个终端执行：

```powershell
node scripts/setup-flow-test-valid.mjs
node scripts/visual-test-chrome.mjs sample-page.png
npm run test:advanced
npm run test:import-end
npm run test:pdf
node scripts/tournament-features-check.mjs
node scripts/tournament-delete-check.mjs
node scripts/tournament-record-sync-check.mjs
node scripts/tournament-teams-edit-check.mjs
node scripts/tournament-flow-check.mjs
```

重点覆盖：

- 正式规则和三局两胜赛前流程。
- 页面根节点稳定性，避免操作时出现“假刷新”。
- 加减分、暂停、换人、局间轮次和历史比分。
- 自由人、判罚、审计纠错、JSON 恢复和自动快照。
- CSV/XLSX 导入、比赛结束确认和打印 PDF。
- 赛事：创建 → 队伍数量 + 名单录入（含分组）→ 选两队新建比赛带入名单 → 积分表渲染（无对阵图）。
- 赛事：删除比赛（应用内确认弹窗生效）与删除赛事（连带清理比赛归档）。
- 赛事：选两队建比赛记录并打完 3-0 → 比赛列表摘要显示队名与局分、积分表按排球规则排名。

浏览器脚本统一通过 `scripts/_browser.mjs` 的 `launchBrowser()` 启动，Playwright 与 Chrome 路径支持环境变量覆盖：

- `PLAYWRIGHT_PATH`：playwright 包的绝对路径。
- `CHROME_PATH`：Chrome/Chromium 可执行文件的绝对路径。

未设置时回退到本机开发环境的默认路径，因此换电脑或接 CI 时只需设置这两个环境变量即可，无需改动脚本。

## 10. 打印与 PDF

`exportFullMatchPDF()` 会临时创建 `#print-document`，内容包括：

1. 比赛概览页。
2. 所有已创建局的完整记录表。

随后调用 `window.print()`。浏览器打印设置建议：

- 目标：另存为 PDF。
- 方向：横向。
- 纸张：A4。
- 缩放：默认或适合页面。
- 打开背景图形，关闭浏览器页眉页脚。

当前不是服务器直接生成二进制 PDF，因此不同浏览器的打印结果可能略有差异。主要验收环境为桌面版 Chrome。

## 11. GitHub 与 Vercel 部署

远端仓库：

```text
origin  https://github.com/sanmuyoulong/volleyball-record.git
```

生产部署配置：

- Framework Preset：`Other`
- Root Directory：`./`
- Build Command：空
- Output Directory：`.` 或默认根目录
- Environment Variables：无
- Production Branch：`main`

日常发布流程：

```powershell
git status --short --branch
git diff --check
npm test
git add <明确的文件列表>
git commit -m "描述本次修改"
git push origin main
```

推送 `main` 后，Vercel 自动创建生产部署并更新固定地址。其他分支通常只创建预览部署。部署失败时应先查看 Vercel 的 Deployments 日志；不要在没有验证的情况下反复 Redeploy。

## 12. 安全、隐私与数据责任

- 当前无账户系统，也没有后端上传行为。
- 名单、裁判姓名、比赛记录和恢复快照保存在本机浏览器 `localStorage`。
- CSV/XLSX 在浏览器本地解析，不上传服务器。
- 清理浏览器数据或更换设备会丢失本地比赛，应在重要比赛中定期导出 JSON。
- 项目邮箱已按所有者要求公开展示，可能收到垃圾邮件。
- 禁止把密码、API Key、私人令牌或真实生产环境机密写入仓库。
- 如果未来加入云数据库，应先定义隐私政策、数据保留周期、删除机制、访问角色和传输加密。

## 13. 已知限制

1. 没有登录、比赛所有权和角色权限。
2. 没有云端数据库、跨设备同步或多人实时协作。
3. 没有离线 PWA 和断网后的可靠同步策略。
4. “赛后确认”是流程记录，不是真正的电子签名或身份认证。
5. 只能撤销最近一个有效可逆操作，不能任意编辑历史事件。
6. 支持 `.xlsx` 和 CSV，不支持旧版 `.xls`。
7. PDF 依赖浏览器打印，不是后端生成文件。
8. 主要在 Windows Chrome 验证，Safari、Firefox、iPad 和不同打印机尚未系统验收。
9. 当前规则实现尚未由赛事官方或专业裁判完成正式认证。
10. Vercel Hobby 面向个人、非商业项目；公开商业运营前应重新确认计划和条款。

## 14. 推荐后续路线

### P0：正式试用前

- 邀请专业记录员按真实比赛逐球验收，并形成差异清单。
- 补齐特殊换人、球队不完整、受伤、驱逐和异常中止等规则测试。
- 增加“比赛开始前最终确认”和关键操作防误触。
- 为本地数据增加版本号、迁移策略和显著的备份提醒。
- 在目标平板、手机、浏览器和实际打印机上完成矩阵测试。
- 已将 Chrome 和 Playwright 路径改为环境变量可配置（`scripts/_browser.mjs`），下一步接入 CI。

### P1：赛事管理最小闭环

- 建立用户、组织、赛事、球队、成员、比赛和赛事阶段的数据模型。
- 支持创建赛事、导入球队名单，以及 4–8 支球队的循环赛和单淘汰赛程。
- 增加赛事管理员、主记录员、裁判员和只读观众角色，并按赛事与比赛控制权限。
- 将现有单场记录状态改为按 `matchId` 载入和保存，使比赛列表可直接进入记录台。
- 接入云端数据库和只追加事件日志，同时保留本机缓存、断线记录和恢复同步能力。
- 为每场比赛提供无需登录的只读实时比分链接，并自动汇总赛事积分、排名和晋级结果。
- 支持导出整届赛事的赛程、比赛记录、结果和归档资料。
- 以一届真实 4–8 队赛事完整跑通作为本阶段验收标准。

### P2：多人协作与收费运营

- 第一阶段采用“一台主记录设备写入，其他设备实时只读”；稳定后再评估双设备写入和冲突处理。
- 加入在线状态、自动重连、幂等操作、版本号和服务端权威状态。
- 增加可验证的电子签名、比赛封存和导出校验值。
- 服务端生成 PDF，确保跨设备版式一致。
- 在真实赛事验证复用意愿后，再加入免费版、单届赛事版和组织订阅版。
- 在线支付、自动续费、退款和发票流程应在经营主体、备案与支付合规路径确认后实施。

### P3：开源与产品化

- 选择并添加开源许可证。
- 增加 `CONTRIBUTING.md`、Issue 模板、安全政策和版本发布说明。
- 增加无障碍、键盘操作、多语言和更完整的移动端体验。
- 建立规则版本号和规则变更记录，避免旧比赛被新规则静默改变。

## 15. 常见修改入口

- 修改规则参数：`src/rules.js` 中的 `RULESETS` 和 `COMPETITION_PROFILES`。
- 修改平台首页：`index.html`；修改比赛入口：`record/index.html`。
- 修改比赛状态：`src/state.js` 中的 `initialState()`、`normalizeState()`、`createSet()`。
- 新增比赛操作：`src/render.js` 的事件绑定与 `src/logic.js` 的业务函数，并加入审计快照。
- 修改记录表、打印封面和打印行为：`src/render.js` 与 `styles.css`。
- 修改名单导入：`src/roster-import.js` 的表头别名、解析和归一化逻辑。
- 修改联系信息：`src/state.js` 中的 `CONTACT_EMAIL` 和 `src/render.js` 中的 `openContactModal()`。

## 16. 交接验收清单

接手人应至少完成以下操作：

- [ ] 本地启动网站并进入首页。
- [ ] 完成一次空白三局两胜赛前流程。
- [ ] 载入样例比赛并测试加分、减分、暂停和换人。
- [ ] 完成一局并填写下一局位置轮次表。
- [ ] 导出 JSON，再从 JSON 恢复。
- [ ] 打开审计日志并完成一次带原因的纠错。
- [ ] 导出完整比赛 PDF并检查分页。
- [ ] 运行全部单元测试和浏览器流程测试。
- [ ] 推送一个测试提交，确认 Vercel 自动部署。
- [ ] 阅读两份参考 PDF，并由懂规则的人员确认关键记录方法。

## 17. 维护原则

- 规则正确性优先于界面便利性。
- 所有会改变比赛事实的操作都必须可追踪。
- 新字段必须考虑旧本地数据和旧 JSON 的兼容。
- 不要因为局部功能修改而重新创建整个页面根节点。
- 不要覆盖无关的工作区修改；提交时显式列出文件。
- 正式比赛前必须保留 JSON 和 PDF 双份备份。
