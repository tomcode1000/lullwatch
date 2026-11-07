// Checks done in her browser, so she doesn't have to trust our server:
// the sealed-hardware proof is fresh, Intel- and NVIDIA-approved, bound to the
// key that signs replies, and each reply was signed inside that hardware over
// the exact bytes sent and received.

import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256, sha384 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { open } from "./e2ee.ts";

export type Check = { name: string; pass: boolean; detail?: string };

export type ModelAttestation = {
  signing_address: string; // ed25519: the public key, hex; ecdsa: an address
  signing_algo: string;
  request_nonce: string;
  intel_quote: string | null;
  event_log: unknown;
  app_compose: string | null;
  nvidia_payload: string | null;
  nras: unknown;
};

export type Attestation = {
  model: string;
  nonce: string;
  gateway: { signing_address: string; request_nonce: string } | null;
  models: ModelAttestation[];
};

export type Signed = {
  model: string;
  requestBody: string;
  responseText: string;
  signature: { text: string; signature: string; signing_address: string; signing_algo: string; signature_kind?: string };
};

const strip0x = (s: string) => s.replace(/^0x/, "").toLowerCase();

export function newNonce(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export const sha256Hex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));

// The Ethereum address that signed `message` (EIP-191 personal_sign).
export function recoverAddress(message: string, signatureHex: string): string {
  const msg = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`);
  const digest = keccak_256(new Uint8Array([...prefix, ...msg]));
  const sig = hexToBytes(strip0x(signatureHex));
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(digest);
  return "0x" + bytesToHex(keccak_256(pub.toRawBytes(false).slice(1)).slice(-20));
}

function jwtClaims(token: unknown): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
  } catch {
    return null;
  }
}

// NVIDIA's reply: [["JWT", overall], {"GPU-0": token, ...}]
function nvidiaVerdict(nras: unknown, nonce: string): { pass: boolean; gpus: number } {
  if (!Array.isArray(nras)) return { pass: false, gpus: 0 };
  const overall = Array.isArray(nras[0]) ? jwtClaims(nras[0][1]) : null;
  const gpus = nras[1] && typeof nras[1] === "object" ? Object.keys(nras[1] as object).length : 0;
  const pass =
    overall?.["x-nvidia-overall-att-result"] === true && String(overall?.eat_nonce ?? "").toLowerCase() === nonce;
  return { pass, gpus };
}

export function checkAttestation(a: Attestation, nonce: string): Check[] {
  const verdicts = a.models.map((m) => nvidiaVerdict(m.nras, nonce));
  return [
    { name: "The proof is fresh, made just now for this app", pass: a.nonce === nonce && a.gateway?.request_nonce === nonce },
    {
      name: "The AI runs on sealed hardware",
      pass: a.models.length > 0 && a.models.every((m) => m.request_nonce === nonce && m.nvidia_payload && m.intel_quote),
      detail: `${a.models.length} sealed server${a.models.length === 1 ? "" : "s"} for ${a.model}`,
    },
    {
      name: "NVIDIA confirms the GPUs are genuine and locked",
      pass: verdicts.length > 0 && verdicts.every((v) => v.pass),
      detail: `${verdicts.reduce((n, v) => n + v.gpus, 0)} GPU(s) checked by NVIDIA`,
    },
  ];
}

// --- Intel TDX ---------------------------------------------------------------

// What report_data must hold for a NEAR dstack node: the signing identity,
// zero-padded to 32 bytes, then our 32-byte nonce.
export function expectedReportData(signingAddress: string, nonce: string): string {
  return strip0x(signingAddress).padEnd(64, "0") + nonce.toLowerCase();
}

type Event = { imr: number; event_type: number; event: string; event_payload: string; digest?: string };

// Replay the RTMR3 event log: each event extends the register with SHA-384.
export function replayRtmr3(eventLog: unknown): string {
  const events: Event[] = typeof eventLog === "string" ? JSON.parse(eventLog) : (eventLog as Event[]);
  let rtmr = new Uint8Array(48);
  for (const e of events.filter((x) => x.imr === 3)) {
    const type = new Uint8Array(4);
    new DataView(type.buffer).setUint32(0, e.event_type, true);
    const computed = sha384(
      new Uint8Array([...type, ...utf8ToBytes(":"), ...utf8ToBytes(e.event), ...utf8ToBytes(":"), ...hexToBytes(e.event_payload)]),
    );
    if (e.digest && strip0x(e.digest) !== bytesToHex(computed)) throw new Error(`event ${e.event} digest mismatch`);
    rtmr = sha384(new Uint8Array([...rtmr, ...computed]));
  }
  return bytesToHex(rtmr);
}

// MRCONFIGID = 0x01 || SHA-256(app_compose) || 15 zero bytes
export function expectedMrConfigId(appCompose: string): string {
  return "01" + bytesToHex(sha256(utf8ToBytes(appCompose))) + "00".repeat(15);
}

// Statuses that mean genuine, patched hardware.
const GOOD_TCB = new Set(["UpToDate", "SWHardeningNeeded"]);

type TdReport = { reportData: Uint8Array; rtMr3: Uint8Array; mrConfigId: Uint8Array };
export type IntelVerifier = (quote: Uint8Array) => Promise<{ status: string; advisory_ids: string[]; report: { data: TdReport } }>;

// Intel's own collateral (signed by Intel's root key) is fetched by her
// browser from a public PCCS, so our server can't forge it.
export async function defaultIntelVerifier(): Promise<IntelVerifier> {
  const { getCollateralAndVerify } = await import("@phala/dcap-qvl");
  return (quote) => getCollateralAndVerify(quote) as ReturnType<IntelVerifier>;
}

export async function checkIntel(a: Attestation, nonce: string, verifyQuote: IntelVerifier): Promise<Check[]> {
  let genuine = a.models.length > 0;
  let bound = a.models.length > 0;
  let measured = a.models.length > 0;
  const statuses: string[] = [];
  for (const m of a.models) {
    try {
      if (!m.intel_quote) throw new Error("no quote");
      const r = await verifyQuote(hexToBytes(m.intel_quote));
      statuses.push(r.status);
      genuine &&= GOOD_TCB.has(r.status);
      const td = r.report.data;
      bound &&= bytesToHex(td.reportData) === expectedReportData(m.signing_address, nonce);
      measured &&=
        !!m.app_compose &&
        bytesToHex(td.rtMr3) === replayRtmr3(m.event_log) &&
        bytesToHex(td.mrConfigId) === expectedMrConfigId(m.app_compose);
    } catch {
      genuine = bound = measured = false;
    }
  }
  return [
    { name: "Intel confirms the CPU enclave is genuine and up to date", pass: genuine, detail: statuses.join(", ") },
    { name: "The key that signs replies lives inside that enclave", pass: bound },
    { name: "The software inside matches its published measurements", pass: measured },
  ];
}

// --- Replies -----------------------------------------------------------------

function signerMatches(s: Signed["signature"], allowed: string[]): { pass: boolean; who: string } {
  try {
    if (s.signing_algo === "ed25519") {
      const key = strip0x(s.signing_address);
      const ok = allowed.includes(key) && ed25519.verify(strip0x(s.signature), utf8ToBytes(s.text), key);
      return { pass: ok, who: key };
    }
    if (s.signing_algo === "ecdsa") {
      const who = recoverAddress(s.text, s.signature).toLowerCase();
      return { pass: allowed.includes(who), who };
    }
  } catch {
    // fall through: unverifiable
  }
  return { pass: false, who: "" };
}

export function checkReply(s: Signed, a: Attestation): Check[] {
  const parts = s.signature.text.split(":");
  const kind = s.signature.signature_kind ?? (parts.length === 3 ? "provider_tee" : "gateway");
  const [model, reqHash, resHash] = kind === "provider_tee" ? parts : [null, parts[0], parts[1]];
  const allowed = (kind === "provider_tee" ? a.models.map((m) => m.signing_address) : [a.gateway?.signing_address ?? ""]).map(
    strip0x,
  );
  const signer = signerMatches(s.signature, allowed);
  return [
    { name: "The reply was signed inside the sealed hardware", pass: signer.pass, detail: signer.who },
    { name: "Your words reached the AI unchanged", pass: reqHash === sha256Hex(s.requestBody) && (model === null || model === s.model) },
    { name: "The reply reached you unchanged", pass: resHash === sha256Hex(s.responseText) },
  ];
}

// The text she sees: decrypted if it was sealed to her, and without any
// private reasoning a model put before "</think>".
export function replyText(s: Signed, x25519Secret?: Uint8Array): string {
  let content: string = JSON.parse(s.responseText).choices?.[0]?.message?.content ?? "";
  if (x25519Secret && /^[0-9a-f]+$/i.test(content) && content.length > 112) content = open(content, x25519Secret);
  const i = content.lastIndexOf("</think>");
  return (i >= 0 ? content.slice(i + 8) : content).trim();
}
