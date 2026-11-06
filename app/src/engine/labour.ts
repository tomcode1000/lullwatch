// The labour engine: fixed rules, no AI. It decides "wait", "pack", "leave" or
// "go now". The AI only talks about what this decides; it never overrides it.

export type Contraction = { start: number; end: number }; // epoch ms

// "Go when contractions are X minutes apart, last Y seconds, for Z minutes."
// The defaults are common guidance; the user should set what her midwife said.
export type GoRule = { intervalMin: number; durationSec: number; sustainMin: number };

export const FIRST_BABY_RULE: GoRule = { intervalMin: 5, durationSec: 60, sustainMin: 60 };
export const LATER_BABY_RULE: GoRule = { intervalMin: 7, durationSec: 60, sustainMin: 60 };

export type Settings = { rule: GoRule; travelMin: number };

// Signs that mean go or call now, whatever the count says.
export const RED_FLAGS = {
  waters: "Waters broke or leaking fluid",
  bleeding: "Bleeding from the vagina",
  movement: "Baby moving less than usual",
  pain: "Severe pain that doesn't stop between contractions",
  headache: "Bad headache, blurred vision or sudden swelling",
  fever: "Fever or feeling very unwell",
} as const;
export type RedFlag = keyof typeof RED_FLAGS;

export type Stage = "waiting" | "pack" | "leave" | "go-now";

export type Advice = {
  stage: Stage;
  reason: string;
  medianIntervalMin: number | null;
  medianDurationSec: number | null;
  ruleMetAt: number | null; // when the rule was or will be met
  leaveBy: number | null;
  flags: RedFlag[];
};

const MIN = 60_000;
const PACK_LEAD_MIN = 120; // say "start packing" this long before leave-by
const FIT_WINDOW = 8; // contractions used for the trend

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Start-to-start gaps in minutes, as midwives count them.
export function intervalsMin(cs: Contraction[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < cs.length; i++) out.push((cs[i].start - cs[i - 1].start) / MIN);
  return out;
}

export function durationsSec(cs: Contraction[]): number[] {
  return cs.map((c) => (c.end - c.start) / 1000);
}

function meetsRule(prev: Contraction, c: Contraction, rule: GoRule): boolean {
  return (
    (c.start - prev.start) / MIN <= rule.intervalMin &&
    (c.end - c.start) / 1000 >= rule.durationSec
  );
}

// When the current run of rule-meeting contractions began, or null if the
// latest contraction doesn't meet the rule. One short or spaced-out
// contraction breaks the run, which is the cautious reading.
export function streakStart(cs: Contraction[], rule: GoRule): number | null {
  let i = cs.length - 1;
  if (i < 1 || !meetsRule(cs[i - 1], cs[i], rule)) return null;
  while (i >= 2 && meetsRule(cs[i - 2], cs[i - 1], rule)) i--;
  return cs[i - 1].start;
}

// Least-squares line through (start time, gap to next) for recent
// contractions, solved for when the gap reaches the rule's interval.
export function forecastIntervalReached(cs: Contraction[], rule: GoRule): number | null {
  const recent = cs.slice(-FIT_WINDOW);
  if (recent.length < 4) return null;
  const xs = recent.slice(1).map((c) => c.start / MIN);
  const ys = intervalsMin(recent);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx; // minutes of gap per minute of time
  if (slope >= 0) return null; // not getting closer together: no forecast
  const t = mx + (rule.intervalMin - my) / slope;
  return Math.round(t * MIN);
}

export function advise(
  cs: Contraction[],
  settings: Settings,
  flags: RedFlag[],
  now: number,
): Advice {
  const { rule, travelMin } = settings;
  const sorted = [...cs].sort((a, b) => a.start - b.start);
  const recent = sorted.slice(-FIT_WINDOW);
  const base = {
    medianIntervalMin: median(intervalsMin(recent)),
    medianDurationSec: median(durationsSec(recent)),
    flags,
  };

  if (flags.length > 0) {
    return {
      ...base,
      stage: "go-now",
      reason: `Warning sign: ${RED_FLAGS[flags[0]]}. Go to the hospital or call now.`,
      ruleMetAt: null,
      leaveBy: now,
    };
  }

  // Rule met, or on track to be met, by the current run.
  const streak = streakStart(sorted, rule);
  let ruleMetAt: number | null = streak === null ? null : streak + rule.sustainMin * MIN;
  if (ruleMetAt === null) {
    const reached = forecastIntervalReached(sorted, rule);
    if (reached !== null) ruleMetAt = Math.max(reached, now) + rule.sustainMin * MIN;
  }

  if (ruleMetAt === null) {
    return {
      ...base,
      stage: "waiting",
      reason:
        sorted.length < 4
          ? "Keep timing. A few more contractions are needed to see a pattern."
          : "Contractions aren't getting closer together yet. Keep timing and rest.",
      ruleMetAt: null,
      leaveBy: null,
    };
  }

  // Leave early enough to arrive by the time the rule is met.
  const leaveBy = ruleMetAt - travelMin * MIN;
  if (now >= leaveBy) {
    return { ...base, stage: "leave", reason: "It's time to leave for the hospital.", ruleMetAt, leaveBy };
  }
  if (now >= leaveBy - PACK_LEAD_MIN * MIN) {
    return { ...base, stage: "pack", reason: "Your contractions are closing in on your midwife's rule. Get your bag ready.", ruleMetAt, leaveBy };
  }
  return {
    ...base,
    stage: "waiting",
    reason: "Contractions are getting closer. Keep timing; there's time yet.",
    ruleMetAt,
    leaveBy,
  };
}
