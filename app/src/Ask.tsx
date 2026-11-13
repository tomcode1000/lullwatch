import { useCallback, useRef, useState, type RefObject } from "react";
import { speakLocal } from "./Voice";
import type { Advice, GoRule } from "./engine/labour";
import { askCompanion, startSession, type Session } from "./companion";
import { checkIntel, defaultIntelVerifier, type Check } from "./verify";
import { Icon } from "./Icon";

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

// One attested session per visit, shared by the Ask and Proof tabs: a fresh
// proof and fresh encryption keys.
export type Privacy = {
  session: Session | null;
  intel: Check[] | null;
  lastReply: Check[] | null;
  error: string | null;
  status: "idle" | "checking" | "verified" | "failed";
  ensure: () => Promise<Session>;
  setLastReply: (c: Check[]) => void;
};

export function usePrivacy(): Privacy {
  const [session, setSession] = useState<Session | null>(null);
  const [intel, setIntel] = useState<Check[] | null>(null);
  const [lastReply, setLastReply] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const pending = useRef<Promise<Session> | null>(null);

  const ensure = useCallback(() => {
    if (!pending.current) {
      setError(null);
      setStarted(true);
      pending.current = startSession().then(
        (s) => {
          setSession(s);
          // Intel's check fetches Intel's collateral from her browser; it takes a few seconds.
          defaultIntelVerifier()
            .then((v) => checkIntel(s.attestation, s.attestation.nonce, v))
            .then(setIntel)
            .catch(() => setIntel([{ name: "Intel confirms the CPU enclave is genuine and up to date", pass: false }]));
          return s;
        },
        (e: Error) => {
          pending.current = null;
          setStarted(false);
          setError(e.message);
          throw e;
        },
      );
    }
    return pending.current;
  }, []);

  const all = [...(session?.checks ?? []), ...(intel ?? []), ...(lastReply ?? [])];
  const status: Privacy["status"] = !started
    ? "idle"
    : all.some((c) => !c.pass)
      ? "failed"
      : session && intel
        ? "verified"
        : "checking";

  return { session, intel, lastReply, error, status, ensure, setLastReply };
}

