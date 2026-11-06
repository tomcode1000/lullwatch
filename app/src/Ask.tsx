import { useState, type RefObject } from "react";
import { speakLocal } from "./Voice";
import type { Advice, GoRule } from "./engine/labour";
import { checkAttestation, checkReply, newNonce, replyText, type Attestation, type Check, type Signed } from "./verify";

type Msg = { role: "user" | "assistant"; content: string; checks?: Check[] };

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// What the model is told about her labour: the timer's numbers, never the raw log.
export function timerContext(a: Advice, rule: GoRule, firstBaby: boolean, now: number): string {
  const lines = [
    `Stage: ${a.stage}. ${a.reason}`,
    `Her midwife's rule: every ${rule.intervalMin} min, lasting ${rule.durationSec} s, for ${rule.sustainMin} min.`,
    `First baby: ${firstBaby ? "yes" : "no"}.`,
    `Recent contractions: ${a.medianIntervalMin?.toFixed(1) ?? "?"} min apart, lasting ${Math.round(a.medianDurationSec ?? 0)} s.`,
    `Now: ${clock(now)}.`,
  ];
  if (a.leaveBy !== null) lines.push(`Leave by: ${clock(a.leaveBy)}.`);
  if (a.flags.length) lines.push(`Warning signs she reported: ${a.flags.join(", ")}.`);
  return lines.join("\n");
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: "The server didn't answer." }));
  if (!r.ok || data.error) throw new Error(data.error ?? `Error ${r.status}`);
  return data as T;
}

async function getAttestation(): Promise<{ attestation: Attestation; checks: Check[] }> {
  const nonce = newNonce();
  const attestation = await post<Attestation>("/api/attest", { nonce });
  return { attestation, checks: checkAttestation(attestation, nonce) };
}

export type AskFn = (question: string, aloud?: boolean) => void;

export function Ask({ context, askRef }: { context: () => string; askRef?: RefObject<AskFn | null> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<{ attestation: Attestation; checks: Check[] } | null>(null);

  const ensureProof = async () => {
    if (proof) return proof;
    const p = await getAttestation();
    setProof(p);
    return p;
  };

  const ask = async (question: string, aloud = false) => {
    if (!question.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const p = await ensureProof();
      const signed = await post<Signed>("/api/chat", {
        context: context(),
        messages: next.map(({ role, content }) => ({ role, content })),
      });
      const reply = replyText(signed);
      const checks = checkReply(signed, p.attestation);
      setMsgs([...next, { role: "assistant", content: reply, checks }]);
      // Only read aloud what passed verification.
      if (aloud && checks.every((c) => c.pass)) speakLocal(reply);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (askRef) askRef.current = (q, aloud) => void ask(q, aloud);

  return (
    <section className="ask">
      <h2>Ask Lullwatch</h2>
      <p className="muted small">
        Questions go to an AI on sealed hardware that keeps nothing. Our server passes them through without storing
        them, and your phone checks the proof below.
      </p>

      {msgs.length === 0 && (
        <div className="suggest">
          {["How long until I need to leave?", "What should be in my bag?", "How do I breathe through this?"].map((q) => (
            <button key={q} className="chip" onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p>{m.content}</p>
            {m.checks && <Proof checks={m.checks} label="Reply verified" />}
          </div>
        ))}
        {busy && <div className="msg assistant muted">Thinking…</div>}
      </div>
      {error && <p className="err">{error}</p>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input value={text} maxLength={800} placeholder="Type a question" onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>

      <div className="privacy">
        {proof ? (
          <Proof checks={proof.checks} label="Sealed hardware verified" open />
        ) : (
          <button className="ghost" onClick={() => ensureProof().catch((e) => setError((e as Error).message))}>
            Check privacy proof
          </button>
        )}
      </div>
    </section>
  );
}

function Proof({ checks, label, open = false }: { checks: Check[]; label: string; open?: boolean }) {
  const all = checks.every((c) => c.pass);
  return (
    <details className={`proof ${all ? "ok" : "bad"}`} open={open}>
      <summary>{all ? `✓ ${label}` : "✗ Verification failed: don't trust this"}</summary>
      <ul>
        {checks.map((c) => (
          <li key={c.name}>
            <span aria-hidden>{c.pass ? "✓" : "✗"}</span> {c.name}
            {c.detail && <span className="muted small mono"> · {c.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
