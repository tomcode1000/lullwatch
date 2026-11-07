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
import { Ask, timerContext, type AskFn } from "./Ask";
import { Voice } from "./Voice";
import { partnerMessage, smsLink, telLink } from "./contact";

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

export default function App() {
  // ?sample opens straight into the fictional labour, for judges and demos.
  const [state, setState] = useState<State>(() =>
    new URLSearchParams(location.search).has("sample")
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
        onDone={(profile) => {
          setState((s) => ({ ...s, profile }));
          setEditing(false);
        }}
        onSample={() => {
          setState({ ...emptyState, profile: sampleProfile(), contractions: sampleLabour(Date.now()), sample: true });
          setEditing(false);
        }}
      />
    );
  }

  return <Timer state={state} setState={setState} now={now} onEdit={() => setEditing(true)} />;
}

function Timer({
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
  const askRef = useRef<AskFn | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const last = state.contractions[state.contractions.length - 1];

  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Lullwatch</span>
        </div>
        <button className="ghost" onClick={onEdit}>
          Settings
        </button>
      </header>

      {state.sample && (
        <p className="banner">
          Sample data: a fictional labour, for trying the app.{" "}
          <button
            className="link"
            onClick={() => setState((s) => ({ ...s, contractions: [], running: null, flags: [], sample: false }))}
          >
            Start fresh
          </button>
        </p>
      )}

      <AdviceCard advice={advice} now={now} profile={profile} />

      <button className={`big ${state.running !== null ? "on" : ""}`} onClick={toggle}>
        {state.running !== null ? (
          <>
            <span className="big-label">It stopped</span>
            <span className="big-sub">Contraction: {span(now - state.running)}</span>
          </>
        ) : (
          <>
            <span className="big-label">Contraction started</span>
            <span className="big-sub">
              {last ? `Last one began ${span(now - last.start)} ago` : "Tap when one begins"}
            </span>
          </>
        )}
      </button>

      <Voice
        onHeard={(h) => {
          if (h.kind === "start") begin();
          else if (h.kind === "stop") end();
          else if (h.kind === "question") askRef.current?.(h.text, true);
        }}
      />

      <Flags flags={state.flags} onChange={(flags) => setState((s) => ({ ...s, flags }))} />

      <Ask askRef={askRef} context={() => timerContext(advice, profile.rule, profile.firstBaby, Date.now())} />

      <Log
        contractions={state.contractions}
        onUndo={() => setState((s) => ({ ...s, contractions: s.contractions.slice(0, -1) }))}
        onClear={() => {
          if (confirm("Delete every contraction recorded on this phone?")) {
            wipe();
            setState((s) => ({ ...s, contractions: [], running: null, flags: [] }));
          }
        }}
      />

      <footer className="foot">
        <p>
          Lullwatch helps you decide; it does not replace your midwife or doctor. If something feels wrong, call them.
        </p>
        <p>Your contractions are stored only on this phone.</p>
      </footer>
    </main>
  );
}

const HEADLINE: Record<Advice["stage"], string> = {
  waiting: "Keep timing",
  pack: "Start packing",
  leave: "Time to leave",
  "go-now": "Go now",
};

