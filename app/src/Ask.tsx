import { useEffect, useState, type RefObject } from "react";
import { speakLocal } from "./Voice";
import type { Advice, GoRule } from "./engine/labour";
import { askCompanion, startSession, type Session } from "./companion";
import { checkIntel, defaultIntelVerifier, type Check } from "./verify";

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

export type AskFn = (question: string, aloud?: boolean) => void;

export function Ask({ context, askRef }: { context: () => string; askRef?: RefObject<AskFn | null> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [intel, setIntel] = useState<Check[] | null>(null);

  // One attested session per visit: fresh proof, fresh encryption keys.
  const ensureSession = async () => {
    if (session) return session;
    const s = await startSession();
    setSession(s);
    // Intel's check fetches Intel's collateral from her browser; it takes a few seconds.
    defaultIntelVerifier()
      .then((v) => checkIntel(s.attestation, s.attestation.nonce, v))
      .then(setIntel)
      .catch(() => setIntel([{ name: "Intel confirms the CPU enclave is genuine and up to date", pass: false }]));
    return s;
  };

  const ask = async (question: string, aloud = false) => {
    if (!question.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const s = await ensureSession();
      const { reply, checks } = await askCompanion(
        s,
        context(),
        next.map(({ role, content }) => ({ role, content })),
      );
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

  // ?proof runs the privacy checks straight away, for judges and the demo.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("proof")) ensureSession().catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="ask">
      <h2>Ask Lullwatch</h2>
      <p className="muted small">
        Your questions are encrypted on this phone so only the AI inside sealed hardware can read them. Our server
        relays scrambled text, and your phone checks the proof below.
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
        {session ? (
          <>
            <Proof checks={[...session.checks, ...(intel ?? [])]} label="Sealed hardware verified" open />
            {!intel && <p className="muted small">Checking with Intel…</p>}
            <p className="muted small">✓ Encrypted to the sealed AI's key</p>
          </>
        ) : (
          <button className="ghost" onClick={() => ensureSession().catch((e) => setError((e as Error).message))}>
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
