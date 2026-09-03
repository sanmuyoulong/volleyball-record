# 微信小程序版 · 交接文档

> 面向即将基于本仓库实现**微信小程序版本**的开发者。本文档交代现有网页版（H5）的架构、数据模型、领域规则，并明确**哪些代码可直接复用、哪些必须重写**，以及浏览器 API 到小程序 API 的映射。
>
> 一句话结论：**数据层与规则引擎（纯 JS）可以几乎原样复用；渲染层（DOM）要整体重写为 WXML/WXSS；所有浏览器专属 API（localStorage / confirm / FileReader / window.print / DOMParser / DecompressionStream）要替换成 wx 对应能力。**

---

## 1. 项目概览

Volley Record 是一套遵循 FIVB 纸质记录表工作流的**排球电子记分工具**，覆盖赛前名单、位置轮次、发球轮转、得分划记、暂停、换人、自由人控制、判罚、局间交接与赛后汇总。

- 现状：**纯静态前端**（HTML + CSS + ES 模块），零构建、零运行时第三方依赖，`localStorage` 持久化。
- 三个页面入口：
  - `/` —— 平台首页（导航 + 模块卡片）
  - `/record/` —— 比赛记分（落地页 / 赛前设置 / 记分页 三屏状态机）
  - `/tournaments/` —— 赛事管理（MVP：队伍数量 + 名单录入、选两队建比赛、小组积分表；对阵图已移除）

---

## 2. 架构与文件结构

源码在 `src/`，全部为 ES 模块（`./xxx.js` 相对引用）。职责划分：

| 文件 | 职责 | 小程序版处理 |
|---|---|---|
| `app.js` | 引导入口：装配模块、`?match=` 载入归档、测试钩子 `window.__volley` | 重写为小程序 `app.js` |
| `state.js` | 数据层：状态 schema、localStorage 读写、`normalizeState`、`matchSummary`、`syncActiveMatch`、`createSet` | **逻辑复用**，仅 `localStorage` → `wx.*Storage*` |
| `rules.js` | 规则纯函数（无 DOM/存储依赖） | **整文件直接复用** |
| `tournament-rules.js` | 赛事纯函数：`resultFromMatch`、`computeStandings` | **整文件直接复用** |
| `roster-import.js` | 名单解析：CSV/TSV 分割、XLSX 解压+XML、表头识别、行归一化 | 纯函数部分复用；文件读取与 XLSX 解压重写 |
| `audit.js` | 审计日志：记录每次改变比赛事实的操作、撤销最近一次有效操作 | 逻辑复用（依赖 state 单例，需轻量改造） |
| `logic.js` | 业务 mutation：得分/撤销/结束局/暂停/换人/自由人/判罚/开始比赛等 | **核心逻辑复用**，仅 `render()`/`toast()`/`saveState()` 副作用需替换 |
| `render.js` | 渲染调度、三屏模板、导出、弹窗 | **整体重写**为 WXML/WXSS |
| `ui.js` | DOM 工具：`escapeHTML`/`toast`/`showValidation`/`safeFilename`/`confirmDialog` | `escapeHTML`/`safeFilename` 复用；其余用 `wx.showToast`/`wx.showModal` 替代 |

依赖方向：`rules.js` / `roster-import.js` 是纯函数叶子；`state.js` 是数据中枢；`logic.js` 改状态并触发 `render`；`render.js` 与 `logic.js` 存在 ESM 循环导入（运行时调用安全）。小程序重写时可借机打破这层循环依赖（用事件或回调替代）。

---

## 3. 数据模型（关键，务必保持一致）

### 3.1 存储键（localStorage → wx.storage 一一对应）

| 键 | 含义 |
|---|---|
| `volley-record-state-v1` | 当前正在记的那一场（完整 state 对象） |
| `volley-record-recovery-v1` | 最近 5 个关键状态恢复快照 |
| `volley-record-tournaments-v1` | 赛事索引数组（每项含 `matches[]` 摘要） |
| `volley-record-active-match-v1` | 活动槽 `{ matchId, tournamentId }` |
| `volley-record-match-<matchId>` | 每场比赛的完整归档 |

> 小程序 `wx.setStorageSync` 单 key 上限 1MB、总容量 10MB，本项目的 JSON 规模远低于上限，键名可原样沿用。

### 3.2 顶层 state（`initialState()` 完整结构）

