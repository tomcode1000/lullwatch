// Everything she records stays in this browser. Nothing here is sent anywhere.

import { FIRST_BABY_RULE, LATER_BABY_RULE, type Contraction, type GoRule, type RedFlag } from "./engine/labour";

export type Profile = {
  firstBaby: boolean;
  travelMin: number;
  hospital: string;
  rule: GoRule; // what her midwife told her; defaults follow firstBaby
  partnerName?: string;
  partnerPhone?: string; // texted from her own phone, never from our server
  midwifePhone?: string;
};

export type State = {
  profile: Profile | null; // null until set up
  contractions: Contraction[];
  running: number | null; // start time of a contraction in progress
  flags: RedFlag[];
  sample: boolean; // showing fictional sample data
};

const KEY = "lullwatch:v1";

export const defaultProfile = (firstBaby: boolean): Profile => ({
  firstBaby,
  travelMin: 30,
  hospital: "",
  rule: firstBaby ? FIRST_BABY_RULE : LATER_BABY_RULE,
});

export const emptyState: State = { profile: null, contractions: [], running: null, flags: [], sample: false };

export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyState, ...JSON.parse(raw) } : emptyState;
  } catch {
    return emptyState;
  }
}

export function save(s: State): void {
  try {
    if (s.sample) return; // never keep sample data
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode or storage blocked: the app still works for this session
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}
