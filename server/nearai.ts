// Calls to NEAR AI Cloud and NVIDIA's attestation service. The browser checks
// the results itself (see app/src/verify.ts); this file only fetches them.
// Based on near-examples/nearai-cloud-verification-example (MIT).

export const NEARAI = "https://cloud-api.near.ai";
export const NRAS = "https://nras.attestation.nvidia.com/v3/attest/gpu";

function auth(key: string) {
  return { Authorization: `Bearer ${key}` };
}

async function fail(res: Response, what: string): Promise<never> {
  // Status only: error bodies can echo the request, which may be private.
  throw new Error(`${what} failed: ${res.status}`);
}

export type Attestation = {
  model: string;
  nonce: string;
  gateway: { signing_address: string; request_nonce: string } | null;
  models: { signing_address: string; request_nonce: string; nvidia_payload: string | null; nras: unknown }[];
};

// Attestation for the gateway and every TEE node serving the model, with
// NVIDIA's verdict on each GPU payload. Free to call.
export async function attest(key: string, model: string, nonce: string): Promise<Attestation> {
  const q = new URLSearchParams({ model, nonce, signing_algo: "ecdsa" });
  const res = await fetch(`${NEARAI}/v1/attestation/report?${q}`, { headers: { accept: "application/json", ...auth(key) } });
  if (!res.ok) await fail(res, "Attestation");
  const report = (await res.json()) as {
    gateway_attestation?: { signing_address: string; request_nonce: string };
    model_attestations?: { signing_address: string; request_nonce: string; nvidia_payload?: string }[];
  };

  const models = await Promise.all(
    (report.model_attestations ?? []).map(async (m) => {
      let nras: unknown = null;
      if (m.nvidia_payload) {
        const r = await fetch(NRAS, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: typeof m.nvidia_payload === "string" ? m.nvidia_payload : JSON.stringify(m.nvidia_payload),
        });
        nras = r.ok ? await r.json() : null;
      }
      return {
        signing_address: m.signing_address,
        request_nonce: m.request_nonce,
        nvidia_payload: m.nvidia_payload ?? null,
        nras,
      };
    }),
  );

  const g = report.gateway_attestation;
  return {
    model,
    nonce,
    gateway: g ? { signing_address: g.signing_address, request_nonce: g.request_nonce } : null,
    models,
  };
}

// Speech to text with Whisper inside the TEE. Returns only the words.
export async function transcribe(key: string, audio: Buffer, mime: string, model: string): Promise<string> {
  const form = new FormData();
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `clip.${ext}`);
  form.append("model", model);
  form.append("response_format", "json");
  const res = await fetch(`${NEARAI}/v1/audio/transcriptions`, { method: "POST", headers: auth(key), body: form });
  if (!res.ok) await fail(res, "Transcription");
  const body = (await res.json()) as { text?: string };
  return (body.text ?? "").trim();
}

export type Signed = {
  model: string;
  requestBody: string; // the exact bytes sent; the browser hashes these
  responseText: string; // the exact bytes received
  signature: { text: string; signature: string; signing_address: string; signing_algo: string; signature_kind?: string };
  usage: { prompt_tokens: number; completion_tokens: number };
};

// One chat completion plus the TEE's signature over the exact request and response.
export async function chat(key: string, requestBody: string, model: string): Promise<Signed> {
  const res = await fetch(`${NEARAI}/v1/chat/completions`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "accept-encoding": "identity",
      "x-no-aliasing": "true",
      ...auth(key),
    },
    body: requestBody,
  });
  if (!res.ok) await fail(res, "Chat");
  const responseText = await res.text();
  const parsed = JSON.parse(responseText) as { id: string; usage?: Signed["usage"] };

  // The signature sits on the node that served the reply; another node may 404 briefly.
  const url = `${NEARAI}/v1/signature/${encodeURIComponent(parsed.id)}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`;
  let signature: Signed["signature"] | null = null;
  for (let i = 0; i < 5 && !signature; i++) {
    const s = await fetch(url, { headers: { accept: "application/json", ...auth(key) } });
    if (s.ok) {
      const body = (await s.json()) as Signed["signature"] & { error_code?: string };
      if (!body.error_code) signature = body;
    } else if (s.status !== 404) {
      await fail(s, "Signature");
    }
    if (!signature) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!signature) throw new Error("Signature not available");

  return {
    model,
    requestBody,
    responseText,
    signature,
    usage: parsed.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
  };
}