```js
{
  screen: "record" | "setup" | "score",   // 三屏状态机
  selectedRule: "modern",
  setupStep: 1 | 2 | 3 | 4,               // 赛前四步向导
  tournamentId: string | null,            // 归属赛事（null = 独立比赛）
  matchId: string | null,
  competitionProfile: "official" | "test2026",
  meta: {
    competition, date, scheduledTime, venue, city, matchNo,
    category: "成年组", gender: "男子", matchFormat: "3" | "5"
  },
  teams: [ { name, coach, captain, roster }, { name, coach, captain, roster } ],
  officials: { firstReferee, secondReferee, scorer, assistantScorer, lineJudge1, lineJudge2 },
  firstLineups: [ [6 个号码], [6 个号码] ],
  firstServer: 0 | 1,
  match: <match 对象 | null>,             // 未开始为 null
  viewSetIndex: number
}
```

### 3.3 roster / 球员

```js
roster = [ { number: string, name: string, libero: boolean } ]  // 6–14 人，自由人 ≤2
```

### 3.4 match 对象（`startMatch()` 创建）

```js
match = {
  startedAt, endedAt, maxSets, setsToWin,
  setsWon: [0, 0],
  sanctions: [], improperRequests: [0, 0], delayWarnings: [false, false],
  liberoControl: [ { unavailable: [], redesignations: [] }, { ... } ],
  auditLog: [],          // 审计日志，见第 4.3
  sets: [ set ], currentSetIndex, undoStack,
  endingPending, endConfirmation, ended
}
```

### 3.5 set 对象（`createSet()` 创建）

```js
set = {
  number, startTime, endTime,
  score: [0, 0],          // 每队比分
  lineups, onCourt,       // 首发/场上 6 个号码（按位置）
  firstServer, servingTeam,
  rotationIndex: [0, 0],  // 发球轮转位
  serviceRounds: [[...], [...]],   // 发球轮次记录
  timeouts: [[], []], substitutions: [[], []],
  liberoReplacements: [[], []], liberoState, sanctions,
  subCount: [0, 0], subPairs: [{}, {}],
  rallies, events, courtChanged,
  ended, winner           // winner: 0 | 1 | null
}
```

### 3.6 赛事对象

```js
tournament = {
  id, name, venue, startDate, note, createdAt,
  matches: [ matchSummary ],   // 摘要，见下
  groups: 1..8,
  teams: [ team ]
}
team = { id, name, group: 0..7, coach, captain, roster }

matchSummary = {
  id, teamA, teamB, scoreText, status, updatedAt,
  result: { winnerTeamId, homeTeamId, awayTeamId, homeSets, awaySets, homePoints, awayPoints }
}
```

> `syncActiveMatch()`（在每次 `saveState()` 末尾调用）会把当前比赛的摘要 + `result` 写回所属赛事的 `matches[]`。积分表只统计 `result.winnerTeamId` 已存在（即已决出胜方）的比赛。

---

## 4. 领域规则引擎（可直接复用的核心）

### 4.1 `rules.js`（纯函数，零依赖，**整文件搬走即可**）

| 函数 | 作用 |
|---|---|
| `RULESETS` / `COMPETITION_PROFILES` | 规则常量：名单 6–14 人、自由人 ≤2、每局暂停 2 次 30 秒、换人 6 次（official）/ 8 次（test2026） |
| `setTarget(n, maxSets)` | 决胜局 15 分、其余 25 分 |
| `isSetComplete(a, b, n, maxSets)` | 达到目标分且领先 ≥2 |
| `isMatchComplete(setsWon, setsToWin)` | 先拿 setsToWin 局者胜 |
| `rotateServiceIndex(i)` / `servicePlayer(lineup, i)` | 轮转 |
| `courtPositionForIndex` / `isBackRowCourtIndex` | 场上位置与后排判定 |
| `canMakeLiberoReplacement` | 自由人替换的回合间隔限制 |
| `formatClock` | `toLocaleTimeString("zh-CN", {hour12:false})` |
| `validateLineup(lineup, rosterNumbers)` | 首发 6 人：完整、不重复、都在名单内 |
| `canWinSet` | 下一分是否直接赢下本局 |

### 4.2 `tournament-rules.js`（纯函数，**整文件搬走即可**）

- `resultFromMatch(state)`：从 `match.sets` 推导 `{ winnerTeamId, homeSets, awaySets, homePoints, awayPoints }`。
- `computeStandings(matches, teams, groups)`：按分组聚合，组内按 **胜场 → 局胜率 → 小分胜率** 排名（排球积分规则）。

### 4.3 记分业务 mutation（`logic.js`，核心逻辑复用）

