// Keeps the $10 of NEAR AI Cloud credit safe: per-visitor rate limits, a daily
// spending cap and an all-time cap. It records only token counts and dollars,
// never what anyone said.

import { readFileSync, writeFileSync } from "node:fs";

// Dollars per token, from https://cloud-api.near.ai/v1/models (5 Nov 2026).
export const PRICES: Record<string, { input: number; output: number }> = {
  "z-ai/glm-5.3-flash": { input: 0.08e-6, output: 0.5e-6 },
  "Qwen/Qwen3.8-27B": { input: 0.04e-6, output: 1.35e-6 },
  "openai/whisper-large-v3": { input: 0.01e-6, output: 0.01e-6 },
};

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  // Unknown model: assume an expensive one rather than free.
  if (!p) return inputTokens * 5e-6 + outputTokens * 25e-6;
  return inputTokens * p.input + outputTokens * p.output;
}

type Ledger = { day: string; dayUsd: number; totalUsd: number; calls: number };

export type GuardOptions = {
  dailyCapUsd: number;
  totalCapUsd: number;
  perVisitorPerHour: number;
  ledgerFile?: string;
  now?: () => number;
};

export class Guard {
  private opts: GuardOptions;
  private ledger: Ledger;
  private hits = new Map<string, number[]>();

  // Node runs this file with type stripping only, so no parameter properties.
  constructor(opts: GuardOptions) {
    this.opts = opts;
    this.ledger = this.read();
  }

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private today() {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private read(): Ledger {
    const fresh = { day: this.today(), dayUsd: 0, totalUsd: 0, calls: 0 };
    if (!this.opts.ledgerFile) return fresh;
    try {
      return { ...fresh, ...JSON.parse(readFileSync(this.opts.ledgerFile, "utf8")) };
    } catch {
      return fresh;
    }
  }

  private write() {
    if (!this.opts.ledgerFile) return;
    try {
      writeFileSync(this.opts.ledgerFile, JSON.stringify(this.ledger));
    } catch {
      // a read-only disk must not stop the app; the in-memory caps still apply
    }
  }

  private rollDay() {
    const d = this.today();
    if (this.ledger.day !== d) this.ledger = { ...this.ledger, day: d, dayUsd: 0 };
  }

  // Call before a paid request. Returns a reason to refuse, or null to go ahead.
  check(visitor: string): string | null {
    this.rollDay();
    if (this.ledger.totalUsd >= this.opts.totalCapUsd) return "The AI is switched off: the credit budget is used up.";
    if (this.ledger.dayUsd >= this.opts.dailyCapUsd) return "The AI has reached today's limit. The timer still works.";
    const hourAgo = this.now() - 3_600_000;
    const recent = (this.hits.get(visitor) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= this.opts.perVisitorPerHour) return "Too many questions this hour. The timer still works.";
    recent.push(this.now());
    this.hits.set(visitor, recent);
    return null;
  }

  // Call after a paid request with what it actually cost.
  record(usd: number) {
    this.rollDay();
    this.ledger.dayUsd += usd;
    this.ledger.totalUsd += usd;
    this.ledger.calls += 1;
    this.write();
  }

  status() {
    this.rollDay();
    return { ...this.ledger, dailyCapUsd: this.opts.dailyCapUsd, totalCapUsd: this.opts.totalCapUsd };
  }
}
