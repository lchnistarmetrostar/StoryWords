import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/lesson/route.ts";
import { TARGET_WORDS } from "../src/data/vocabulary.ts";

const origin = "http://127.0.0.1:3001";
const input = { profile: { level: "A2", genre: "mystery" }, mode: "ai", learnedWordIds: [], previousEpisode: null };
const headers = { Host: "127.0.0.1:3001", Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" };
const story = { title: "The House", text: "Mia found a lantern in the house." };
const completion = (value = story) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
const request = (body: unknown = input, overrides: Record<string, string> = {}) => new Request(origin + "/api/lesson", {
  method: "POST", headers: { ...headers, ...overrides }, body: JSON.stringify(body),
});

test("local AI demo enforces browser origin, actual-attempt quotas and generation isolation", { timeout: 5000 }, async (t) => {
  process.env.STORYWORDS_LOCAL_AI_DEMO = "1";
  process.env.STORYWORDS_AI_OUTPUT_LIMIT = "max_tokens";
  process.env.AI_BASE_URL = "https://example.invalid/v1";
  process.env.AI_MODEL = "test-model";
  process.env.AI_API_KEY = "test-only-secret-never-return";
  let now = 1000;
  let calls = 0;
  let handler: () => Promise<Response> = async () => completion();
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    calls++;
    assert.equal(JSON.parse(init!.body as string).max_tokens, 2048);
    return handler();
  });
  async function expectError(response: Response, status: number, code: string) {
    assert.equal(response.status, status);
    const data = await response.json();
    assert.equal(data.error.code, code);
    assert.equal(data.source, undefined);
    assert.doesNotMatch(JSON.stringify(data), /test-only-secret|example\.invalid|raw-upstream/);
  }

  await t.test("missing, foreign and null Origin, wrong Host and simple form requests never call the provider", async () => {
    const rejectedHeaders: Record<string, string>[] = [
      { Origin: "" }, { Origin: "null" }, { Origin: "https://attacker.invalid" },
      { Host: "attacker.invalid" }, { Host: "127.0.0.1:3000" },
      { "Content-Type": "text/plain" }, { "Content-Type": "application/x-www-form-urlencoded" },
      { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" },
    ];
    for (const overrides of rejectedHeaders) await expectError(await POST(request(input, overrides)), 400, "INVALID_REQUEST");
    assert.equal(calls, 0);
  });
  await t.test("valid same-origin AI retains the success contract and bounds output", async () => {
    const response = await POST(request());
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source, "ai");
    assert.deepEqual(data.story, story);
    assert.equal(calls, 1);
  });
  await t.test("failed supplier calls consume quota, release the lock and never become Demo", async () => {
    handler = async () => new Response("raw-upstream test-only-secret-never-return", { status: 503 });
    await expectError(await POST(request()), 502, "AI_UPSTREAM_ERROR");
    assert.equal(calls, 2);
  });
  await t.test("a second generation is rejected while the first response is pending", async () => {
    let started!: () => void;
    let finish!: (response: Response) => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    handler = () => new Promise<Response>(resolve => { finish = resolve; started(); });
    const pending = POST(request());
    await ready;
    await expectError(await POST(request()), 429, "RATE_LIMITED");
    assert.equal(calls, 3);
    finish(completion());
    assert.equal((await pending).status, 200);
    handler = async () => completion();
    assert.equal((await POST(request())).status, 200);
    assert.equal(calls, 4);
  });
  await t.test("fifth actual attempt is blocked until the exact rolling 60-second boundary", async () => {
    await expectError(await POST(request()), 429, "RATE_LIMITED");
    now += 59_999;
    await expectError(await POST(request()), 429, "RATE_LIMITED");
    assert.equal(calls, 4);
    now++;
    assert.equal((await POST(request())).status, 200);
    assert.equal(calls, 5);
  });
  await t.test("the automatic correction retry counts as a separate supplier request", async () => {
    handler = async () => calls === 6 ? completion({ title: "The House", text: "A lantern and a zeppelin." }) : completion();
    assert.equal((await POST(request())).status, 200);
    assert.equal(calls, 7);
    handler = async () => completion({ title: "The House", text: "A lantern and a zeppelin." });
    await expectError(await POST(request()), 429, "RATE_LIMITED");
    assert.equal(calls, 8, "the retry must be blocked before a fifth request is sent");
  });
  await t.test("ten actual supplier requests exhaust the session even after the rolling window expires", async () => {
    now += 60_000;
    handler = async () => calls === 9 ? completion({ title: "The House", text: "A lantern and a zeppelin." }) : completion();
    assert.equal((await POST(request())).status, 200);
    assert.equal(calls, 10);
    now += 60_000;
    await expectError(await POST(request()), 429, "RATE_LIMITED");
    assert.equal(calls, 10);
  });
  await t.test("Demo and completed progress require no paid request after exhaustion", async () => {
    const demo = await POST(request({ ...input, mode: "demo" }));
    assert.equal(demo.status, 200);
    assert.equal((await demo.json()).source, "demo");
    const done = await POST(request({ ...input, learnedWordIds: TARGET_WORDS.map(word => word.id), previousEpisode: {
      lessonId: "last", source: "ai", wordId: "treasure", title: "The House", text: "Mia found treasure in the house.",
    } }));
    assert.equal(done.status, 200);
    assert.deepEqual(await done.json(), { status: "completed" });
    assert.equal(calls, 10);
  });
});
