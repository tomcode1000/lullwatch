import { useEffect, useMemo, useRef, useState } from "react";
import {
  advise,
  FIRST_BABY_RULE,
  intervalsMin,
  LATER_BABY_RULE,
  RED_FLAGS,
  type Advice,
  type Contraction,
  type RedFlag,
} from "./engine/labour";
import { defaultProfile, emptyState, load, save, wipe, type Profile, type State } from "./store";
import { sampleLabour, sampleProfile } from "./sample";
import { Ask, Proof, ProofView, timerContext, usePrivacy, type AskFn, type Privacy } from "./Ask";
import { askCompanion } from "./companion";
import { CALL_REQUEST, callFacts, factsText, numbersCheck, templateScript, type CallFacts } from "./call";
import type { Check } from "./verify";
import { Voice } from "./Voice";
import { partnerMessage, smsLink, telLink } from "./contact";
import { Icon } from "./Icon";

function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const params = new URLSearchParams(location.search);

export default function App() {
  // ?sample opens straight into the fictional labour, for judges and demos.
  const [state, setState] = useState<State>(() =>
    params.has("sample")
      ? { ...emptyState, profile: sampleProfile(), contractions: sampleLabour(Date.now()), sample: true }
      : load(),
  );
  const [editing, setEditing] = useState(false);
  const now = useNow();

  useEffect(() => save(state), [state]);

  if (!state.profile || editing) {
    return (
      <Setup
        initial={state.profile}
        onCancel={state.profile ? () => setEditing(false) : undefined}
        onDone={(profile) => {
          setState((s) => ({ ...s, profile }));
          setEditing(false);
        }}
        onSample={() => {
          setState({ ...emptyState, profile: sampleProfile(), contractions: sampleLabour(Date.now()), sample: true });
          setEditing(false);
        }}
        onWipe={() => {
          if (confirm("Delete everything Lullwatch keeps on this phone?")) {
            wipe();
            setState(emptyState);
            setEditing(false);
          }
        }}
      />
    );
  }

  return <Main state={state} setState={setState} now={now} onEdit={() => setEditing(true)} />;
}

type Tab = "timer" | "ask" | "proof" | "history";

