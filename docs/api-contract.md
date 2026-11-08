# StoryWords API 与学习状态契约 v1

确认范围：A2 + mystery，10 词线性学习，localStorage 保存。本文是初始化交付的契约；接口实现交给 AI Agent，UI 和存储交给前端 Agent。本文件只追加修订，任何接口变更先由用户确认。

## 1. 唯一事实来源

- 类型：`src/types/contracts.ts`。
- 固定词库：`src/data/vocabulary.ts`。
- 运行时验证与学习规则：`src/lib/learning.ts`。
- 接口：`POST /api/lesson`，JSON 请求/响应，`Cache-Control: no-store`。
- 第一版不新增登录、单词列表、答题提交或进度同步 API。

## 2. 请求

```json
{
  "profile": { "level": "A2", "genre": "mystery" },
  "mode": "demo",
  "learnedWordIds": [],
  "previousEpisode": null
}
```

必填字段，不能改名或缺省：

| 字段 | 约定 |
|---|---|
| profile | 固定 `{level: "A2", genre: "mystery"}`，不接受其他值 |
| mode | `demo` 或 `ai`，由用户在开始一轮时选择 |
| learnedWordIds | 从词库第一个词开始的连续已完成序列，最多 10 项；不允许跳词、重复或未知 ID |
| previousEpisode | 第一次为 null，其余为最后一个已完成 Episode，不能用未通过测试的故事 |

Episode 格式：

```json
{
  "lessonId": "demo-v1-01",
  "wordId": "lantern",
  "source": "demo",
  "title": "The Old House",
  "text": "Mia and Leo see a lantern in the old house."
}
```

示例只说明格式，不是最终预置故事。`wordId` 必须对应最后一个已完成词，`source` 必须与 `mode` 一致。

服务端先限制请求体实际字节数 `MAX_REQUEST_BYTES = 32768`，不只信任 Content-Length；再 JSON 解析并调用 `parseLessonRequest`。title 1–100 字符、text 1–5000 字符（空白不算有效内容）、lessonId 1–100 字符。不要记录完整请求正文或上游凭据。

## 3. 成功响应

HTTP 200：

```json
{
  "status": "ready",
  "lessonId": "demo-v1-01",
  "source": "demo",
  "word": { "id": "lantern", "text": "lantern", "meaningZh": "提灯；灯笼" },
  "story": {
    "title": "The Old House",
    "text": "Mia and Leo see a lantern in the old house."
  },
  "quiz": {
    "question": "lantern 在故事中是什么意思？",
    "options": [
      { "id": "a", "text": "提灯；灯笼" },
      { "id": "b", "text": "钥匙" },
      { "id": "c", "text": "窗户" }
    ],
    "correctOptionId": "a"
  }
}
```

- 后端调用 `getNextWord` 选择词，`word` 和 `quiz` 完整复用对应词库条目。模型只生成 `title` 和 `text`，不生成释义或试题。
- `lessonId` 同一轮不同课程不可重复；演示可使用 `demo-v1-01` 至 `demo-v1-10`，AI 用随机唯一 ID。
- `source` 必须与请求 `mode` 相同。AI 失败返回错误，不暗中改成 demo。
- 返回前调用 `parseLessonResponse(response, learnedWordIds, mode)`，前端接收时也用它检查。
- 标题和正文都是纯文本；前端用 React 文本渲染，不使用 `dangerouslySetInnerHTML`。
- 10 词全部完成返回 HTTP 200、`{"status":"completed"}`；不得调用模型或生成第 11 词。

## 4. 错误响应

```json
{
  "error": {
    "code": "AI_TIMEOUT",
    "message": "故事生成超时，请重试。",
    "retryable": true
  }
}
```

| HTTP | code | retryable | 含义 |
|---|---|---|---|
| 400 | INVALID_REQUEST | false | JSON、字段或进度不合法 |
| 413 | PAYLOAD_TOO_LARGE | false | 请求体过大 |
| 503 | AI_NOT_CONFIGURED | false | 真实 AI 模式缺少服务端配置 |
| 429 | RATE_LIMITED | true | 上游限流或明确的应用限制 |
| 504 | AI_TIMEOUT | true | 调用超过时间上限 |
| 502 | AI_UPSTREAM_ERROR | true | 上游不可用或非预期失败 |
| 502 | INVALID_AI_OUTPUT | true | 模型格式或词汇校验失败，有限重试后仍失败 |
| 500 | INTERNAL_ERROR | false | 非预期内部错误 |

