// Builds the exact request sent to the model. The messages arrive sealed by
// her browser, so the server can only check their shape and size; it adds
// the settings that keep cost down.

export type ChatInput = {
  messages: { role: string; content: string }[];
  clientPubKey: string;
  modelPubKey: string;
};

const MAX_MESSAGES = 9; // the instructions plus 8 turns
const MAX_SEALED = 12_000; // hex characters, about 5,900 characters of text
const HEX = /^[0-9a-f]+$/;
const KEY = /^[0-9a-f]{64}$/;
// Sealed: 32-byte ephemeral key + 24-byte nonce + 16-byte tag, as hex.
const MIN_SEALED = (32 + 24 + 16) * 2;

export function buildRequest(input: ChatInput, model: string): string {
  if (!input || !Array.isArray(input.messages)) throw new Error("expected { messages, clientPubKey, modelPubKey }");
  if (!KEY.test(input.clientPubKey ?? "") || !KEY.test(input.modelPubKey ?? "")) throw new Error("bad keys");
  // Always the instructions, then the latest turns.
  const messages = [input.messages[0], ...input.messages.slice(1).slice(-(MAX_MESSAGES - 1))];
  if (messages.length < 2 || !messages[0] || messages[0].role !== "system" || messages.at(-1)!.role !== "user") {
    throw new Error("expected the instructions first and her question last");
  }
  const clean = messages.map((m, i) => {
    if (i > 0 && m.role !== "user" && m.role !== "assistant") throw new Error("bad message");
    if (typeof m.content !== "string" || !HEX.test(m.content) || m.content.length < MIN_SEALED) {
      throw new Error("messages must be sealed");
    }
    if (m.content.length > MAX_SEALED) throw new Error("message too long");
    return { role: m.role, content: m.content };
  });

  return JSON.stringify({
    model,
    messages: clean,
    max_tokens: 250,
    temperature: 0.4,
    stream: false,
    // Thinking tokens are billed as output; switch them off.
    chat_template_kwargs: { enable_thinking: false },
  });
}
