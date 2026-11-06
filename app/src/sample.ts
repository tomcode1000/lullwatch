// Fictional sample labour so judges can try the app without real data.
// Early labour, getting closer: gaps shrink from about 14 to 6 minutes over
// three hours, ending a few minutes before "now".

import type { Contraction } from "./engine/labour";

const MIN = 60_000;

export function sampleLabour(now: number): Contraction[] {
  const gaps = [14, 13, 13, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 7, 6, 6];
  const lengths = [35, 40, 40, 45, 45, 50, 50, 50, 55, 55, 60, 60, 60, 65, 60, 65, 70, 65];
  const total = gaps.reduce((a, b) => a + b, 0);
  let t = now - (total + 3) * MIN;
  const out: Contraction[] = [];
  for (let i = 0; i < lengths.length; i++) {
    out.push({ start: t, end: t + lengths[i] * 1000 });
    if (i < gaps.length) t += gaps[i] * MIN;
  }
  return out;
}
