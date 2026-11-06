import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, Guard } from "./guard.ts";

test("prices a typical reply at a fraction of a cent", () => {
  const usd = costOf("z-ai/glm-5.3-flash", 1500, 150);
  assert.ok(usd > 0.0001 && usd < 0.001, String(usd));
});

test("unknown models are priced high, never free", () => {
  assert.ok(costOf("someone/new-model", 1000, 1000) > costOf("z-ai/glm-5.3-flash", 1000, 1000) * 10);
});

test("limits each visitor per hour", () => {
  let t = 0;
  const g = new Guard({ dailyCapUsd: 1, totalCapUsd: 5, perVisitorPerHour: 2, now: () => t });
  assert.equal(g.check("a"), null);
  assert.equal(g.check("a"), null);
  assert.match(g.check("a")!, /Too many/);
  assert.equal(g.check("b"), null); // others are unaffected
  t += 3_600_001;
  assert.equal(g.check("a"), null); // the hour has passed
});

test("stops at the daily cap and resumes the next day", () => {
  let t = Date.UTC(2026, 10, 10, 9);
  const g = new Guard({ dailyCapUsd: 0.01, totalCapUsd: 5, perVisitorPerHour: 99, now: () => t });
  g.record(0.011);
  assert.match(g.check("a")!, /today's limit/);
  t += 86_400_000;
  assert.equal(g.check("a"), null);
});

test("stops for good at the all-time cap", () => {
  let t = Date.UTC(2026, 10, 10, 9);
  const g = new Guard({ dailyCapUsd: 1, totalCapUsd: 0.02, perVisitorPerHour: 99, now: () => t });
  g.record(0.015);
  t += 86_400_000;
  g.record(0.006);
  t += 86_400_000;
  assert.match(g.check("a")!, /budget is used up/);
});
