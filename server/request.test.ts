import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest } from "./request.ts";

const sealed = (n = 200) => "ab".repeat(n);
const keys = { clientPubKey: "c".repeat(64), modelPubKey: "d".repeat(64) };
const ok = {
  ...keys,
  messages: [
    { role: "system", content: sealed() },
    { role: "user", content: sealed() },
  ],
};

test("passes sealed messages through and caps the reply", () => {
  const body = JSON.parse(buildRequest(ok, "m"));
  assert.equal(body.model, "m");
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[1].content, sealed());
  assert.ok(body.max_tokens <= 250);
  assert.equal(body.chat_template_kwargs.enable_thinking, false);
});

test("refuses plain text: everything must be sealed in her browser", () => {
  assert.throws(() => buildRequest({ ...ok, messages: [ok.messages[0], { role: "user", content: "my waters broke" }] }, "m"));
});

test("keeps at most the instructions plus 8 turns", () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: sealed() }));
  turns.push({ role: "user", content: sealed() });
  const body = JSON.parse(buildRequest({ ...keys, messages: [{ role: "system", content: sealed() }, ...turns] }, "m"));
  assert.ok(body.messages.length <= 9);
});

test("rejects bad shapes before any paid call", () => {
  assert.throws(() => buildRequest({ ...ok, clientPubKey: "nothex" }, "m"));
  assert.throws(() => buildRequest({ ...ok, messages: [ok.messages[1]] }, "m"));
  assert.throws(() => buildRequest({ ...ok, messages: [ok.messages[0], { role: "assistant", content: sealed() }] }, "m"));
  assert.throws(() => buildRequest({ ...ok, messages: [ok.messages[0], { role: "user", content: sealed(7000) }] }, "m"));
});