- `awardPoint(teamIndex)` / `undoPoint(teamIndex)`：得分与撤销（只撤销最近一次正确得分）
- `finishSet(set)`：结束一局并判定胜负
- `requestTimeout` / `resolveDelaySanction`：暂停与延误判罚
- `applySanction`：行为判罚（警告 / 罚分 / 驱逐 / 取消资格，罚分自动计入比分）
- `performLiberoReplacement` / `applyLiberoRedesignation`：自由人替换与重新指定
- `performSubstitution`：普通换人（含配对回换校验）
- `startMatch` / `loadDemoMatch` / `applyDemoRosters` / `readSetupStep`

这些函数内部只改 `state` 并调用 `render()` + `toast()` + `saveRecoverySnapshot()`。小程序版把这三处副作用替换掉即可复用主体逻辑。

### 4.4 审计与撤销（`audit.js`）

- `recordAuditAction(type, label, before, meta)`：每次改变比赛事实前记录「操作前快照」。
- `reverseLatestAction(reason)`：撤销最近一个可逆操作（要求填原因），并追加一条 `correction` 记录。

---

## 5. 复用 vs 重写（总表）

| 模块/能力 | 结论 |
|---|---|
| `rules.js`、`tournament-rules.js` | ✅ 直接复用 |
| `state.js` 的 schema / `normalizeState` / `matchSummary` / `syncActiveMatch` / `createSet` | ✅ 复用，存储 API 换 `wx.*Storage*` |
| `logic.js` 全部 mutation 的**状态变换逻辑** | ✅ 复用，副作用替换 |
| `audit.js` 逻辑 | ✅ 复用（解除对 state 单例的硬依赖更佳） |
| `roster-import.js` 的 `parseDelimitedText`、`normalizeRosterRows`、表头别名表 | ✅ 复用 |
| `roster-import.js` 的 `parseXlsxBuffer`/`unzipEntries`/`parseRosterFile` | ❌ 重写（依赖 `DOMParser`/`DecompressionStream`/`Blob`/`File`） |
| `render.js` 全部 | ❌ 整体重写为 WXML/WXSS |
| `ui.js` 的 `toast`/`confirmDialog`/`showValidation` | ❌ 用 `wx.showToast`/`wx.showModal` 替代 |
| `ui.js` 的 `escapeHTML`/`safeFilename` | ✅ 复用 |
| PDF 导出（`window.print` + `@media print`） | ❌ 用 `canvas` 渲染 + 生成 PDF 或 `wx.openDocument` 替代 |
| CSV/XLSX 文件导入 | ⚠️ 文件选择改 `wx.chooseMessageFile`，XLSX 解压改 JS 库（如 pako），XML 解析改用小程序内 XML 库 |

---

## 6. 浏览器 API → 小程序 API 映射表

| 网页版 | 小程序版 |
|---|---|
| `<div>` / `<section>` / `<article>` | `<view>` / `<block wx:for>` |
| CSS | WXSS（子集；用 `rpx` 自适应；部分选择器不支持） |
| `<template>` + `cloneNode` | `<template is=...>` + `wx:for` |
| `document.querySelector` | `this.selectComponent` / `wx.createSelectorQuery` |
| `addEventListener` | WXML `bindtap` / `catchtap` 事件 |
| `localStorage` | `wx.getStorageSync` / `wx.setStorageSync` |
| `window.confirm` / 自定义 `confirmDialog` | `wx.showModal` |
| `location.href` / `?match=` | `wx.navigateTo({ url })` + 页面 `onLoad(options)` |
| `new URLSearchParams(location.search)` | `onLoad(options)` / `wx.getLaunchOptionsSync()` |
| `FileReader` / `file.text()` / `file.arrayBuffer()` | `wx.chooseMessageFile` + `wx.getFileSystemManager().readFile` |
| `DOMParser`（解析 XLSX 的 XML） | 小程序内 XML 解析库，或 `fast-xml-parser` |
| `DecompressionStream("deflate-raw")` | `pako`（JS inflate） |
| `window.print` / `@media print` | `canvas` + `wx.canvasToTempFilePath`，或用 jsPDF 生成后 `wx.openDocument` |
| `structuredClone` | 深拷贝改为 `JSON.parse(JSON.stringify(x))`（小程序 JS 引擎可能无 `structuredClone`） |
| ES `<script type="module">` | 小程序 `app.js` + 页面 `.js`；`import`/`export` 均可用 |

---

## 7. 页面 → 小程序页面映射建议

