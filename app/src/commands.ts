// What a spoken clip means. Short words drive the timer; longer speech is a
// question for the companion. Anything else is ignored so noise costs nothing.

export type Heard = { kind: "start" } | { kind: "stop" } | { kind: "question"; text: string } | { kind: "ignore" };

const START = new Set(["now", "start", "started", "starting", "begin", "go", "contraction", "here it comes", "its starting", "it started", "one now", "another one"]);
const STOP = new Set(["stop", "stopped", "done", "over", "finished", "end", "ended", "its over", "it stopped", "its gone", "gone", "okay done", "ok done"]);

// Whisper's usual inventions on silence or noise.
const NOISE = new Set(["", "you", "thank you", "thanks", "thanks for watching", "thank you for watching", "bye", "music", "applause"]);

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function interpret(text: string): Heard {
  const t = normalise(text);
  if (NOISE.has(t)) return { kind: "ignore" };
  if (START.has(t)) return { kind: "start" };
  if (STOP.has(t)) return { kind: "stop" };
  // "okay now", "now please": short phrases containing a command word.
  const words = t.split(" ");
  if (words.length <= 3) {
    if (words.some((w) => w === "now" || w === "start" || w === "started")) return { kind: "start" };
    if (words.some((w) => w === "stop" || w === "stopped" || w === "done" || w === "over")) return { kind: "stop" };
    return { kind: "ignore" };
  }
  return { kind: "question", text: text.trim() };
}