export function Ask({
  context,
  askRef,
  privacy,
  onOpenProof,
}: {
  context: () => string;
  askRef?: RefObject<AskFn | null>;
  privacy: Privacy;
  onOpenProof: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (question: string, aloud = false) => {
    if (!question.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question.trim() }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const s = await privacy.ensure();
      const { reply, checks } = await askCompanion(
        s,
        context(),
        next.map(({ role, content }) => ({ role, content })),
      );
      setMsgs([...next, { role: "assistant", content: reply, checks }]);
      privacy.setLastReply(checks);
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
      <header className="page-head">
        <h1>Ask Lullwatch</h1>
        <p className="muted">
          Your questions are encrypted on this phone, so only the AI inside sealed hardware can read them. It explains;
          it never changes when to leave.
        </p>
      </header>

      {msgs.length === 0 && (
        <div className="suggest">
          {["How long until I need to leave?", "What should be in my bag?", "How do I breathe through this?"].map((q) => (
            <button key={q} className="suggestion" onClick={() => ask(q)}>
              <Icon name="spark" />
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
        {busy && (
          <div className="msg assistant thinking" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      {(error || privacy.error) && <p className="err">{error ?? privacy.error}</p>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input value={text} maxLength={800} placeholder="Type a question" onChange={(e) => setText(e.target.value)} />
        <button className="send" disabled={busy || !text.trim()} aria-label="Send">
          <Icon name="send" />
        </button>
      </form>
      <button className="seal-note" onClick={onOpenProof}>
        <Icon name="lock" /> End-to-end encrypted to sealed hardware · see the proof
      </button>
    </section>
  );
}

export function Proof({ checks, label, open = false }: { checks: Check[]; label: string; open?: boolean }) {
  const all = checks.every((c) => c.pass);
  return (
    <details className={`proof ${all ? "ok" : "bad"}`} open={open}>
      <summary>{all ? `✓ ${label}` : "✗ Verification failed: don't trust this"}</summary>
      <CheckList checks={checks} />
    </details>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checks">
      {checks.map((c) => (
        <li key={c.name} className={c.pass ? "pass" : "fail"}>
          <span className="tick" aria-hidden>
            {c.pass ? "✓" : "✗"}
          </span>
          <span>
            {c.name}
            {c.detail && <span className="mono detail">{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const AI_CHECKS = [
  "The proof is fresh, made just now for this app",
  "The AI runs on sealed hardware",
  "NVIDIA confirms the GPUs are genuine and locked",
  "Intel confirms the CPU enclave is genuine and up to date",
  "The key that signs replies lives inside that enclave",
  "The software inside matches its published measurements",
];

export function ProofView({ privacy, onAsk }: { privacy: Privacy; onAsk: () => void }) {
  const { session, intel, lastReply, status } = privacy;
  const ai = [...(session?.checks ?? []), ...(intel ?? [])];
  const pending = AI_CHECKS.filter((n) => !ai.some((c) => c.name === n));
  return (
    <section className="proof-view">
      <div className={`cert ${status}`}>
        <div className="cert-seal" aria-hidden>
          <Icon name={status === "failed" ? "alert" : "shield"} />
        </div>
        <p className="eyebrow">Privacy proof</p>
        <h1>
          {status === "idle" && "Private by design"}
          {status === "checking" && "Checking the hardware…"}
          {status === "verified" && "Sealed hardware verified"}
          {status === "failed" && "Verification failed"}
        </h1>
        <p className="cert-lede">
          {status === "failed"
            ? "Don't trust the AI's replies on this visit. Your timer still works on this phone."
            : "Lullwatch's AI runs inside sealed hardware on NEAR AI Cloud. Nobody can see inside, not even us. Your phone checks that itself, with Intel and NVIDIA."}
        </p>
        {status === "idle" && (
          <button className="primary" onClick={() => privacy.ensure().catch(() => {})}>
            Run the check now
          </button>
        )}
        {session && (
          <dl className="cert-meta">
            <div>
              <dt>Model</dt>
              <dd>{session.attestation.model}</dd>
            </div>
            <div>
              <dt>Fresh nonce</dt>
              <dd className="mono">{session.attestation.nonce.slice(0, 16)}…</dd>
            </div>
            <div>
              <dt>Encryption</dt>
              <dd>To the sealed AI's key</dd>
            </div>
          </dl>
        )}
        {privacy.error && <p className="err">{privacy.error}</p>}
      </div>

      {status !== "idle" && (
        <div className="card">
          <h2>The AI</h2>
          <CheckList checks={ai} />
          {pending.length > 0 && (
            <ul className="checks">
              {pending.map((n) => (
                <li key={n} className="wait">
                  <span className="tick spin" aria-hidden />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status !== "idle" && (
        <div className="card">
          <h2>Your last reply</h2>
          {lastReply ? (
            <CheckList checks={lastReply} />
          ) : (
            <p className="muted">
              Every reply is signed inside the sealed hardware.{" "}
              <button className="link" onClick={onAsk}>
                Ask a question
              </button>{" "}
              to see one checked.
            </p>
          )}
        </div>
      )}

      <div className="card where">
        <h2>Where your data goes</h2>
        <ul>
          <li>
            <Icon name="phone" />
            <span>
              <b>Contractions and contacts</b> stay on this phone. They are never uploaded.
            </span>
          </li>
          <li>
            <Icon name="lock" />
            <span>
              <b>Questions</b> are encrypted on this phone. Only the sealed AI can read them; our server passes on
              scrambled text.
            </span>
          </li>
          <li>
            <Icon name="mic" />
            <span>
              <b>Voice clips</b> are turned into words inside sealed hardware. They pass through our server on the way,
              unencrypted, and are never stored.
            </span>
          </li>
          <li>
            <Icon name="server" />
            <span>
              <b>Our server</b> keeps nothing after a reply: no questions, no answers, no audio.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
