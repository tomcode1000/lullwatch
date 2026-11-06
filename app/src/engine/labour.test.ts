import { describe, expect, it } from "vitest";
import {
  advise,
  FIRST_BABY_RULE,
  forecastIntervalReached,
  streakStart,
  type Contraction,
  type Settings,
} from "./labour";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 10, 12, 0);

// Contractions starting at the given minutes after T0, each lasting `sec`.
function series(startsMin: number[], sec = 60): Contraction[] {
  return startsMin.map((m) => ({ start: T0 + m * MIN, end: T0 + m * MIN + sec * 1000 }));
}

// Evenly spaced contractions from `fromMin`, every `every` minutes, `count` of them.
function even(fromMin: number, every: number, count: number, sec = 60): Contraction[] {
  return series(Array.from({ length: count }, (_, i) => fromMin + i * every), sec);
}

const settings: Settings = { rule: FIRST_BABY_RULE, travelMin: 30 };

describe("advise", () => {
  it("waits until there is a pattern", () => {
    const a = advise(series([0, 12]), settings, [], T0 + 13 * MIN);
    expect(a.stage).toBe("waiting");
    expect(a.leaveBy).toBeNull();
  });

  it("any warning sign means go now, whatever the count", () => {
    const a = advise(series([0, 20]), settings, ["bleeding"], T0 + 21 * MIN);
    expect(a.stage).toBe("go-now");
    expect(a.reason).toMatch(/Bleeding/);
  });

  it("does not forecast when contractions are not getting closer", () => {
    const a = advise(even(0, 15, 6), settings, [], T0 + 80 * MIN);
    expect(a.stage).toBe("waiting");
    expect(a.ruleMetAt).toBeNull();
  });

  it("says leave once 5-1-1 has held long enough, minus travel time", () => {
    // Every 4 minutes for 40 minutes: the run began at 0, so the rule is met
    // at 60 and she should leave at 30 with a 30-minute drive.
    const cs = even(0, 4, 11);
    const a = advise(cs, settings, [], T0 + 41 * MIN);
    expect(a.ruleMetAt).toBe(T0 + 60 * MIN);
    expect(a.leaveBy).toBe(T0 + 30 * MIN);
    expect(a.stage).toBe("leave");
  });

  it("a longer drive moves leave-by earlier", () => {
    const cs = even(0, 4, 4);
    const near = advise(cs, { ...settings, travelMin: 10 }, [], T0 + 13 * MIN);
    const far = advise(cs, { ...settings, travelMin: 45 }, [], T0 + 13 * MIN);
    expect(near.leaveBy! - far.leaveBy!).toBe(35 * MIN);
    expect(near.stage).toBe("pack");
    expect(far.stage).toBe("pack");
  });

  it("short contractions do not count toward the rule", () => {
    const a = advise(even(0, 4, 11, 30), settings, [], T0 + 41 * MIN);
    expect(a.stage).not.toBe("leave");
  });

  it("forecasts from a closing trend and says pack ahead of time", () => {
    // Gaps shrink 12, 11, 10, 9, 8, 7: about 1 minute closer each time.
    const cs = series([0, 12, 23, 33, 42, 50, 57]);
    const a = advise(cs, settings, [], T0 + 58 * MIN);
    expect(a.ruleMetAt).not.toBeNull();
    expect(a.ruleMetAt!).toBeGreaterThan(T0 + 58 * MIN);
    expect(a.stage).toBe("pack");
  });
});

describe("streakStart", () => {
  it("one spaced-out contraction breaks the run", () => {
    const cs = series([0, 4, 8, 20, 24, 28]);
    expect(streakStart(cs, FIRST_BABY_RULE)).toBe(T0 + 20 * MIN);
  });
});

describe("forecastIntervalReached", () => {
  it("projects when gaps reach 5 minutes", () => {
    const cs = series([0, 10, 19, 27, 34]); // gaps 10, 9, 8, 7
    const t = forecastIntervalReached(cs, FIRST_BABY_RULE)!;
    // Gap falls ~1 min per ~8 min of time; reaching 5 is roughly 15 min on.
    expect((t - T0) / MIN).toBeGreaterThan(40);
    expect((t - T0) / MIN).toBeLessThan(60);
  });
});
