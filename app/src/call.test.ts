import { describe, expect, it } from "vitest";
import { numbersCheck, templateScript, type CallFacts } from "./call";

const f: CallFacts = { firstBaby: true, apartMin: 5, lastingSec: 60, timingMin: 75, count: 14, flags: [] };

describe("call script", () => {
  it("template uses only the timer's facts", () => {
    const s = templateScript(f);
    expect(s).toContain("first baby");
    expect(s).toContain("5 minutes apart");
    expect(s).toContain("60 seconds");
    expect(s).toContain("an hour and 15 minutes");
    expect(numbersCheck(s, f)).toBe(true);
  });

  it("accepts a faithful AI version", () => {
    expect(numbersCheck("It's my first baby. My contractions are five minutes apart and last about 60 seconds. I've timed them for about an hour.", f)).toBe(true);
  });

  it("rejects invented numbers or facts", () => {
    expect(numbersCheck("My contractions are 3 minutes apart and last 60 seconds.", f)).toBe(false);
    expect(numbersCheck("I'm 39 weeks pregnant and my contractions are 5 minutes apart.", f)).toBe(false);
    expect(numbersCheck("My waters haven't broken and contractions are 5 minutes apart.", f)).toBe(false);
    expect(numbersCheck("My waters broke and contractions are 5 minutes apart.", { ...f, flags: ["waters"] })).toBe(true);
  });

  it("names warning signs", () => {
    expect(templateScript({ ...f, flags: ["bleeding"] })).toContain("bleeding from the vagina");
  });
});
