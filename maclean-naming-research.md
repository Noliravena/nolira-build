# Maclean 命名调研与建议

> 调研背景：喜欢 **Maclean** 这个名称，产品方向为 **AI 软件**，灵感来自 **Fallout 剧集中的 MacLean 家族**（Lucy / Hank / Norm 等）。

---

## 1. 结论摘要

| 维度 | 结论 |
|------|------|
| GitHub / 知名开源产品 | **没有**叫 `maclean` 的明星软件产品 |
| npm / PyPI 包名 | 粗查显示 `maclean` **似乎未被占用**（发布前请再确认） |
| 同音/近名软件 | 存在 **MacClean**（iMobie Mac 清理）、**MAClean** 等清理类工具 |
| 工业/姓氏品牌 | 存在 MacLean Power Systems 等，与 AI 品类关联弱 |
| Fallout 联想 | 剧集中 **MacLean** 角色辨识度高，是命名的核心来源 |
| 对 AI 产品的影响 | 与「清理软件」撞名风险**小**；真正要注意的是 **IP/版权与商标** |

**一句话：**  
GitHub 与主流包管理器上没有强占用；AI 品类下与 MacClean 清理软件基本不会死磕；若做商业品牌，应把 Maclean 当**原创姓氏品牌**用，避免做成「Fallout 官方角色产品」。

---

## 2. 已有软件与近名占用

### 2.1 容易混淆的软件产品

| 名称 | 类型 | 说明 |
|------|------|------|
| **MacClean** (iMobie) | 商业 Mac 清理/优化软件 | 拼写为 Mac + Clean，读音与观感接近，SEO 上可能抢搜索 |
| **MAClean** | GitHub 开源 Mac 磁盘清理 | `chinazane/MAClean` 一类清理工具 |
| **maclean** | Linux 清理脚本 | Manjaro / EndeavourOS 等论坛上的小脚本，知名度不高 |
| **McClean / MacCleanse** | Mac App Store 清理类 App | 同类命名，多在「清理 / Mac」搜索中出现 |

- 若产品是 **Mac 清理 / 系统优化**：与 MacClean / MAClean 几乎正面撞名，**不建议**。
- 若产品是 **AI / 开发工具 / SaaS**：品类不同，混淆风险**明显更低**。

### 2.2 GitHub 情况

- 多为个人账号、学术仓库，例如：
  - `maclean-lab`（实验室）
  - `teammaclean`（生物信息学团队）
  - 各类 `*maclean*` 个人主页
- **没有**行业级、以 maclean 为产品品牌的知名开源项目。

### 2.3 包注册表（粗查，发布前请复核）

| 平台 | `maclean` 包 |
|------|----------------|
| npm | 似乎不存在 |
| PyPI | 似乎不存在 |

适合先占 GitHub org / 包名，但仍建议发布前再查一次。

### 2.4 非软件、但品牌较强的 MacLean

- **MacLean Power Systems** — 电力/电网设备
- **MacLean Engineering** — 工程/矿山设备
- **MacLean Civil Products** 等

`MacLean` 也是常见英文姓氏。做商标、国际品牌、尤其是 `.com` 域名时，可能已有占用或溢价。

---

## 3. Fallout 角色关联（命名动机）

名称灵感来自 **Fallout 剧集中的 MacLean 家族**，而非「Mac 清理」语义。

| 角色 | 气质 | 用作 AI 品牌时的联想 |
|------|------|----------------------|
| **Lucy MacLean** | 乐观、理想主义、Vault 居民、闯废土 | 助手感、陪伴感、善良但会成长 |
| **Hank MacLean** | Overseer / Vault-Tec 相关、复杂反派 | 权威、计划、控制感（偏暗） |
| **Norm MacLean** | 好奇、调查、冷静 | 分析型、研究型 AI |

- 产品气质偏「可靠搭档 / 探索型助手」→ 更接近 **Lucy**。
- 偏「冷酷执行 / 系统级大脑」→ 可能沾到 **Hank** 的反派感，对外叙事时要谨慎。

另：游戏中还有 **Robert Joseph "RJ" MacCready**（Fallout 3 / 4 同伴），与 **MacLean** 不是同一角色，拼写也不同。

---

## 4. IP / 商标与合规边界

**MacLean 在剧集中是角色姓氏**，相关版权在 Bethesda / Microsoft / 剧集权利方等手中。

> 以下为实务经验，**不是法律意见**。商业发布前建议做正式商标检索与法务确认。