function Main({
  state,
  setState,
  now,
  onEdit,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  now: number;
  onEdit: () => void;
}) {
  const profile = state.profile!;
  // ?proof opens the privacy proof and runs it straight away, for judges and the demo.
  const [tab, setTab] = useState<Tab>(params.has("proof") ? "proof" : "timer");
  const [sheet, setSheet] = useState(false);
  const [call, setCall] = useState(false);
  const privacy = usePrivacy();
  const askRef = useRef<AskFn | null>(null);

  const { ensure } = privacy;
  useEffect(() => {
    if (params.has("proof")) ensure().catch(() => {});
  }, [ensure]);

  // Re-advise every 15 s, not every tick: the result only moves by minutes.
  const tick = Math.floor(now / 15_000);
  const advice = useMemo(
    () =>
      advise(state.contractions, { rule: profile.rule, travelMin: profile.travelMin }, state.flags, tick * 15_000),
    [state.contractions, state.flags, profile, tick],
  );

  const begin = () => setState((s) => (s.running === null ? { ...s, running: Date.now() } : s));
  const end = () =>
    setState((s) => {
      if (s.running === null) return s;
      const t = Date.now();
      // Under 5 seconds is a mistake, not a contraction.
      if (t - s.running < 5000) return { ...s, running: null };
      return { ...s, running: null, contractions: [...s.contractions, { start: s.running, end: t }] };
    });
  const toggle = () => (state.running === null ? begin() : end());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab === "timer" && e.code === "Space" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className={`shell stage-${advice.stage}`}>
      <header className="top">
        <div className="brand">
          <Logo />
          <span>Lullwatch</span>
        </div>
        <div className="top-right">
          <PrivacyPill privacy={privacy} onClick={() => setTab("proof")} />
          <button className="icon-btn" onClick={onEdit} aria-label="Settings">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="app">
        {/* Every tab stays mounted, so voice keeps listening and the chat survives switching. */}
        <div hidden={tab !== "timer"} className="tab">
          {state.sample && (
            <p className="banner">
              <span>Sample data: a fictional labour</span>
              <button
                className="link"
                onClick={() => setState((s) => ({ ...s, contractions: [], running: null, flags: [], sample: false }))}
              >
                Start fresh
              </button>
            </p>
          )}

          <StageCard advice={advice} now={now} profile={profile} onCall={() => setCall(true)} />

          <TimerButton state={state} now={now} onToggle={toggle} />

          <Voice
            onHeard={(h) => {
              if (h.kind === "start") begin();
              else if (h.kind === "stop") end();
              else if (h.kind === "question") {
                setTab("ask");
                askRef.current?.(h.text, true);
              }
            }}
          />

          <button className={`wrong ${state.flags.length ? "on" : ""}`} onClick={() => setSheet(true)}>
            <Icon name="alert" />
            <span>{state.flags.length ? `${state.flags.length} warning sign${state.flags.length > 1 ? "s" : ""} marked` : "Something feels wrong?"}</span>
          </button>

          {state.contractions.length > 1 && (
            <section className="card trend" onClick={() => setTab("history")}>
              <div className="card-head">
                <h2>Gaps between contractions</h2>
                <span className="muted small">{state.contractions.length} recorded ›</span>
              </div>
              <GapChart contractions={state.contractions} rule={profile.rule.intervalMin} />
            </section>
          )}

          <p className="foot">
            Lullwatch helps you decide; it does not replace your midwife or doctor. If something feels wrong, call them.
          </p>
        </div>

        <div hidden={tab !== "ask"} className="tab">
          <Ask
            askRef={askRef}
            privacy={privacy}
            onOpenProof={() => setTab("proof")}
            context={() => timerContext(advice, profile.rule, profile.firstBaby, Date.now())}
          />
        </div>

        <div hidden={tab !== "proof"} className="tab">
          <ProofView privacy={privacy} onAsk={() => setTab("ask")} />
        </div>

        <div hidden={tab !== "history"} className="tab">
          <History
            contractions={state.contractions}
            rule={profile.rule.intervalMin}
            onUndo={() => setState((s) => ({ ...s, contractions: s.contractions.slice(0, -1) }))}
            onClear={() => {
              if (confirm("Delete every contraction recorded on this phone?")) {
                wipe();
                setState((s) => ({ ...s, contractions: [], running: null, flags: [] }));
              }
            }}
          />
        </div>
      </main>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["timer", "timer", "Timer"],
            ["ask", "chat", "Ask"],
            ["proof", "shield", "Proof"],
            ["history", "list", "History"],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id} onClick={() => setTab(id)}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {call && (
        <CallSheet
          privacy={privacy}
          phone={profile.midwifePhone}
          facts={callFacts(state.contractions, advice, profile.firstBaby)}
          context={timerContext(advice, profile.rule, profile.firstBaby, Date.now())}
          onClose={() => setCall(false)}
        />
      )}

      {sheet && (
        <FlagsSheet
          flags={state.flags}
          onChange={(flags) => setState((s) => ({ ...s, flags }))}
          onClose={() => {
            setSheet(false);
            // Bring "Go now" into view the moment a warning sign is marked.
            if (state.flags.length) window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--brand)" />
      <path d="M6 18c3-6 5-6 7 0s4 6 7 0 4-6 6 0" fill="none" stroke="var(--brand-ink)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function PrivacyPill({ privacy, onClick }: { privacy: Privacy; onClick: () => void }) {
  const text = {
    idle: "Private AI",
    checking: "Checking…",
    verified: "Verified",
    failed: "Not verified",
  }[privacy.status];
  return (
    <button className={`pill ${privacy.status}`} onClick={onClick}>
      <Icon name={privacy.status === "failed" ? "alert" : "shield"} size={16} />
      {text}
    </button>
  );
}

const HEADLINE: Record<Advice["stage"], string> = {
  waiting: "Keep timing",
  pack: "Start packing",
  leave: "Time to leave",
  "go-now": "Go now",
};

const EYEBROW: Record<Advice["stage"], string> = {
  waiting: "Early labour",
  pack: "Getting closer",
  leave: "It's time",
  "go-now": "Warning sign",
};

function StageCard({ advice, now, profile, onCall }: { advice: Advice; now: number; profile: Profile; onCall: () => void }) {
  const where = profile.hospital.trim() || "the hospital";
  const message = partnerMessage(advice, profile.hospital, now);
  const steps: Advice["stage"][] = ["waiting", "pack", "leave"];
  const at = advice.stage === "go-now" ? 3 : steps.indexOf(advice.stage);
  return (
    <section className={`stage ${advice.stage}`} aria-live="polite">
      <div className="stage-top">
        <span className="eyebrow">{EYEBROW[advice.stage]}</span>
        <ol className="steps" aria-hidden>
          {steps.map((s, i) => (
            <li key={s} className={i <= at ? "done" : ""} />
          ))}
        </ol>
      </div>
      <div className="stage-main">
        <h1>{HEADLINE[advice.stage]}</h1>
        {advice.stage !== "go-now" && advice.leaveBy !== null && (
          <p className="leave">
            <span className="leave-label">Leave for {where} by</span>
            <span className="leave-time">{advice.leaveBy <= now ? "Now" : clock(advice.leaveBy)}</span>
            {advice.leaveBy > now && <span className="leave-in">in {span(advice.leaveBy - now)}</span>}
          </p>
        )}
      </div>
      <p className="reason">
        {advice.stage === "go-now"
          ? `${advice.reason.replace(/ Go to the hospital or call now\.$/, "")} Head to ${where} or call your midwife or emergency number now.`
          : advice.leaveBy !== null
            ? advice.reason
            : advice.reason}
      </p>

      {(message || advice.stage !== "waiting") && (
        <div className="actions">
          {advice.stage === "go-now" && profile.midwifePhone ? (
            // Urgent: dial straight away, no extra step.
            <a className="action urgent" href={telLink(profile.midwifePhone)}>
              <Icon name="phone" size={18} /> Call midwife
            </a>
          ) : (
            advice.stage !== "go-now" &&
            advice.stage !== "waiting" && (
              <button className="action" onClick={onCall}>
                <Icon name="phone" size={18} /> {profile.midwifePhone ? "Call midwife" : "What to say"}
              </button>
            )
          )}
          {message && profile.partnerPhone && (
            <a className="action soft" href={smsLink(profile.partnerPhone, message)}>
              <Icon name="message" size={18} /> Text {profile.partnerName?.trim() || "my partner"}
            </a>
          )}
        </div>
      )}

      <dl className="stats">
        <div>
          <dt>Apart</dt>
          <dd>{advice.medianIntervalMin === null ? "–" : `${advice.medianIntervalMin.toFixed(1)} min`}</dd>
        </div>
        <div>
          <dt>Lasting</dt>
          <dd>{advice.medianDurationSec === null ? "–" : `${Math.round(advice.medianDurationSec)} s`}</dd>
        </div>
        <div>
          <dt>Rule met</dt>
          <dd>{advice.ruleMetAt === null ? "–" : advice.ruleMetAt <= now ? "Yes" : clock(advice.ruleMetAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function TimerButton({ state, now, onToggle }: { state: State; now: number; onToggle: () => void }) {
  const last = state.contractions[state.contractions.length - 1];
  const on = state.running !== null;
  return (
    <div className="timer-wrap">
      <button className={`timer ${on ? "on" : ""}`} onClick={onToggle} aria-pressed={on}>
        {on ? (
          <>
            <span className="timer-count">{span(now - state.running!)}</span>
            <span className="timer-label">Tap when it stops</span>
          </>
        ) : (
          <>
            <span className="timer-label big">Contraction started</span>
            <span className="timer-sub">{last ? `Last one began ${span(now - last.start)} ago` : "Tap when one begins"}</span>
          </>
        )}
      </button>
    </div>
  );
}

function GapChart({ contractions, rule, tall = false }: { contractions: Contraction[]; rule: number; tall?: boolean }) {
  const gaps = intervalsMin(contractions).slice(tall ? -24 : -14);
  if (gaps.length < 1) return null;
  const W = 320;
  const H = tall ? 140 : 80;
  const max = Math.max(rule * 2, ...gaps);
  const bw = W / Math.max(gaps.length, 6);
  const y = (g: number) => H - (g / max) * H;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Last ${gaps.length} gaps, from ${gaps[0].toFixed(1)} to ${gaps[gaps.length - 1].toFixed(1)} minutes`}>
        {gaps.map((g, i) => (
          <rect key={i} x={i * bw + 3} y={y(g)} width={bw - 6} height={H - y(g)} rx={4} className={g <= rule ? "bar met" : "bar"} />
        ))}
        <line x1={0} x2={W} y1={y(rule)} y2={y(rule)} className="rule-line" />
      </svg>
      <figcaption>
        <span>
          <i className="key-line" /> {rule} min apart: time to go in
        </span>
        <span className="muted">oldest → newest</span>
      </figcaption>
    </figure>
  );
}

function CallSheet({
  privacy,
  phone,
  facts,
  context,
  onClose,
}: {
  privacy: Privacy;
  phone?: string;
  facts: CallFacts;
  context: string;
  onClose: () => void;
}) {
  const [script, setScript] = useState<{ by: "writing" | "ai" | "phone"; text: string; checks?: Check[] }>({ by: "writing", text: "" });

  // Written once when the sheet opens, from the numbers at that moment.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await privacy.ensure();
        const { reply, checks } = await askCompanion(s, `${context}\n\nCALL FACTS:\n${factsText(facts)}`, [{ role: "user", content: CALL_REQUEST }]);
        privacy.setLastReply(checks);
        const text = reply.trim().replace(/^["“]|["”]$/g, "");
        const ok = checks.every((c) => c.pass) && numbersCheck(text, facts);
        if (live) setScript(ok ? { by: "ai", text, checks } : { by: "phone", text: templateScript(facts) });
      } catch {
        if (live) setScript({ by: "phone", text: templateScript(facts) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="call-title" onClick={(e) => e.stopPropagation()}>
        <div className="grab" aria-hidden />
        <div className="sheet-head">
          <h2 id="call-title">What to say when you call</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <p className="muted">Read this out when the maternity unit answers.</p>
        {script.by === "writing" ? (
          <div className="script writing">
            <span className="tick spin" aria-hidden /> Writing it inside sealed hardware…
          </div>
        ) : (
          <blockquote className="script">{script.text}</blockquote>
        )}
        {script.by === "ai" && script.checks && <Proof checks={script.checks} label="Written in sealed hardware · verified" />}
        {script.by === "phone" && <p className="muted small">Written on this phone from your timer.</p>}
        <div className="also">
          <b>They may also ask</b>
          <ul>
            <li>How many weeks pregnant you are</li>
            <li>Whether your waters have broken</li>
            <li>Whether the baby is moving as usual</li>
          </ul>
        </div>
        {phone ? (
          <a className="primary call-now" href={telLink(phone)}>
            <Icon name="phone" size={18} /> Call midwife now
          </a>
        ) : (
          <button className="primary" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function FlagsSheet({ flags, onChange, onClose }: { flags: RedFlag[]; onChange: (f: RedFlag[]) => void; onClose: () => void }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="flags-title" onClick={(e) => e.stopPropagation()}>
        <div className="grab" aria-hidden />
        <div className="sheet-head">
          <h2 id="flags-title">Something feels wrong?</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <p className="muted">Tap anything that's happening. Any one of these means go or call now, whatever the timer says.</p>
        <div className="flag-list">
          {(Object.keys(RED_FLAGS) as RedFlag[]).map((f) => {
            const on = flags.includes(f);
            return (
              <button
                key={f}
                className={`flag ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => onChange(on ? flags.filter((x) => x !== f) : [...flags, f])}
              >
                <span className="box" aria-hidden>
                  {on ? "✓" : ""}
                </span>
                {RED_FLAGS[f]}
              </button>
            );
          })}
        </div>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function History({
  contractions,
  rule,
  onUndo,
  onClear,
}: {
  contractions: Contraction[];
  rule: number;
  onUndo: () => void;
  onClear: () => void;
}) {
  const gaps = intervalsMin(contractions);
  const rows = contractions
    .map((c, i) => ({ c, gap: i > 0 ? gaps[i - 1] : null }))
    .reverse();
  return (
    <section className="history">
      <header className="page-head">
        <h1>History</h1>
        <p className="muted">
          <Icon name="phone" size={16} /> Stored only on this phone.
        </p>
      </header>
      {contractions.length === 0 ? (
        <div className="card empty">
          <p>No contractions yet. Tap the big button on the Timer when one begins.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <GapChart contractions={contractions} rule={rule} tall />
          </div>
          <div className="card log">
            <div className="card-head">
              <h2>Recorded ({contractions.length})</h2>
              <div className="row">
                <button className="ghost" onClick={onUndo}>
                  Undo last
                </button>
                <button className="ghost" onClick={onClear}>
                  Clear
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Lasted</th>
                  <th>Apart</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, gap }) => (
                  <tr key={c.start}>
                    <td>{clock(c.start)}</td>
                    <td>{Math.round((c.end - c.start) / 1000)} s</td>
                    <td className={gap !== null && gap <= rule ? "met" : ""}>{gap === null ? "–" : `${gap.toFixed(1)} min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Setup({
  initial,
  onDone,
  onSample,
  onCancel,
  onWipe,
}: {
  initial: Profile | null;
  onDone: (p: Profile) => void;
  onSample: () => void;
  onCancel?: () => void;
  onWipe: () => void;
}) {
  const [p, setP] = useState<Profile>(initial ?? defaultProfile(true));
  const standard = (r: Profile["rule"], first: boolean) => {
    const s = first ? FIRST_BABY_RULE : LATER_BABY_RULE;
    return r.intervalMin === s.intervalMin && r.durationSec === s.durationSec && r.sustainMin === s.sustainMin;
  };
  // Open only when she has already saved her midwife's own numbers.
  const [customRule, setCustomRule] = useState(() => !!initial && !standard(initial.rule, initial.firstBaby));
  // A custom rule from her midwife stays when she changes the first-baby answer.
  const setFirst = (firstBaby: boolean) =>
    setP((x) => ({ ...x, firstBaby, rule: customRule ? x.rule : firstBaby ? FIRST_BABY_RULE : LATER_BABY_RULE }));
  const num = (v: string, fallback: number) => (Number.isFinite(+v) && +v > 0 ? +v : fallback);
  const setRule = (k: keyof Profile["rule"], v: string) =>
    setP((x) => ({ ...x, rule: { ...x.rule, [k]: num(v, x.rule[k]) } }));

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <Logo />
          <span>Lullwatch</span>
        </div>
        {onCancel && (
          <button className="icon-btn" onClick={onCancel} aria-label="Close settings">
            <Icon name="close" />
          </button>
        )}
      </header>
      <main className="app setup">
        {initial ? (
          <header className="page-head">
            <h1>Settings</h1>
          </header>
        ) : (
          <header className="hero">
            <h1>Know when to go.</h1>
            <p className="lede">
              Time your contractions and Lullwatch tells you when to pack and when to leave, counting your journey time.
            </p>
            <p className="assure">
              <Icon name="shield" size={18} /> Private by design. Everything stays on this phone.
            </p>
            <button className="ghost wide" onClick={onSample}>
              Try it with sample data
            </button>
          </header>
        )}

        <section className="card form">
          <h2>
            <span className="num">1</span> About you
          </h2>
          <fieldset>
            <legend>Is this your first baby?</legend>
            <div className="seg">
              <button className={p.firstBaby ? "on" : ""} onClick={() => setFirst(true)}>
                Yes
              </button>
              <button className={!p.firstBaby ? "on" : ""} onClick={() => setFirst(false)}>
                No
              </button>
            </div>
          </fieldset>
          <label>
            Hospital or birth centre
            <input value={p.hospital} placeholder="e.g. St Mary's" onChange={(e) => setP({ ...p, hospital: e.target.value })} />
          </label>
          <label>
            Journey time there, in minutes
            <input inputMode="numeric" value={p.travelMin} onChange={(e) => setP({ ...p, travelMin: num(e.target.value, p.travelMin) })} />
          </label>
        </section>

        <section className="card form">
          <h2>
            <span className="num">2</span> Who should know when it's time?
          </h2>
          <p className="muted small">
            Optional. When it's time, Lullwatch writes the text and your own phone sends it. These numbers stay on this
            phone.
          </p>
          <label>
            Partner's name
            <input value={p.partnerName ?? ""} placeholder="e.g. Sam" onChange={(e) => setP({ ...p, partnerName: e.target.value })} />
          </label>
          <label>
            Partner's phone
            <input type="tel" value={p.partnerPhone ?? ""} placeholder="+44 7700 900123" onChange={(e) => setP({ ...p, partnerPhone: e.target.value })} />
          </label>
          <label>
            Midwife or maternity unit phone
            <input type="tel" value={p.midwifePhone ?? ""} onChange={(e) => setP({ ...p, midwifePhone: e.target.value })} />
          </label>
        </section>

        <section className="card form">
          <h2>
            <span className="num">3</span> When to go in
          </h2>
          <p className="muted small">
            {customRule ? "Your midwife's numbers:" : `Lullwatch uses the standard rule for ${p.firstBaby ? "a first baby" : "a second or later baby"}. You don't need to set anything.`}
          </p>
          <p className="sentence">
            Contractions every <b>{p.rule.intervalMin}</b> minutes, lasting <b>{p.rule.durationSec}</b> seconds, for{" "}
            <b>{p.rule.sustainMin}</b> minutes.
          </p>
          {customRule ? (
            <>
              <div className="rule">
                <label>
                  Minutes apart
                  <input inputMode="numeric" value={p.rule.intervalMin} onChange={(e) => setRule("intervalMin", e.target.value)} />
                </label>
                <label>
                  Seconds long
                  <input inputMode="numeric" value={p.rule.durationSec} onChange={(e) => setRule("durationSec", e.target.value)} />
                </label>
                <label>
                  For minutes
                  <input inputMode="numeric" value={p.rule.sustainMin} onChange={(e) => setRule("sustainMin", e.target.value)} />
                </label>
              </div>
              <button
                className="link small"
                onClick={() => {
                  setCustomRule(false);
                  setP((x) => ({ ...x, rule: x.firstBaby ? FIRST_BABY_RULE : LATER_BABY_RULE }));
                }}
              >
                Use the standard rule
              </button>
            </>
          ) : (
            <button className="ghost wide" onClick={() => setCustomRule(true)}>
              My midwife gave me different numbers
            </button>
          )}
        </section>

        <button className="primary sticky" onClick={() => onDone(p)}>
          {initial ? "Save" : "Start timing"}
        </button>
        {initial && (
          <button className="danger-link" onClick={onWipe}>
            Delete all my data
          </button>
        )}
      </main>
    </div>
  );
}