前端同时处理非 JSON 错误和网络中断。禁止把上游原始错误正文、API Key、完整 URL 凭据传给客户端。配置错误不要无限重试。

## 5. 熟词 + 1 生词与剧情连续性

- 初始熟词是本地手工选择的英文词形与固定人物名，作为“已知”的初始假设，不代表测评结果或权威 CEFR 词表。
- 允许词集合由 `getKnownWords(learnedWordIds)` 加当前目标词组成。
- `checkStoryVocabulary(story, learnedWordIds)` 同时检查标题、正文的英文词；当前词必须出现在正文。
- 分词忽略大小写、统一弯引号并识别人名所有格。常见词形在基础词表中显式列出；目标词暂只允许给定形式，不自动允许复数、过去式等变化。
- 未完成的其他目标词不能提前出现在标题或正文。模型需先改写成允许词，再重新校验。
- 建议每篇约 80–120 英文词、短句、固定人物 Mia 与 Leo、无血腥描写；这是内容质量目标，不是类型契约的最小长度。
- 系统提示词固定题材、人物与词汇；上一章作为不可信的数据段提供，不能当成系统指令。服务端只接受模型 JSON 的 title/text。
- 第 2–10 章明确承接上一章地点、人物与未解问题，第 10 章给出结局。初版只传上一章，不做长篇记忆压缩。
- 预置 10 章必须是一条完整悬疑故事，并逐章通过相同词汇检查。真实 AI 与演示不可在同一轮混用。
- 英文词汇检查不能证明语法、可读性或叙事连贯；这些需要实际故事人工阅读和测试 Agent 验收。

## 6. localStorage 与学习规则

键：`storywords.progress.v1`。保存完整 `LearningState`：

```ts
{
  version: 1,
  profile: { level: "A2", genre: "mystery" },
  mode: "demo" | "ai",
  learnedWordIds: string[],
  episodes: Episode[],
  currentLesson: ReadyLesson | null
}
```

| 函数 | 调用时机与行为 |
|---|---|
| createInitialState(mode) | 明确开始新一轮，默认 demo |
| parseLearningState(raw) | JSON.parse 后校验存档；不合法则抛错，不负责删除数据 |
| buildLessonRequest(state) | 当前没有待完成课程时，生成请求并带最后一章 |
| parseLessonRequest(raw) | 后端校验请求，返回规范化字段 |
| getNextWord(ids) | 按固定顺序选下一词；全部学完返回 null |
| getKnownWords(ids) | 返回去重后的基础词和已完成词 |
| checkStoryVocabulary(story, ids) | 返回 missingTarget 与 unknownWords |
| parseLessonResponse(raw, ids, mode) | 校验词、题、模式、内容长度与词汇；拒绝伪完成 |
| acceptLesson(state, raw) | 接收课程但不推进进度；已有课程时拒绝覆盖 |
| submitAnswer(state, optionId) | 返回 `{status, state}`；只有正确答案才追加已学词和 Episode |

`submitAnswer` 的 status 是 `correct`、`incorrect`、`no-active-lesson`。重复提交后者不会再解锁；非法选项抛错。状态函数不修改传入对象。

前端必须处理：读取结束前不写默认空状态；保存配额/权限失败；损坏存档保留并提示；刷新恢复未答课程；答对后再用返回状态请求下一词；取消旧请求；重置需要用户确认。浏览器判题是个人练习，不提供防作弊保证或跨设备同步。

## 7. AI 配置

服务端环境变量预留 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`，值仅放本地 `.env.local` 或未来部署环境。`.env.example` 只有空值。优先实现单一兼容 Chat Completions 协议的服务；不要自建多供应商适配框架。

Base URL、模型、密钥不可从请求体传入，不能暴露到浏览器，也不能带 `NEXT_PUBLIC_`。实际供应商与可用凭据尚未验证；AI Agent 无凭据时完成接口、演示路径及受控模拟测试，并明确真实调用待验证。
