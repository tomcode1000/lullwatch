// Builds the exact request sent to the model. The app's fixed rules have
// already decided pack / leave / go now; the model explains, it never decides.

export type ChatInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  context: string; // a short summary of what the timer has worked out
};

export const SYSTEM = `You are Lullwatch, a calm companion for a woman in late pregnancy who is timing her contractions.

The app's fixed rules decide when she should pack, leave or go now. The current decision is in TIMER below. Never contradict it, never move the leave time, and never tell her to stay home when it says go.

How to answer:
- Short and warm: two or three sentences, under 60 words. She may be in pain.
- Plain words; no medical jargon, no lists unless she asks.
- Explain what the timer's numbers mean when asked.
- Practical help is welcome: breathing through a contraction, what to pack, what to tell the midwife on the phone.
- If she mentions waters breaking, bleeding, the baby moving less, constant severe pain, a bad headache, blurred vision, fever, or feeling something is wrong: tell her to call her midwife or the emergency number now, and to tap "Something feels wrong?" in the app.
- You do not diagnose. For anything medical beyond this, say her midwife or doctor is the one to ask.`;

const MAX_MESSAGES = 8;
const MAX_CHARS = 800;
const MAX_CONTEXT = 1200;

export function buildRequest(input: ChatInput, model: string): string {
  if (!input || !Array.isArray(input.messages) || typeof input.context !== "string") {
    throw new Error("expected { messages, context }");
  }
  if (input.context.length > MAX_CONTEXT) throw new Error("context too long");
  const messages = input.messages.slice(-MAX_MESSAGES).map((m) => {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      throw new Error("bad message");
    }
    if (m.content.length > MAX_CHARS) throw new Error("message too long");
    return { role: m.role, content: m.content };
  });
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    throw new Error("the last message must be hers");
  }

  return JSON.stringify({
    model,
    messages: [{ role: "system", content: `${SYSTEM}\n\nTIMER:\n${input.context}` }, ...messages],
    max_tokens: 250,
    temperature: 0.4,
    stream: false,
    // Thinking tokens are billed as output; switch them off.
    chat_template_kwargs: { enable_thinking: false },
  });
}