function AdviceCard({ advice, now, profile }: { advice: Advice; now: number; profile: Profile }) {
  const where = profile.hospital.trim() || "the hospital";
  const message = partnerMessage(advice, profile.hospital, now);
  return (
    <section className={`advice ${advice.stage}`} aria-live="polite">
      <h1>{HEADLINE[advice.stage]}</h1>
      <p className="reason">{advice.reason}</p>
      {advice.stage === "go-now" ? (
        <p className="when">Head to {where} or call your midwife or emergency number now.</p>
      ) : advice.leaveBy !== null ? (
        <p className="when">
          {advice.leaveBy <= now ? (
            <>Leave for {where} now.</>
          ) : (
            <>
              Leave for {where} by <strong>{clock(advice.leaveBy)}</strong>
              <span className="muted"> · in {span(advice.leaveBy - now)}</span>
            </>
          )}
        </p>
      ) : null}
      {(message || advice.stage !== "waiting") && (profile.partnerPhone || profile.midwifePhone) && (
        <div className="actions">
          {message && profile.partnerPhone && (
            <a className="action" href={smsLink(profile.partnerPhone, message)}>
              Text {profile.partnerName?.trim() || "my partner"}
            </a>
          )}
          {advice.stage !== "waiting" && profile.midwifePhone && (
            <a className={`action ${advice.stage === "go-now" ? "urgent" : ""}`} href={telLink(profile.midwifePhone)}>
              Call midwife
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

function Flags({ flags, onChange }: { flags: RedFlag[]; onChange: (f: RedFlag[]) => void }) {
  const [open, setOpen] = useState(flags.length > 0);
  return (
    <section className="flags">
      <button className="flags-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Something feels wrong?
      </button>
      {open && (
        <div className="chips">
          {(Object.keys(RED_FLAGS) as RedFlag[]).map((f) => {
            const on = flags.includes(f);
            return (
              <button
                key={f}
                className={`chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => onChange(on ? flags.filter((x) => x !== f) : [...flags, f])}
              >
                {RED_FLAGS[f]}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Log({
  contractions,
  onUndo,
  onClear,
}: {
  contractions: Contraction[];
  onUndo: () => void;
  onClear: () => void;
}) {
  if (contractions.length === 0) return null;
  const gaps = intervalsMin(contractions);
  const rows = contractions
    .map((c, i) => ({ c, gap: i > 0 ? gaps[i - 1] : null }))
    .reverse()
    .slice(0, 12);
  return (
    <section className="log">
      <div className="log-head">
        <h2>Recorded ({contractions.length})</h2>
        <div>
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
              <td>{gap === null ? "–" : `${gap.toFixed(1)} min`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Setup({
  initial,
  onDone,
  onSample,
}: {
  initial: Profile | null;
  onDone: (p: Profile) => void;
  onSample: () => void;
}) {
  const [p, setP] = useState<Profile>(initial ?? defaultProfile(true));
  const setFirst = (firstBaby: boolean) =>
    setP((x) => ({ ...x, firstBaby, rule: firstBaby ? FIRST_BABY_RULE : LATER_BABY_RULE }));
  const num = (v: string, fallback: number) => (Number.isFinite(+v) && +v > 0 ? +v : fallback);
  const setRule = (k: keyof Profile["rule"], v: string) =>
    setP((x) => ({ ...x, rule: { ...x.rule, [k]: num(v, x.rule[k]) } }));

  return (
    <main className="app setup">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Lullwatch</span>
        </div>
      </header>
      <h1>Know when to go.</h1>
      <p className="lede">
        Time your contractions and Lullwatch tells you when to pack and when to leave, counting your journey time.
        Everything stays on this phone.
      </p>

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
        <input
          value={p.hospital}
          placeholder="e.g. St Mary's"
          onChange={(e) => setP({ ...p, hospital: e.target.value })}
        />
      </label>

      <label>
        Journey time there, in minutes
        <input
          inputMode="numeric"
          value={p.travelMin}
          onChange={(e) => setP({ ...p, travelMin: num(e.target.value, p.travelMin) })}
        />
      </label>

      <fieldset>
        <legend>Who should know when it's time?</legend>
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
          <input
            type="tel"
            value={p.partnerPhone ?? ""}
            placeholder="+44 7700 900123"
            onChange={(e) => setP({ ...p, partnerPhone: e.target.value })}
          />
        </label>
        <label>
          Midwife or maternity unit phone
          <input type="tel" value={p.midwifePhone ?? ""} onChange={(e) => setP({ ...p, midwifePhone: e.target.value })} />
        </label>
      </fieldset>

      <fieldset>
        <legend>When did your midwife say to come in?</legend>
        <p className="muted small">
          Contractions every <b>{p.rule.intervalMin}</b> minutes, lasting <b>{p.rule.durationSec}</b> seconds, for{" "}
          <b>{p.rule.sustainMin}</b> minutes. Change these to match what you were told.
        </p>
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
      </fieldset>

      <button className="primary" onClick={() => onDone(p)}>
        {initial ? "Save" : "Start timing"}
      </button>
      {!initial && (
        <button className="ghost wide" onClick={onSample}>
          Try it with sample data
        </button>
      )}
    </main>
  );
}
