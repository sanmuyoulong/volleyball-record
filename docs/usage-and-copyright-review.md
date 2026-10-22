# 服务、版权与未来收费核查

核查日期：2026-10-22。本文件为产品与许可设计记录，不是第三方授权证明或律师法律意见。

## 当前服务事实

- 游客计分和技术统计使用 localStorage；本机控制台使用 IndexedDB，演示身份不是真实账号。当前没有云端比赛库、支付、订阅或跨设备同步。
- 前端代码未发现自动上传名单、导入文件或比赛记录的逻辑。网站托管及在线视频会产生网络请求，不能据此承诺整个网站完全不涉及访问日志或第三方数据处理。
- 仓库此前无 LICENSE / NOTICE，历史离线页却写“已开源”。公开源码本身与授予开源许可不同；`package.json` 的 `private: true` 只是防止意外发布到包注册表，不等同于版权许可或 GitHub 私有仓库。

## 采用的边界

项目所有者选择：允许实际比赛使用；复制网站、包装转售或运营收费平台须另行授权。

因此采用“源码公开与使用许可”，免费允许实际比赛、内部运行及学习修改，允许保留声明原样免费分享官方离线文件；正常使用和交付比赛报表不受软件转售限制。对外复制部署及软件收费分发另行书面授权。没有采用 MIT / Apache / GPL / AGPL 等允许商业使用的开源许可，也没有将 CC 非商业许可直接套给软件。

“仅供学习交流”不能直接消除第三方版权责任；“严禁商用”则会连实际赛事和报表交付一并限制，且不能与允许商业使用的开源许可同时成立。

## 第三方权利

软件保护不延及思想、操作方法及数学概念；规则事实与具体规则文献、图片、标识和独创性版式应分开核对。通用表格与公式也不应被本项目概括为自有专有版权。原始 PDF、B6 参考材料、图片、视频和配音的权利记录尚需核验，详见 NOTICE.md。署名、标注来源及写明“非官方”都不能替代必要授权。

## 后续收费

适合单独定价的方向是云端保存与恢复、账号权限、多人协作、机构赛事管理、部署维护和定制支持。若采用这一路径，应在启用前另行公布价格、付费范围、服务及退款条款、数据处理规则，不自动将已取得的离线版本许可改为收费，也不能用“免费原型免责声明”免除新的付费服务义务。

当前同时部署于 Vercel 与 Sites。未在本次核查中确认 Vercel 账号套餐；Vercel Hobby 的商业使用限制应在收费、广告、赞助或其他营利运营前按实际套餐核对。仅在网页写“非商业”并不能改变实际运营性质。其他托管方应另按有效合同核对。

若后续使用中国大陆服务器或提供面向公众的在线收费服务，还需按实际服务器位置、经营模式与服务内容核对备案、许可、税务和个人信息保护要求；不能一概认为“收费就必须办理某一种许可证”，也不能认为一句免责声明能够替代这些义务。

## 依据

- [国家版权局：著作权法](https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html)，第 5、24、26 条等。
- [最高人民法院知识产权法庭：计算机软件保护条例](https://ipc.court.gov.cn/zh-cn/news/view-407.html)，第 6 条等。
- [GitHub：Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。
- [OSI：Open Source Definition](https://opensource.org/osd)，第 6 项不得限制商业领域用途。
- [Creative Commons：FAQ](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software)，不建议将 CC 许可直接用于软件。
- [Vercel：Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)，商业使用须按适用套餐及条款核对。
