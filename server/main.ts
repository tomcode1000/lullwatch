// Lullwatch server. It holds the NEAR AI Cloud key, enforces the spending
// limits and passes requests through. It stores and logs nothing anyone says.
//
//   node --env-file=../.env main.ts

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { attest, chat, transcribe } from "./nearai.ts";
import { costOf, Guard } from "./guard.ts";
import { buildRequest, type ChatInput } from "./request.ts";

const KEY = process.env.NEARAI_API_KEY ?? "";
const MODEL = process.env.CHAT_MODEL ?? "Qwen/Qwen3.8-27B";
const PORT = Number(process.env.PORT ?? 8787);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const STATIC = join(HERE, "../app/dist");

const spend = new Guard({
  dailyCapUsd: Number(process.env.DAILY_CAP_USD ?? 0.25),
  totalCapUsd: Number(process.env.TOTAL_CAP_USD ?? 8),
  perVisitorPerHour: Number(process.env.CHATS_PER_HOUR ?? 30),
  ledgerFile: join(HERE, "spend.json"),
});
// Attestation is free, but NEAR's and NVIDIA's services deserve limits too.
const attests = new Guard({ dailyCapUsd: Infinity, totalCapUsd: Infinity, perVisitorPerHour: 30 });
// Voice clips: "now" and "stop" twice a contraction, plus questions. Dollars
// still count against the main budget.
const voices = new Guard({ dailyCapUsd: Infinity, totalCapUsd: Infinity, perVisitorPerHour: 90 });
const VOICE_MODEL = "openai/whisper-large-v3";
// Whisper reports no usage; count each clip cautiously.
const VOICE_CLIP_USD = 0.0005;
const VOICE_MAX_BYTES = 1_000_000; // about a minute of compressed speech

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

function visitor(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" ? fwd.split(",")[0].trim() : "") || req.socket.remoteAddress || "?";
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 32_000): Promise<unknown> {
  return JSON.parse((await readBody(req, limit)).toString("utf8"));
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
};

// Hashed build files never change; the page, manifest and offline worker must always be fresh.
const cacheFor = (file: string) => (/[\\/]assets[\\/]/.test(file) ? "public, max-age=31536000, immutable" : "no-cache");

async function serveStatic(path: string, res: ServerResponse) {
  const safe = normalize(path).replace(/^([/\\])+/, "").replace(/^(\.\.[/\\])+/, "");
  for (const file of [join(STATIC, safe), join(STATIC, "index.html")]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": cacheFor(file) });
      return res.end(body);
    } catch {
      // try the next candidate
    }
  }
  send(res, 404, { error: "not found" });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (url.pathname === "/api/health") {
      const s = spend.status();
      return send(res, 200, { model: MODEL, ai: !!KEY && s.totalUsd < s.totalCapUsd, ...s });
    }

    if (url.pathname === "/api/attest" && req.method === "POST") {
      const { nonce } = (await readJson(req, 1000)) as { nonce?: string };
      if (!nonce || !/^[0-9a-f]{64}$/.test(nonce)) return send(res, 400, { error: "nonce must be 64 hex characters" });
      const refused = attests.check(visitor(req));
      if (refused) return send(res, 429, { error: refused });
      return send(res, 200, await attest(KEY, MODEL, nonce));
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      if (!KEY) return send(res, 503, { error: "The AI isn't set up on this server." });
      let requestBody: string;
      let input: ChatInput;
      try {
        input = (await readJson(req, 128_000)) as ChatInput;
        requestBody = buildRequest(input, MODEL);
      } catch (e) {
        return send(res, 400, { error: (e as Error).message });
      }
      const refused = spend.check(visitor(req));
      if (refused) return send(res, 429, { error: refused });
      const signed = await chat(KEY, requestBody, MODEL, { clientPubKey: input.clientPubKey, modelPubKey: input.modelPubKey });
      spend.record(costOf(MODEL, signed.usage.prompt_tokens, signed.usage.completion_tokens));
      return send(res, 200, signed);
    }

    if (url.pathname === "/api/transcribe" && req.method === "POST") {
      if (!KEY) return send(res, 503, { error: "The AI isn't set up on this server." });
      const mime = String(req.headers["content-type"] ?? "");
      if (!/^audio\/(webm|ogg|mp4|mpeg|wav)/.test(mime)) return send(res, 415, { error: "send audio" });
      const refused = spend.budgetReason() ?? voices.check(visitor(req));
      if (refused) return send(res, 429, { error: refused });
      const audio = await readBody(req, VOICE_MAX_BYTES);
      if (audio.length < 1000) return send(res, 200, { text: "" }); // too short to be speech
      const text = await transcribe(KEY, audio, mime.split(";")[0], VOICE_MODEL);
      spend.record(VOICE_CLIP_USD);
      return send(res, 200, { text });
    }

    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
    return serveStatic(url.pathname, res);
  } catch (e) {
    // Message and network code only; never the request body.
    const code = (e as { cause?: { code?: string } }).cause?.code;
    return send(res, 502, { error: (e as Error).message + (code ? ` (${code})` : "") });
  }
});

server.listen(PORT, () => {
  console.log(`Lullwatch server on :${PORT} · model ${MODEL} · key ${KEY ? "set" : "MISSING"}`);
});
