// Realistic labours, with the messiness of real timing: uneven gaps, uneven
// lengths, missed taps, and false labour. Seeded, so every run is the same.

import { describe, expect, it } from "vitest";
import { advise, FIRST_BABY_RULE, LATER_BABY_RULE, type Contraction, type GoRule } from "./labour";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 10, 20, 0);

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

// Contractions whose gap and length drift from `from` to `to` over `count`
// contractions, with +/- `jitter` fraction of noise.
function labour(o: {
  count: number;
  gap: [number, number]; // minutes
  length: [number, number]; // seconds
  jitter?: number;
  seed?: number;
  startMin?: number;
}): Contraction[] {
  const r = rng(o.seed ?? 1);
  const j = o.jitter ?? 0.15;
  const out: Contraction[] = [];
  let t = T0 + (o.startMin ?? 0) * MIN;
  for (let i = 0; i < o.count; i++) {
    const f = o.count === 1 ? 1 : i / (o.count - 1);
    const len = (o.length[0] + (o.length[1] - o.length[0]) * f) * (1 + (r() * 2 - 1) * j);
    out.push({ start: t, end: t + len * 1000 });
    const gap = (o.gap[0] + (o.gap[1] - o.gap[0]) * f) * (1 + (r() * 2 - 1) * j);
    t += gap * MIN;
  }
  return out;
}

const after = (cs: Contraction[], min = 1) => cs[cs.length - 1].start + min * MIN;
const run = (cs: Contraction[], rule: GoRule = FIRST_BABY_RULE, travelMin = 30, now = after(cs)) =>
  advise(cs, { rule, travelMin }, [], now);

describe("false labour (Braxton Hicks)", () => {
  it.each([1, 2, 3, 4, 5])("irregular, short, not closing in: keep timing, no leave time (seed %i)", (seed) => {
    const r = rng(seed);
    const cs: Contraction[] = [];
    let t = T0;
    for (let i = 0; i < 10; i++) {
      cs.push({ start: t, end: t + (20 + r() * 25) * 1000 });
      t += (8 + r() * 20) * MIN;
    }
    const a = run(cs);
    expect(a.stage).toBe("waiting");
    expect(a.ruleMetAt === null || a.ruleMetAt - after(cs) > 3 * 60 * MIN).toBe(true);
  });
});

describe("early labour that stalls", () => {
  it("closing in, then spreading out again: no leave time", () => {
    const closing = labour({ count: 8, gap: [15, 8], length: [40, 50], seed: 7 });
    const spreading = labour({ count: 5, gap: [12, 18], length: [40, 35], seed: 8, startMin: (after(closing, 10) - T0) / MIN });
    const a = run([...closing, ...spreading]);
    expect(a.stage).toBe("waiting");
    expect(a.leaveBy).toBeNull();
  });
});

describe("active labour, first baby, 5-1-1", () => {
  it.each([11, 12, 13, 14, 15])("uneven 4-6 min gaps for over an hour still says leave (seed %i)", (seed) => {
    const cs = labour({ count: 16, gap: [5, 4.5], length: [60, 70], jitter: 0.18, seed });
    const a = run(cs);
    expect(a.stage).toBe("leave");
  });

  it("the same pattern for only 20 minutes says pack, not leave, with a 15-minute drive", () => {
    const cs = labour({ count: 5, gap: [4.5, 4.5], length: [65, 65], jitter: 0, seed: 3 });
    const a = run(cs, FIRST_BABY_RULE, 15);
    expect(a.stage).toBe("pack");
    expect(a.leaveBy).not.toBeNull();
  });

  it("one missed tap (a 9-minute gap) doesn't restart the hour", () => {
    const cs = labour({ count: 16, gap: [4.5, 4.5], length: [65, 65], jitter: 0, seed: 1 });
    cs.splice(8, 1); // she missed one
    const full = run(labour({ count: 16, gap: [4.5, 4.5], length: [65, 65], jitter: 0, seed: 1 }));
    const missed = run(cs);
    expect(missed.ruleMetAt).toBe(full.ruleMetAt);
    expect(missed.stage).toBe("leave");
  });

  it("one contraction stopped early by mistake doesn't restart the hour", () => {
    const cs = labour({ count: 16, gap: [4.5, 4.5], length: [65, 65], jitter: 0, seed: 1 });
    cs[9] = { start: cs[9].start, end: cs[9].start + 15_000 };
    expect(run(cs).stage).toBe("leave");
  });

  it("a long pause (she fell asleep) starts a fresh hour", () => {
    const before = labour({ count: 10, gap: [4.5, 4.5], length: [65, 65], jitter: 0 });
    const resumed = labour({ count: 4, gap: [4.5, 4.5], length: [65, 65], jitter: 0, startMin: (after(before, 40) - T0) / MIN });
    const cs = [...before, ...resumed];
    const a = run(cs);
    expect(a.ruleMetAt).toBe(resumed[0].start + 60 * MIN);
  });
});

describe("second baby, 7-1-1", () => {
  it("a fast labour reaches leave sooner than the first-baby rule would", () => {
    const cs = labour({ count: 9, gap: [9, 6], length: [55, 65], jitter: 0.1, seed: 21 });
    const later = run(cs, LATER_BABY_RULE, 25);
    const first = run(cs, FIRST_BABY_RULE, 25);
    expect(later.leaveBy).not.toBeNull();
    expect(first.leaveBy === null || later.leaveBy! < first.leaveBy).toBe(true);
    expect(["pack", "leave"]).toContain(later.stage);
  });
});

describe("leave-by always allows for the journey", () => {
  it.each([10, 30, 60, 90])("journey of %i min: leave-by is that long before the rule is met", (travel) => {
    const cs = labour({ count: 6, gap: [5, 4.5], length: [65, 65], jitter: 0.05, seed: 4 });
    const a = run(cs, FIRST_BABY_RULE, travel);
    expect(a.ruleMetAt! - a.leaveBy!).toBe(travel * MIN);
  });

  it("a long journey can mean leave now even before the rule is met", () => {
    const cs = labour({ count: 6, gap: [5, 4.5], length: [65, 65], jitter: 0, seed: 4 });
    const a = run(cs, FIRST_BABY_RULE, 90);
    expect(a.ruleMetAt!).toBeGreaterThan(after(cs));
    expect(a.stage).toBe("leave");
  });
});

describe("warning signs override everything", () => {
  it.each(["waters", "bleeding", "movement", "pain", "headache", "fever"] as const)("%s means go now, even in false labour", (flag) => {
    const cs = labour({ count: 4, gap: [20, 20], length: [30, 30] });
    expect(advise(cs, { rule: FIRST_BABY_RULE, travelMin: 30 }, [flag], after(cs)).stage).toBe("go-now");
  });
});
