import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { POST } from "../src/app/api/lesson/route.ts";
import { beginByokRequest } from "../src/lib/server/byok-access.ts";
import { getLesson } from "../src/lib/server/lesson.ts";
import { TARGET_WORDS } from "../src/data/vocabulary.ts";
import type { ByokConfig, LessonRequest } from "../src/types/contracts.ts";

const origin = "http://127.0.0.1:3004";
const input: LessonRequest = { profile: { level: "A2", genre: "mystery" }, mode: "ai", learnedWordIds: [], previousEpisode: null };
const config: ByokConfig = { provider: "deepseek", model: "deepseek-flash", apiKey: "test-only-personal-key" };
const headers = { Host: "127.0.0.1:3004", Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" };
const story = { title: "The House", text: "Mia found a lantern in the house." };
let now = 0;

beforeEach((t) => {
  assert.ok("mock" in t);
  process.env.STORYWORDS_BYOK_ONLY = "1";
  process.env.STORYWORDS_ALLOWED_ORIGINS = origin;
  delete process.env.STORYWORDS_LOCAL_AI_DEMO;
  // Fake owner credentials intentionally coexist with BYOK; never load an env file.
  process.env.AI_BASE_URL = "https://owner.example.invalid/v1";
  process.env.AI_MODEL = "test-only-owner-model";
  process.env.AI_API_KEY = "test-only-owner-key";
  now += 120_000;
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "fetch", () => { assert.fail("Unexpected real network request"); });
});

function request(body: unknown = { ...input, ai: config }, overrides: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request(`${origin}/api/lesson`, { method: "POST", headers: { ...headers, ...overrides }, body: JSON.stringify(body), signal });
}
function completion(value = story) {
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
}
async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.deepEqual(Object.keys(data), ["error"]);
  assert.deepEqual(Object.keys(data.error).sort(), ["code", "message", "retryable"]);
  assert.equal(data.error.code, code);
  assert.doesNotMatch(JSON.stringify(data), /test-only|owner\.example|raw-secret|api\.openai|api\.deepseek|Bearer/);
}

