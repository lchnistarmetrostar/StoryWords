# StoryWords API 与存档契约

A2 + mystery，固定十词。唯一类型来源为 `src/types/contracts.ts`；运行时验证在 `src/lib/learning.ts`、`src/lib/byok.ts`。

## POST /api/lesson

JSON 请求，响应 `Cache-Control: no-store`。Demo 示例：

```json
{"profile":{"level":"A2","genre":"mystery"},"mode":"demo","learnedWordIds":[],"previousEpisode":null}
```

AI 使用同样四字段，将 mode 改为 `ai`，增加 `ai: { provider, model, apiKey }`。凭据是请求专用字段，绝不进入响应或存档。Demo 携带 ai 会被拒绝。

- provider 严格限定 `deepseek` / `openai`，只访问代码内固定官方 Chat Completions URL，不接受用户 URL 或重定向。
- model 去首尾空格后 1–100 字符，仅英数、点、下划线、冒号、连字符。
- apiKey 去首尾空格后 8–512 个可打印非空白 ASCII 字符；只用于当前请求，错误不得带输入值。
- 请求体最多 32768 字节。BYOK 要求 JSON、精确 Origin 白名单及匹配 Host，Fetch Metadata 若存在必须同源；不开放 CORS。
- 公开启动强制 `STORYWORDS_BYOK_ONLY=1`，缺个人配置必须拒绝，即使站主环境变量存在也不能回退。

learnedWordIds 必须是固定顺序的已完成词前缀。第一课 previousEpisode 为 null；后续提交实际上一课 Episode，模式与词必须匹配。字段以共享类型为准，客户端不能自由指定下一词或题目。

## 成功响应

`{ status: "ready", lessonId, source: "demo" | "ai", word: { id, text, meaningZh }, story: { title, text }, quiz }`，或十词完成后的 `{ status: "completed" }`。Quiz 与 Episode 的完整字段以 `src/types/contracts.ts` 为准，客户端调用共享校验函数接受课程。

模型只返回标题和正文。标题/正文仅允许熟词与当前生词，正文必须出现当前生词；未学目标词不得提前出现。上一章只作不可信故事数据，不作为系统指令。词汇验证不能证明语法、自然度或剧情一致性。

## 安全错误和限制

统一 `{ error: { code, message, retryable } }`，不透传供应商原始正文、凭据或认证 URL。

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 字段、进度、来源或格式不合法 |
| 413 | PAYLOAD_TOO_LARGE | 请求体超限 |
| 503 | AI_NOT_CONFIGURED | 缺个人配置或运行模式冲突 |
| 429 | RATE_LIMITED | 本地/供应商限流 |
| 504 | AI_TIMEOUT | 单次上游超时 |
| 502 | AI_UPSTREAM_ERROR | 供应商拒绝、不可用或协议不兼容 |
| 502 | INVALID_AI_OUTPUT | 有限纠正后输出仍不合格 |
| 500 | INTERNAL_ERROR | 非预期错误 |

每个 provider+Key 最多 1 并发、滚动 60 秒最多 4 次实际供应商请求，全局最多 4 个并发生成，失败和重试计数。身份使用带进程随机盐的摘要，只保存时间和计数；单次超时 20 秒，最多 1 次输出纠正重试，2048 tokens 输出上限。不自动换模型、站主配置或 Demo。计数在单进程内，重启清零，不是持久费用配额。

## 浏览器存档

课程 `storywords.progress.v1` 保持 version 1：profile、mode、learnedWordIds、episodes、currentLesson。答错不推进，只有新增正确答案才解锁；恢复异常保留原数据并提示，重置/切换需用户确认。

每日计划 `storywords.daily-plan.v1` 独立保存 version、本地 date、target、当日 completedWordIds、跨日 seenWordIds。恢复历史不补计今天；答错、回顾、重复提交、重置重做不增加新词计数。跨日清今日计数，保留完整课程和已见记录；达标暂停，由用户主动继续。固定词库耗尽后回顾，不生成第十一词。

个人配置只在标签页内存和当前请求中，清除/离开取消未完成请求并拒绝迟到结果。刷新后重新输入，不写入课程、每日计划、浏览器持久存储、URL 或日志。
