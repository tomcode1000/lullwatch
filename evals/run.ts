// Runs every case once against a running Lullwatch server, verifies each
// reply exactly as the app does, and writes evals/results.md.
//
//   cd server && npm run dev        (in another terminal)
//   node evals/run.ts               (costs about half a cent)

import { writeFileSync } from "node:fs";
import { CASES } from "./cases.ts";
import { checkAttestation, checkReply, newNonce, replyText } from "../app/src/verify.ts";

const BASE = process.env.LULLWATCH_URL ?? "http://localhost:8787";
const MAX_WORDS = 70;

async function post(path: string, body: unknown) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? r.status);
  return data;
}

const nonce = newNonce();
const attestation = await post("/api/attest", { nonce });
const attested = checkAttestation(attestation, nonce).every((c) => c.pass);
console.log(`attestation ${attested ? "verified" : "FAILED"}`);

const rows: string[] = [];
let passed = 0;
for (const c of CASES) {
  let signed;
  try {
    signed = await post("/api/chat", { context: c.context, messages: [{ role: "user", content: c.question }] });
  } catch (e) {
    // A network failure isn't the model's fault; report it and move on.
    console.log(`SKIP ${c.id}: ${(e as Error).message}`);
    rows.push(`| – | ${c.id} | ${c.question} | | not run: ${(e as Error).message} |`);
    continue;
  }
  const reply = replyText(signed);
  const problems: string[] = [];
  if (!checkReply(signed, attestation).every((x) => x.pass)) problems.push("verification failed");
  const words = reply.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) problems.push(`${words} words`);
  for (const re of c.expect.mention ?? []) if (!re.test(reply)) problems.push(`missing ${re}`);
  for (const re of c.expect.avoid ?? []) if (re.test(reply)) problems.push(`said ${re}`);
  // Every clock time it mentions must come from the timer.
  for (const t of reply.match(/\b\d{1,2}:\d{2}\b/g) ?? []) if (!c.context.includes(t)) problems.push(`invented time ${t}`);
  const ok = problems.length === 0;
  passed += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id}${ok ? "" : ": " + problems.join("; ")}`);
  rows.push(`| ${ok ? "✓" : "✗"} | ${c.id} | ${c.question} | ${reply.replace(/\|/g, "/").replace(/\n/g, " ")} | ${problems.join("; ")} |`);
}

const health = await (await fetch(BASE + "/api/health")).json();
const summary = `${passed}/${CASES.length} passed · attestation ${attested ? "verified" : "failed"} · total spend so far $${health.totalUsd.toFixed(5)}`;
console.log(summary);
writeFileSync(
  new URL("./results.md", import.meta.url),
  `# Companion eval\n\nModel: ${health.model}. ${summary}.\n\n| | Case | Question | Reply | Problems |\n|---|---|---|---|---|\n${rows.join("\n")}\n`,
);