test("BYOK-only missing credentials never use owner env, including completed or direct service calls", async () => {
  await expectError(await POST(request(input)), 503, "AI_NOT_CONFIGURED");
  const completed: LessonRequest = { ...input, learnedWordIds: TARGET_WORDS.map(word => word.id), previousEpisode: {
    lessonId: "last", wordId: "treasure", source: "ai", title: "The House", text: "Mia found treasure in the house.",
  } };
  await expectError(await POST(request(completed)), 503, "AI_NOT_CONFIGURED");
  await assert.rejects(getLesson(input, new AbortController().signal), { code: "AI_NOT_CONFIGURED" });
  await assert.rejects(getLesson(input, new AbortController().signal, config), { code: "INTERNAL_ERROR" });
  const response = await POST(request({ ...completed, ai: config }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed" });
  await expectError(await POST(request({ ...completed, ai: { ...config, model: "" } })), 400, "INVALID_REQUEST");
});

test("invalid credentials, URL attempts and extra provider fields are rejected before fetch", async () => {
  for (const ai of [
    null, {}, [], { ...config, provider: "azure" }, { ...config, provider: "__proto__" },
    { ...config, apiKey: "" }, { ...config, apiKey: "short" }, { ...config, apiKey: "key\r\nX: other" },
    { ...config, apiKey: "x".repeat(513) }, { ...config, model: "" }, { ...config, model: "x".repeat(101) },
    { ...config, model: "https://attacker.invalid" }, { ...config, model: "model?key=raw-secret" },
    { ...config, model: "model\r\nheader" }, { ...config, baseUrl: "https://attacker.invalid" },
    { ...config, url: "https://attacker.invalid" }, { ...config, headers: { Authorization: "raw-secret" } },
  ]) await expectError(await POST(request({ ...input, ai })), 400, "INVALID_REQUEST");
  await expectError(await POST(request({ ...input, mode: "demo", ai: config })), 400, "INVALID_REQUEST");
  assert.equal((await POST(request({ ...input, mode: "demo" }))).status, 200);
});

test("BYOK requires exact allowed Origin, matching Host, JSON and same-origin metadata", async () => {
  const bad: Record<string, string>[] = [
    { Origin: "" }, { Origin: "null" }, { Origin: "https://attacker.invalid" }, { Origin: `${origin}/` },
    { Host: "attacker.invalid" }, { Host: "127.0.0.1:3001" }, { "Content-Type": "text/plain" },
    { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" },
    { Origin: "https://attacker.invalid", "X-Forwarded-Host": "127.0.0.1:3004", "X-Forwarded-Proto": "http" },
  ];
  for (const override of bad) await expectError(await POST(request(undefined, override)), 400, "INVALID_REQUEST");
  delete process.env.STORYWORDS_ALLOWED_ORIGINS;
  await expectError(await POST(request()), 400, "INVALID_REQUEST");
  process.env.STORYWORDS_ALLOWED_ORIGINS = "http://public.example.invalid";
  await expectError(await POST(request(undefined, { Origin: "http://public.example.invalid", Host: "public.example.invalid" })), 400, "INVALID_REQUEST");
});

test("both providers use fixed official targets and bounded JSON output without header or key leakage", async (t) => {
  for (const provider of ["deepseek", "openai"] as const) {
    const ai = { ...config, provider, model: provider === "openai" ? "gpt-4.1-mini" : config.model };
    const calls = t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
      assert.equal(String(url), provider === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      const outgoing = new Headers(init?.headers);
      assert.deepEqual([...outgoing.keys()].sort(), ["authorization", "content-type"]);
      assert.equal(outgoing.get("authorization"), `Bearer ${ai.apiKey}`);
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, ai.model);
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(body.stream, false);
      assert.equal(body[provider === "deepseek" ? "max_tokens" : "max_completion_tokens"], 2048);
      assert.equal(body[provider === "deepseek" ? "max_completion_tokens" : "max_tokens"], undefined);
      assert.doesNotMatch(init!.body as string, /test-only-personal-key|test-only-owner/);
      return completion();
    });
    const response = await POST(request({ ...input, ai }, { Authorization: "Bearer wrong-header", "X-API-Key": "not-forwarded" }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source, "ai");
    assert.deepEqual(data.story, story);
    assert.doesNotMatch(JSON.stringify(data), /apiKey|test-only|provider/);
    assert.equal(calls.mock.callCount(), 1);
  }
});

test("an explicitly allowed HTTPS origin works without trusting forwarded headers", async (t) => {
  process.env.STORYWORDS_ALLOWED_ORIGINS = `${origin},https://byok.example.invalid`;
  t.mock.method(globalThis, "fetch", async () => completion());
  assert.equal((await POST(request(undefined, { Host: "byok.example.invalid", Origin: "https://byok.example.invalid" }))).status, 200);
});

test("BYOK never falls back even outside BYOK-only, and cannot bypass old local runtime protection", async (t) => {
  delete process.env.STORYWORDS_BYOK_ONLY;
  const calls = t.mock.method(globalThis, "fetch", async (url: unknown) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    return new Response("raw-secret", { status: 401 });
  });
  await expectError(await POST(request()), 502, "AI_UPSTREAM_ERROR");
  assert.equal(calls.mock.callCount(), 1);
  process.env.STORYWORDS_LOCAL_AI_DEMO = "1";
  await expectError(await POST(request()), 503, "AI_NOT_CONFIGURED");
  process.env.STORYWORDS_BYOK_ONLY = "1";
  await expectError(await POST(request()), 503, "AI_NOT_CONFIGURED");
  assert.equal(calls.mock.callCount(), 1);
});

test("model rejection, authentication, rate limits and redirects remain sanitized without retry", async (t) => {
  for (const status of [400, 401, 403, 404, 422, 429, 500, 302, 307]) {
    const calls = t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      assert.equal(init?.redirect, "error");
      return new Response("raw-secret test-only-personal-key", { status, headers: { Location: "https://attacker.invalid" } });
    });
    await expectError(await POST(request({ ...input, ai: { ...config, apiKey: `test-only-status-${status}` } })), status === 429 ? 429 : 502, status === 429 ? "RATE_LIMITED" : "AI_UPSTREAM_ERROR");
    assert.equal(calls.mock.callCount(), 1);
  }
  const calls = t.mock.method(globalThis, "fetch", async () => { throw new Error("raw-secret test-only-personal-key"); });
  await expectError(await POST(request()), 502, "AI_UPSTREAM_ERROR");
  assert.equal(calls.mock.callCount(), 1);
});