| 网页版 | 小程序页面 | 说明 |
|---|---|---|
| `/`（首页） | `pages/index/index` | 导航 + 模块入口 |
| `/record/` 落地页（规则选择） | `pages/record/index` | 落地页与规则选择 |
| `/record/` 赛前四步向导 | `pages/setup/index`（单页内按 `setupStep` 切换 4 个子视图） | 或拆 4 个页，建议单页 + 步骤状态 |
| `/record/` 记分页 | `pages/score/index` | 核心记分界面 |
| `/tournaments/` 列表 | `pages/tournaments/index` | 赛事列表 + 新建 |
| `/tournaments/?id=` 详情 | `pages/tournament-detail/index` | 队伍/名单编辑、选两队建比赛、积分表 |
| 从赛事进入某场比赛 | 复用 `pages/setup` / `pages/score`，靠 `?match=<id>` 载入 | 与网页 `?match=` 语义一致 |

> 建议把「当前正在记的比赛」仍用一个全局状态对象（对应网页 `state` 单例），跨页面传递 `matchId`；页面 `onLoad(options)` 里 `readMatch(matchId)` 载入归档——逻辑与网页 `app.js` 完全一致。

---

## 8. 需完整保留的功能清单（验收对照）

1. 规则选择：`official`（每局 6 换人）与 `test2026`（每局 8 换人）。
2. 四步赛前向导：比赛信息 → 球队名单（号码唯一、自由人 ≤2）→ 裁判组 → 第一局轮次（I–VI + 首次发球）。
3. 记分：加分、撤销最近一次得分、发球轮转与轮次自动跟踪。
4. 暂停：每局 2 次、30 秒倒计时、申请时比分记录。
5. 换人：普通换人（场上名单、配对回换、次数上限 6/8）。
6. 自由人：后排资格、回合间隔、常规换回、第二自由人切换、重新指定。
7. 判罚：不当请求、延误警告/判罚、行为警告、罚分、驱逐、取消资格（罚分自动计分）。
8. 审计：每次操作前快照；纠错只能撤销最近有效操作并要求原因。
9. 局/赛结束：决胜局 15 分、8 分换场、胜局判定。
10. 本机持久化：自动保存 + 最近 5 个恢复快照。
11. 完整比赛 JSON 导出 / 导入（导入须清空 `matchId`/`tournamentId`，否则会覆盖原归档）。
12. 赛事管理：队伍数量（2–32）+ 分组（1–8）、队伍行内名单录入、选两队建比赛并带入名单、小组积分表（胜场→局胜率→小分胜率）。

---

## 9. 测试与验收

- 现有单元测试 `tests/*.test.mjs`（`npm test`，15 项）覆盖：规则胜负判定、决胜局、轮转、轮次校验、自由人资格、名单导入、积分计算、赛果推导。**纯函数部分可直接在小程序环境用同款断言跑一遍**（建议把 `rules.js`/`tournament-rules.js`/`roster-import.js` 的测试原样搬入）。
- 浏览器 e2e 脚本在 `scripts/`（需 Playwright），依赖 DOM，小程序版无法复用；改为小程序自动化（miniprogram-automator）或人工验收。

---

## 10. 已知坑与注意事项

1. **积分只算已决出胜方的比赛**：`computeStandings` 过滤 `m.result.winnerTeamId` 为空者，避免未打完的 0-0 比赛被计成「已赛」。
2. **从赛事新建的比赛落在 `screen:"setup"`**：网页落地页的「载入样例比赛」按钮此时不存在，属预期行为。
3. **JSON 导入必须清空归属**：否则会把导入数据写回原比赛归档、覆盖真实记录。
4. **切换/新建比赛前要先归档当前比赛**（网页 `archiveCurrentMatch()`），否则未归档进度丢失。
5. **`state` 是模块级单例**：`replaceState()` 重新赋值会传播到所有导入方；小程序若拆多页，需用全局 store 或 `getApp().globalData` 承载，避免每个页面各持一份。
6. **`render` ↔ `logic` 循环导入**：运行时安全，但建议小程序版重写时用事件总线/回调打破。
7. **XLSX 导入**：网页依赖浏览器内置的 ZIP 解压 + XML 解析；小程序需引入 `pako`（inflate）与 XML 解析库，或用云函数处理后再下发。
8. **PDF 导出**：小程序无 `window.print`，需用 canvas 重绘记录表或引入 jsPDF。
9. **存储容量**：`wx` 本地存储 10MB 上限，本项目 JSON 规模无碍，但多个赛事 + 多场比赛长期累积需留意，可考虑云开发数据库迁移。
10. **审计日志上限**：`recordAuditAction` 保留最近 250 条，超出的从头部裁剪。
