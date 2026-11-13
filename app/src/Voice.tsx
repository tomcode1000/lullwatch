import { useEffect, useRef, useState } from "react";
import { interpret, type Heard } from "./commands";
import { Icon } from "./Icon";

// Hands-free listening. Only while switched on: the mic waits for speech,
// keeps a short pre-roll so a quick "now" isn't clipped, and sends each
// phrase to Whisper on NEAR AI Cloud's sealed hardware. Silence is never sent.

const RATE = 16_000;
const FRAME = 2048; // 128 ms at 16 kHz
const PREROLL_FRAMES = 3;
const END_SILENCE_MS = 700;
const MAX_CLIP_MS = 8000;
const MIN_SPEECH_MS = 250;

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buf], { type: "audio/wav" });
}

const rms = (f: Float32Array) => Math.sqrt(f.reduce((a, x) => a + x * x, 0) / f.length);

type Status = "off" | "listening" | "hearing" | "sending" | "error";

export function Voice({ onHeard }: { onHeard: (h: Heard, text: string) => void }) {
  const [status, setStatus] = useState<Status>("off");
  const [note, setNote] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;

  useEffect(() => () => stopRef.current?.(), []);

  const send = async (clip: Float32Array) => {
    setStatus("sending");
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: encodeWav(clip, RATE) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      const heard = interpret(data.text ?? "");
      if (heard.kind !== "ignore") setNote(`Heard: “${data.text}”`);
      onHeardRef.current(heard, data.text ?? "");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setStatus((s) => (s === "off" ? s : "listening"));
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const ctx = new AudioContext({ sampleRate: RATE });
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(FRAME, 1, 1);
      const preroll: Float32Array[] = [];
      let clip: Float32Array[] | null = null;
      let startedAt = 0;
      let lastLoud = 0;
      let floor = 0.01;

      proc.onaudioprocess = (e) => {
        const frame = new Float32Array(e.inputBuffer.getChannelData(0));
        const now = performance.now();
        // Don't listen to our own voice reading a reply aloud.
        if (window.speechSynthesis?.speaking) return;
        const level = rms(frame);
        const loud = level > Math.max(0.02, floor * 3);
        if (!loud && !clip) floor = floor * 0.95 + level * 0.05;

        if (!clip) {
          preroll.push(frame);
          if (preroll.length > PREROLL_FRAMES) preroll.shift();
          if (loud) {
            clip = [...preroll];
            startedAt = lastLoud = now;
            setStatus("hearing");
          }
          return;
        }
        clip.push(frame);
        if (loud) lastLoud = now;
        if (now - lastLoud > END_SILENCE_MS || now - startedAt > MAX_CLIP_MS) {
          const frames = clip;
          clip = null;
          preroll.length = 0;
          if (lastLoud - startedAt < MIN_SPEECH_MS) return setStatus("listening"); // a cough or a bump
          const all = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
          frames.reduce((o, f) => (all.set(f, o), o + f.length), 0);
          void send(all);
        }
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      stopRef.current = () => {
        proc.disconnect();
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setNote("Say “now” when one starts and “stop” when it ends, or ask a question.");
      setStatus("listening");
    } catch {
      setStatus("error");
      setNote("The microphone isn't available. Allow it in your browser, or use the button.");
    }
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setStatus("off");
    setNote("");
  };

  const label: Record<Status, string> = {
    off: "Turn on voice",
    listening: "Listening…",
    hearing: "Hearing you…",
    sending: "Understanding…",
    error: "Try voice again",
  };

  return (
    <section className="voice">
      <button
        className={`voice-btn ${status}`}
        aria-pressed={status !== "off" && status !== "error"}
        onClick={() => (status === "off" || status === "error" ? start() : stop())}
      >
        <span className="mic" aria-hidden>
          <Icon name="mic" size={18} />
        </span>
        <span className="voice-text">
          <b>{label[status]}</b>
          <span className="small">
            {status === "off" || status === "error" ? "Hands-free: say “now” and “stop”" : "Tap to turn off"}
          </span>
        </span>
        <span className="dot" aria-hidden />
      </button>
      {note && <p className="muted small">{note}</p>}
    </section>
  );
}

// Read a reply aloud, only with a voice that runs on this device, so her
// words don't go to an online speech service.
export function speakLocal(text: string): boolean {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  const voice = synth.getVoices().find((v) => v.localService && v.lang.startsWith("en"));
  if (!voice) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.rate = 0.95;
  synth.cancel();
  synth.speak(u);
  return true;
}