test("per-key rolling quota counts corrections and failures, releases locks, and expires at 60 seconds", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 1 || calls === 4 ? completion({ ...story, text: "Mia found a lantern and a zeppelin." }) : completion();
  });
  assert.equal((await POST(request())).status, 200);
  assert.equal(calls, 2);
  assert.equal((await POST(request())).status, 200);
  await expectError(await POST(request()), 429, "RATE_LIMITED");
  assert.equal(calls, 4, "the correction cannot exceed four actual attempts");
  await expectError(await POST(request({ ...input, ai: { ...config, model: "another-model" } })), 429, "RATE_LIMITED");
  now += 59_999;
  await expectError(await POST(request()), 429, "RATE_LIMITED");
  now++;
  assert.equal((await POST(request())).status, 200);
  assert.equal(calls, 5);
});

test("invalid output gets at most one correction, then the same credential can still be used", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async () => new Response("raw-secret invalid JSON"));
  await expectError(await POST(request()), 502, "INVALID_AI_OUTPUT");
  assert.equal(calls.mock.callCount(), 2);
  t.mock.method(globalThis, "fetch", async () => completion());
  assert.equal((await POST(request())).status, 200);
});

test("simultaneous credentials stay separate, one key is serialized, and the global limit is four", async (t) => {
  const pending: { key: string; finish: (value: Response) => void }[] = [];
  let nextStarted: (() => void) | undefined;
  const calls = t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => new Promise<Response>(resolve => {
    pending.push({ key: new Headers(init?.headers).get("authorization")!, finish: resolve });
    nextStarted?.();
  }));
  const jobs: Promise<Response>[] = [];
  t.after(() => { for (const job of pending) job.finish(completion()); });
  for (let index = 0; index < 4; index++) {
    const started = new Promise<void>(resolve => { nextStarted = resolve; });
    jobs.push(POST(request({ ...input, ai: { ...config, apiKey: `test-only-concurrent-${index}` } })));
    await started;
  }
  await expectError(await POST(request({ ...input, ai: { ...config, apiKey: "test-only-concurrent-0" } })), 429, "RATE_LIMITED");
  await expectError(await POST(request({ ...input, ai: { ...config, apiKey: "test-only-fifth" } })), 429, "RATE_LIMITED");
  assert.deepEqual(pending.map(job => job.key), [0, 1, 2, 3].map(index => `Bearer test-only-concurrent-${index}`));
  assert.equal(calls.mock.callCount(), 4);
  for (const job of pending) job.finish(completion());
  for (const response of await Promise.all(jobs)) assert.equal(response.status, 200);
  t.mock.method(globalThis, "fetch", async () => completion());
  assert.equal((await POST(request())).status, 200);
});

test("timeout and cancellation count dispatched attempts but release the credential and global lock", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const cancel of [false, true]) {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let observed: AbortSignal | undefined;
    const calls = t.mock.method(globalThis, "fetch", (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      observed = signal;
      signal.addEventListener("abort", () => reject(new DOMException("raw-secret", "AbortError")), { once: true });
      started();
    }));
    const controller = new AbortController();
    const result = POST(request(undefined, {}, controller.signal));
    await ready;
    if (cancel) controller.abort(); else t.mock.timers.tick(20_000);
    await expectError(await result, cancel ? 502 : 504, cancel ? "AI_UPSTREAM_ERROR" : "AI_TIMEOUT");
    assert.equal(observed?.aborted, true);
    assert.equal(calls.mock.callCount(), 1);
    t.mock.method(globalThis, "fetch", async () => completion());
    assert.equal((await POST(request())).status, 200);
  }
  await expectError(await POST(request()), 429, "RATE_LIMITED");
});

