import { describe, expect, it } from "vitest";
import type { Advice } from "./engine/labour";
import { partnerMessage, smsLink, telLink } from "./contact";

const base: Advice = { stage: "waiting", reason: "", medianIntervalMin: 7, medianDurationSec: 60, ruleMetAt: null, leaveBy: null, flags: [] };
const NOW = Date.UTC(2026, 10, 10, 20, 0);

describe("partnerMessage", () => {
  it("says nothing while she's only timing", () => {
    expect(partnerMessage(base, "St Mary's", NOW)).toBeNull();
  });

  it("gives the leave-by time when packing", () => {
    const m = partnerMessage({ ...base, stage: "pack", leaveBy: NOW + 45 * 60_000 }, "St Mary's", NOW)!;
    expect(m).toMatch(/St Mary's/);
    expect(m).toMatch(/\d{1,2}:\d{2}/);
  });

  it("is urgent when it's time to leave or go now", () => {
    expect(partnerMessage({ ...base, stage: "leave" }, "", NOW)).toMatch(/time to leave for the hospital/);
    expect(partnerMessage({ ...base, stage: "go-now" }, "", NOW)).toMatch(/now/);
  });

  it("never includes her health details, only where and when", () => {
    const m = partnerMessage({ ...base, stage: "go-now", flags: ["bleeding"] }, "St Mary's", NOW)!;
    expect(m).not.toMatch(/bleed|waters|contraction lasting/i);
  });
});

describe("links", () => {
  it("builds sms and tel links her phone understands", () => {
    expect(smsLink("+44 7700 900123", "Time to go & now")).toBe("sms:+447700900123?&body=Time%20to%20go%20%26%20now");
    expect(telLink("(020) 7946-0000")).toBe("tel:02079460000");
  });
});
