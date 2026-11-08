# StoryWords

**Every word unlocks a story.**

AI 驱动的英语词汇学习 Web App：用熟悉的词读故事，每章学习一个新词，答对后解锁后续剧情。

> 黑客松评审版本 · A2 英语 · 悬疑故事 · 10 个目标词

## 评审从这里开始

1. **[打开在线预置 Demo](https://remix-careful-bob-prospects.trycloudflare.com/)**：无需账号和 API Key。当前公网展示预置故事，不是实时 AI；临时隧道可能在演示结束后失效。
2. **离线体验**：[下载 demo.html](docs/demo.html)，点击 GitHub 的下载原始文件按钮，保存后用 Chrome/Edge 打开。单文件包含十章预置故事，无需联网。此文件保留此前验收的界面。
3. **路演**：[九页幻灯片](docs/pitch.html) 同样下载后打开；方向键/空格翻页，F 全屏。图片和字体已内嵌，无 CDN。
4. **查看源码并本地运行**：见下方命令。仓库源码包含新的午夜蓝前端；临时公网 Demo 仍是较早冻结的验收构建，外观可能不同。

![StoryWords 新版界面](docs/product-home.png)

## 核心流程

熟词 + 当前一个新词 → 生成故事 → 点击查看释义 → 词义测试 → 答对解锁 → 携带上一章续写。

- 答错不会推进，完成十词后显示学习结束。
- 已完成的目标词进入后续章节允许词汇。
- 完整学习进度保存在当前浏览器 localStorage，刷新后可恢复。
- Demo 与 AI 明确区分；AI 失败返回错误，不暗中切换成预置内容。
- 模型只生成故事标题与正文；选词、题目、判题、解锁由程序管理。

目标词：`lantern → envelope → whisper → footprint → cellar → clue → shadow → portrait → locket → treasure`。

## 快速运行

需要 **Node.js 24** 和 npm。Demo 不需要任何环境变量。

```bash
npm ci
npm test
npm run build
npm run start
```

打开 **http://127.0.0.1:3000**，选择“预置演示”。结束时按 Ctrl+C。

开发模式使用 `npm run dev`。请串行执行开发服务与生产构建；不要同时写入 `.next`。

类型检查：`npm run typecheck`。Next 构建会生成路由类型文件，因此全新下载时先完成 `npm run build`。

## 真实 AI 与演示的区别

真实 AI 使用兼容 Chat Completions 的服务端接口。可在个人本机新建 `.env.local`，自行填写以下三项；不要提交此文件：

```dotenv
AI_BASE_URL=
AI_MODEL=
AI_API_KEY=
```

`AI_BASE_URL` 为接口基础地址，程序会追加 `/chat/completions`。不配置时选择 AI 模式会返回 `503 AI_NOT_CONFIGURED`，Demo 仍正常可用。

本地已经实际生成并接续 `lantern`、`envelope` 两章。最近成功验证的两章请求分别耗时 **7.959 秒、13.646 秒**，均返回 `source: ai`，词汇检查通过。它们是单次样本，不代表稳定平均延迟。此前一轮发生过词汇失败后的重试超时，生成文本仍存在不自然表达和局部歧义。

**不要将配置了付费 AI 的未保护接口直接暴露公网。** 本项目尚未实现账号、访问配额或费用控制；当前公网 Demo 禁用了 AI。

## 技术与目录

Next.js + React + TypeScript，简单 CSS，Node 原生测试工具；无数据库、无额外状态管理依赖。

| 目录 | 职责 |
|---|---|
| `src/app`、`src/components` | 页面、阅读、测试和学习旅程 |
| `src/app/api/lesson/route.ts` | `POST /api/lesson` |
| `src/lib/server` | AI 请求、提示词、超时与错误处理 |
| `src/lib/learning.ts` | 共享选词、判题、解锁和响应校验 |
| `src/lib/storage.ts` | 存档读取、校验和保存 |
| `src/data` | 基础熟词、目标词和十章预置故事 |
| `tests` | 自动化测试 |
| `docs` | 评审材料、离线 Demo、路演与 API 契约 |

[API 契约](docs/api-contract.md) · [本次提交验收说明](docs/verification.md)

## 研究依据与产品边界

- [CHI 2024：Putting Things into Context](https://www.media.mit.edu/publications/putting-things-into-context/)：272 人随机分组在线研究支持个性化语境对学习动机的积极作用，未观察到组间学习表现差异。
- [EMNLP 2025：SRS-Stories](https://aclanthology.org/2025.emnlp-industry.44/)：探索已知词与待学词约束下的故事生成、外部词汇检查与改写，主要评估生成文本质量。

这些研究是设计启发，不是 StoryWords 学习效果已获验证的证据。连续剧情是否改善坚持度和长期记忆仍是产品假设。

已完成的产品验收包括 75 项自动测试和 38 项预置 Demo 浏览器分组检查。本次 GitHub 快照的实际检查结果单列于提交验收说明；不把模拟 AI 测试当作供应商调用。

当前仅 A2、悬疑、十词线性流程。基础熟词为预设假定，不是个人测评结果或权威 CEFR 词表；没有登录、跨设备同步和复杂间隔复习。建议同一浏览器只使用一个学习标签页，避免旧标签页覆盖新进度。

## 提交范围

仓库仅包含产品源码、锁文件、配置、自动测试和明确选定的评审材料。没有上传 `references/`、任何 `.env` 文件、API 密钥、私人记录、本地运行日志或 Agent 对话记录。

第三方字体许可保留在源码及内嵌路演中。路演摄影来自 Giammarco Boscaro / Unsplash，详见 HTML 内的署名链接；产品截图为实际浏览器验收截图。
