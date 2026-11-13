// What to say when she phones the maternity unit. The sealed AI writes it from
// the timer's numbers; plain code then checks that every number it used is one
// the timer gave it. If not, or if the AI isn't reachable, a fixed template
// built on this phone is used instead.

import { RED_FLAGS, type Advice, type Contraction, type RedFlag } from "./engine/labour";

export const CALL_REQUEST =
  "Write exactly what I should say when I phone the maternity unit, in the first person, in 2 or 3 short sentences. " +
  "Use only the facts in TIMER and CALL FACTS: which baby this is, how far apart the contractions are, how long they last, " +
  "how long I've been timing them, and any warning signs. Don't add anything that isn't there, such as weeks of pregnancy " +
  "or whether my waters have broken unless it's listed. No greeting, no advice, no quotation marks.";

export type CallFacts = { firstBaby: boolean; apartMin: number | null; lastingSec: number | null; timingMin: number; count: number; flags: RedFlag[] };

export function callFacts(contractions: Contraction[], advice: Advice, firstBaby: boolean): CallFacts {
  const first = contractions[0]?.start ?? 0;
  const last = contractions[contractions.length - 1]?.end ?? first;
  return {
    firstBaby,
    apartMin: advice.medianIntervalMin === null ? null : Math.round(advice.medianIntervalMin),
    lastingSec: advice.medianDurationSec === null ? null : Math.round(advice.medianDurationSec / 5) * 5,
    timingMin: Math.round((last - first) / 60_000),
    count: contractions.length,
    flags: advice.flags,
  };
}

function duration(min: number): string {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 15) * 15;
  const hours = h === 1 ? "an hour" : `${h} hours`;
  return m === 0 ? hours : m === 60 ? `${h + 1} hours` : `${hours} and ${m} minutes`;
}

export function factsText(f: CallFacts): string {
  return [
    `Baby: ${f.firstBaby ? "first" : "second or later"}.`,
    f.apartMin !== null && `Contractions about ${f.apartMin} minutes apart.`,
    f.lastingSec !== null && `Each lasting about ${f.lastingSec} seconds.`,
    `Timing them for ${duration(f.timingMin)} (${f.count} contractions).`,
    f.flags.length ? `Warning signs: ${f.flags.map((x) => RED_FLAGS[x]).join("; ")}.` : "No warning signs marked.",
  ]
    .filter(Boolean)
    .join("\n");
}

// The fallback, and the reference the AI's version is checked against.
export function templateScript(f: CallFacts): string {
  const parts = [`This is my ${f.firstBaby ? "first" : "second"} baby.`];
  if (f.apartMin !== null && f.lastingSec !== null) {
    parts.push(
      `My contractions are about ${f.apartMin} minutes apart, each lasting about ${f.lastingSec} seconds, and I've been timing them for ${duration(f.timingMin)}.`,
    );
  }
  if (f.flags.length) parts.push(`I also have: ${f.flags.map((x) => RED_FLAGS[x].toLowerCase()).join("; ")}.`);
  return parts.join(" ");
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// Every number in the script must be one the facts contain (an hour = 60 min,
// so "an hour and a half" style wording is allowed only via digits we gave).
export function numbersCheck(script: string, f: CallFacts): boolean {
  const allowed = new Set<number>([1, 2]); // "first", "second", "an hour", "1 hour"
  for (const n of [f.apartMin, f.lastingSec, f.timingMin, f.count]) if (n !== null) allowed.add(n);
  const h = Math.floor(f.timingMin / 60);
  const m = Math.round((f.timingMin % 60) / 15) * 15;
  [h, m, h + 1, f.timingMin % 60].forEach((n) => allowed.add(n));
  const found = [
    ...(script.match(/\d+(\.\d+)?/g) ?? []).map(Number),
    ...(script.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g) ?? []).map((w) => WORD_NUMBERS[w]),
  ];
  if (!found.every((n) => allowed.has(Math.round(n)))) return false;
  // Facts the timer doesn't know must not appear unless she marked them.
  const t = script.toLowerCase();
  if (/\bweeks?\b/.test(t)) return false;
  if (/\bwaters?\b/.test(t) && !f.flags.includes("waters")) return false;
  if (/\bbleed/.test(t) && !f.flags.includes("bleeding")) return false;
  return script.trim().length > 20;
}