### 相对更稳妥

- 产品名使用 **Maclean**，不宣称 “Official Fallout AI”
- 不使用 Vault-Tec logo、Pip-Boy、Vault Boy、剧集海报风字体
- 不用 Lucy 等角色官方肖像
- 文案用模糊致敬，例如「受废土文化启发」，而非「Lucy MacLean 驱动的 AI」

### 风险明显升高

- 宣传写成 “Lucy MacLean AI”、“Vault 33 助手”
- Logo / UI 高度模仿官方视觉
- 产品本体人设 = 剧集角色本人（尤其带官方形象的语音/形象）

**说明：**  
个人开源、小众工具通常关注度低；一旦商业化、融资、上架应用商店、注册商标，使用热门 IP 角色全名当品牌可能被卡，后期改名成本很高。

---

## 5. 命名策略建议

### 方案 A：直接用 Maclean

- **适合：** 独立品牌，不把自己绑成 “Fallout 官方衍生”
- **卖点方向：** 废土气质、冷静/可靠、探索感
- **避免：** 角色全名、剧集专有设定当 slogan

### 方案 B：保留读音，拉开官方距离

| 名字 | 感觉 |
|------|------|
| **Maclean AI / Maclean** | 最贴剧，IP 联想最强 |
| **Maclane** | 读音近，视觉上不那么像角色名 |
| **Macleon** | 略造词，更像原创品牌 |
| **getmaclean / usemaclean** | 域名与产品前缀友好 |
| 避免 **Vault-*** 前缀 | Vault 官方感过重 |

### 方案 C：角色气质作人设，主品牌另起（商业上常更稳）

- **公司 / 产品主品牌：** 更原创、好注册、好商标
- **AI 助手 / 默认 persona：** 可叫 Maclean（或 “Mac”）

很多 AI 产品采用：**公司名 ≠ 助手名** —— 粉丝共鸣留给 persona，法律与商标风险由主品牌承担。

---

## 6. 按目标怎么选

| 目标 | 建议 |
|------|------|
| 情怀、个人项目、早期产品 | 用 **Maclean** 合理；可先占 GitHub / 包名 |
| 认真做商业 AI、融资、商标 | 主品牌更原创；**助手/模型 persona 叫 Maclean** |
| 对外话术 | ✅「Inspired by wasteland optimism / vault-born curiosity」 |
| 对外话术 | ❌「The AI version of Lucy MacLean from Fallout」 |

---

## 7. 与 AI 品类相关的判断表

| 问题 | 答案 |
|------|------|
| 喜不喜欢 Maclean 这个名？ | 可以；与 Fallout 粉丝共鸣好 |
| AI 会不会和 MacClean 清理软件死磕？ | **基本不会** |
| 能否当长期品牌？ | **能**，但应按「原创姓氏品牌」使用，而非「Fallout 角色授权」 |
| 最大雷区？ | 宣传/素材太像官方衍生，或把 Lucy/Hank 当产品本体 |

---

## 8. 域名与技术标识（待自查清单）

发布前建议逐项确认：

- [ ] GitHub 用户名 / Organization：`maclean` 等是否可用
- [ ] npm：`npm view maclean` / 官网搜索
- [ ] PyPI：包名是否可用
- [ ] 域名：`maclean.com` / `.io` / `.dev` / `.app` / `.ai` 等
- [ ] 商标：目标市场（如 USPTO、CNIPA）检索
- [ ] App Store / Google Play 近名冲突
- [ ] X / Discord / 小红书等社媒 handle

---

## 9. 参考链接（调研时用到）

- [Hank MacLean - Fallout Wiki](https://fallout.fandom.com/wiki/Hank_MacLean)
- [Lucy MacLean - Fallout Wiki](https://fallout.fandom.com/wiki/Lucy_MacLean)
- [Norm MacLean - Fallout Wiki](https://fallout.fandom.com/wiki/Norm_MacLean)
- [Robert MacCready - Fallout Wiki](https://fallout.fandom.com/wiki/Robert_MacCready)（游戏角色，拼写不同）
- [iMobie MacClean](https://www.imobie.com/macclean/)
- [MAClean (GitHub)](https://github.com/chinazane/MAClean)
- [MacLean Power Systems](https://www.macleanpower.com/)

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 根据命名讨论整理初版：软件撞名、Fallout 角色、IP 边界与 AI 命名策略 |

---

*本文档仅供产品命名决策参考，不构成法律意见。*
