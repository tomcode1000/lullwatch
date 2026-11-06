import { expect, it } from "vitest";
import { advise, FIRST_BABY_RULE } from "./engine/labour";
import { sampleLabour } from "./sample";

it("sample labour shows a leave-by time and says pack", () => {
  const now = Date.UTC(2026, 10, 10, 18, 0);
  const a = advise(sampleLabour(now), { rule: FIRST_BABY_RULE, travelMin: 30 }, [], now);
  expect(a.stage).toBe("pack");
  expect(a.leaveBy).not.toBeNull();
});