test("cancellation before dispatch spends no attempts and leaves no locked identity", async (t) => {
  for (let i = 0; i < 5; i++) await expectError(await POST(request(undefined, {}, AbortSignal.abort())), 502, "AI_UPSTREAM_ERROR");
  const calls = t.mock.method(globalThis, "fetch", async () => completion());
  assert.equal((await POST(request())).status, 200);
  assert.equal(calls.mock.callCount(), 1);
});

test("more than ten BYOK users remain usable and provider identities do not share the old launch budget", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async () => completion());
  for (let i = 0; i < 12; i++) assert.equal((await POST(request({ ...input, ai: { ...config, apiKey: `test-only-user-${i}` } }))).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await POST(request())).status, 200);
  await expectError(await POST(request()), 429, "RATE_LIMITED");
  assert.equal((await POST(request({ ...input, ai: { ...config, provider: "openai" } }))).status, 200);
  assert.equal(calls.mock.callCount(), 17);
});

test("credential fingerprint storage is capacity-bounded, expires, and release is idempotent", () => {
  for (let i = 0; i < 1024; i++) {
    const access = beginByokRequest(request(), input, { ...config, apiKey: `test-only-capacity-${i}` });
    access.reserveAttempt();
    access.release();
    access.release();
  }
  assert.throws(() => beginByokRequest(request(), input, config), { code: "RATE_LIMITED" });
  now += 60_000;
  const access = beginByokRequest(request(), input, config);
  access.reserveAttempt();
  access.release();
  assert.throws(() => access.reserveAttempt(), { code: "INTERNAL_ERROR" });
});

test("cancelling a streamed upstream body releases one of four global slots immediately", async (t) => {
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  let started: (() => void) | undefined;
  const calls = t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      init!.signal!.addEventListener("abort", () => controller.error(new DOMException("raw-secret", "AbortError")), { once: true });
    },
    pull() { started?.(); },
  })));
  const jobs: Promise<Response>[] = [];
  t.after(() => { for (const controller of controllers) controller.abort(); });
  for (let i = 0; i < 4; i++) {
    const ready = new Promise<void>(resolve => { started = resolve; });
    jobs.push(POST(request({ ...input, ai: { ...config, apiKey: `test-only-body-${i}` } }, {}, controllers[i].signal)));
    await ready;
  }
  await expectError(await POST(request()), 429, "RATE_LIMITED");
  controllers[0].abort();
  await expectError(await jobs[0], 502, "AI_UPSTREAM_ERROR");
  assert.equal(calls.mock.callCount(), 4);
  t.mock.method(globalThis, "fetch", async () => completion());
  assert.equal((await POST(request({ ...input, ai: { ...config, apiKey: "test-only-body-0" } }))).status, 200);
  assert.equal((await POST(request())).status, 200);
  for (const controller of controllers.slice(1)) controller.abort();
  for (const job of jobs.slice(1)) await expectError(await job, 502, "AI_UPSTREAM_ERROR");
});

test("expiry cleanup never removes an active identity", () => {
  const first = beginByokRequest(request(), input, config);
  first.reserveAttempt();
  now += 60_000;
  const other = beginByokRequest(request(), input, { ...config, apiKey: "test-only-other-active" });
  other.release();
  assert.throws(() => beginByokRequest(request(), input, config), { code: "RATE_LIMITED" });
  first.release();
  beginByokRequest(request(), input, config).release();
});

test("even a provider echo that passes the word checker cannot return a credential", async (t) => {
  const ai = { ...config, apiKey: "12345678" };
  for (const encode of [false, true]) {
    let content = JSON.stringify({ ...story, text: "Mia found a lantern. 12345678" });
    if (encode) content = content.replace(ai.apiKey, [...ai.apiKey].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""));
    const calls = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }));
    const response = await POST(request({ ...input, ai }));
    const text = await response.clone().text();
    assert.ok(!text.includes(ai.apiKey));
    await expectError(response, 502, "INVALID_AI_OUTPUT");
    assert.equal(calls.mock.callCount(), 2);
  }
});
