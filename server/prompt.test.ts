import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest } from "./prompt.ts";

const ok = { messages: [{ role: "user" as const, content: "How long do I have?" }], context: "Stage: pack" };

test("puts the timer's decision in the system prompt and caps the reply", () => {
  const body = JSON.parse(buildRequest(ok, "m"));
  assert.equal(body.model, "m");
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /TIMER:\nStage: pack/);
  assert.ok(body.max_tokens <= 250);
});

test("keeps only the last 8 messages", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
    content: `m${i}`,
  }));
  many.push({ role: "user", content: "last" });
  const body = JSON.parse(buildRequest({ messages: many, context: "" }, "m"));
  assert.equal(body.messages.length, 9); // system + 8
  assert.equal(body.messages.at(-1).content, "last");
});

test("rejects oversized or malformed input before any paid call", () => {
  assert.throws(() => buildRequest({ messages: [{ role: "user", content: "x".repeat(801) }], context: "" }, "m"));
  assert.throws(() => buildRequest({ messages: [{ role: "system" as "user", content: "hi" }], context: "" }, "m"));
  assert.throws(() => buildRequest({ messages: [{ role: "assistant", content: "hi" }], context: "" }, "m"));
  assert.throws(() => buildRequest({ messages: [], context: "x".repeat(1201) }, "m"));
});
