// Everything about talking to the companion that isn't UI: the instructions,
// sealing each message to the attested model key in her browser, and opening
// and checking the reply. Used by the app and by evals/run.ts.

import { newClientKeys, seal, type ClientKeys } from "./e2ee.ts";
import { checkAttestation, checkReply, newNonce, replyText, type Attestation, type Check, type Signed } from "./verify.ts";

export const SYSTEM = `You are Lullwatch, a calm companion for a woman in late pregnancy who is timing her contractions.

The app's fixed rules decide when she should pack, leave or go now. The current decision is in TIMER below. Never contradict it, never move the leave time, and never tell her to stay home when it says go.

How to answer:
- Short and warm: two or three sentences, under 60 words. She may be in pain.
- Plain words; no medical jargon, no lists unless she asks.
- Explain what the timer's numbers mean when asked.
- Practical help is welcome: breathing through a contraction, what to pack, what to tell the midwife on the phone.
- If she mentions waters breaking, bleeding, the baby moving less, constant severe pain, a bad headache, blurred vision, fever, or feeling something is wrong: tell her to call her midwife or the emergency number now, and to tap "Something feels wrong?" in the app.
- You do not diagnose. For anything medical beyond this, say her midwife or doctor is the one to ask.`;

export type Turn = { role: "user" | "assistant"; content: string };

export type Session = {
  attestation: Attestation;
  checks: Check[];
  keys: ClientKeys;
  modelKey: string; // the attested ed25519 key every message is sealed to
};

const MAX_TURNS = 8;

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: "The server didn't answer." }));
  if (!r.ok || data.error) throw new Error(data.error ?? `Error ${r.status}`);
  return data as T;
}

export async function startSession(base = ""): Promise<Session> {
  const nonce = newNonce();
  const attestation = await post<Attestation>(base, "/api/attest", { nonce });
  const checks = checkAttestation(attestation, nonce);
  const key = attestation.models.find((m) => m.signing_algo === "ed25519")?.signing_address;
  if (!key) throw new Error("No sealed key to encrypt to.");
  return { attestation, checks, keys: newClientKeys(), modelKey: key.replace(/^0x/, "") };
}

export function plainMessages(context: string, history: Turn[]) {
  return [{ role: "system", content: `${SYSTEM}\n\nTIMER:\n${context}` }, ...history.slice(-MAX_TURNS)];
}

export async function askCompanion(
  session: Session,
  context: string,
  history: Turn[],
  base = "",
): Promise<{ reply: string; checks: Check[]; signed: Signed }> {
  const messages = plainMessages(context, history).map((m) => ({ role: m.role, content: seal(m.content, session.modelKey) }));
  const signed = await post<Signed>(base, "/api/chat", {
    messages,
    clientPubKey: session.keys.publicHex,
    modelPubKey: session.modelKey,
  });
  return {
    reply: replyText(signed, session.keys.x25519Secret),
    checks: checkReply(signed, session.attestation),
    signed,
  };
}
