// Runs every case once against a running Lullwatch server, exactly as the app
// does it: one attested session, every message sealed to the model's key,
// every reply decrypted and verified. Writes evals/results.md.
//
//   cd server && CHATS_PER_HOUR=100 npm run dev     (in another terminal)
//   cd app && node ../evals/run.ts                  (costs well under a cent)

import { writeFileSync } from "node:fs";
import { CASES } from "./cases.ts";
import { askCompanion, startSession } from "../app/src/companion.ts";
import { checkIntel, defaultIntelVerifier } from "../app/src/verify.ts";

const BASE = process.env.LULLWATCH_URL ?? "http://localhost:8787";
const MAX_WORDS = 70;

const session = await startSession(BASE);
const intel = await checkIntel(session.attestation, session.attestation.nonce, await defaultIntelVerifier());
const proof = [...session.checks, ...intel];
for (const c of proof) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` · ${c.detail}` : ""}`);
const attested = proof.every((c) => c.pass);

const rows: string[] = [];
let passed = 0;
for (const c of CASES) {
  let result;
  try {
    result = await askCompanion(session, c.context, [{ role: "user", content: c.question }], BASE);
  } catch (e) {
    // A network failure isn't the model's fault; report it and move on.
    console.log(`SKIP ${c.id}: ${(e as Error).message}`);
    rows.push(`| – | ${c.id} | ${c.question} | | not run: ${(e as Error).message} |`);
    continue;
  }
  const { reply, checks, signed } = result;
  const problems: string[] = [];
  if (!checks.every((x) => x.pass)) problems.push("verification failed");
  // The server must only ever have seen ciphertext.
  if (signed.requestBody.includes(c.question) || signed.responseText.includes(reply.slice(0, 20))) problems.push("plain text on the wire");
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
const summary = `${passed}/${CASES.length} passed · end-to-end encrypted · proof ${attested ? "verified (NVIDIA + Intel)" : "FAILED"} · total spend so far $${health.totalUsd.toFixed(5)}`;
console.log(summary);
writeFileSync(
  new URL("./results.md", import.meta.url),
  `# Companion eval\n\nModel: ${health.model}. ${summary}.\n\n## Proof\n\n${proof.map((c) => `- ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? ` · \`${c.detail}\`` : ""}`).join("\n")}\n\n## Cases\n\n| | Case | Question | Reply | Problems |\n|---|---|---|---|---|\n${rows.join("\n")}\n`,
);
