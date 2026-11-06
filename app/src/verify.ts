// Checks done in her browser, so she doesn't have to trust our server:
// the sealed-hardware proof is fresh and NVIDIA-approved, and each reply was
// signed inside that hardware over the exact words sent and received.

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

export type Check = { name: string; pass: boolean; detail?: string };

export type Attestation = {
  model: string;
  nonce: string;
  gateway: { signing_address: string; request_nonce: string } | null;
  models: { signing_address: string; request_nonce: string; nvidia_payload: string | null; nras: unknown }[];
};

export type Signed = {
  model: string;
  requestBody: string;
  responseText: string;
  signature: { text: string; signature: string; signing_address: string; signing_algo: string; signature_kind?: string };
};

export function newNonce(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export const sha256Hex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));

// The Ethereum address that signed `message` (EIP-191 personal_sign).
export function recoverAddress(message: string, signatureHex: string): string {
  const msg = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`);
  const digest = keccak_256(new Uint8Array([...prefix, ...msg]));
  const sig = hexToBytes(signatureHex.replace(/^0x/, ""));
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
      pass: a.models.length > 0 && a.models.every((m) => m.request_nonce === nonce && m.nvidia_payload),
      detail: `${a.models.length} sealed server${a.models.length === 1 ? "" : "s"} for ${a.model}`,
    },
    {
      name: "NVIDIA confirms the GPUs are genuine and locked",
      pass: verdicts.length > 0 && verdicts.every((v) => v.pass),
      detail: `${verdicts.reduce((n, v) => n + v.gpus, 0)} GPU(s) checked by NVIDIA`,
    },
  ];
}

export function checkReply(s: Signed, a: Attestation): Check[] {
  const parts = s.signature.text.split(":");
  const kind = s.signature.signature_kind ?? (parts.length === 3 ? "provider_tee" : "gateway");
  const [model, reqHash, resHash] = kind === "provider_tee" ? parts : [null, parts[0], parts[1]];
  let signer = "";
  try {
    signer = recoverAddress(s.signature.text, s.signature.signature).toLowerCase();
  } catch {
    // leaves signer empty, so the check below fails
  }
  const allowed = (kind === "provider_tee" ? a.models.map((m) => m.signing_address) : [a.gateway?.signing_address ?? ""])
    .map((x) => x.toLowerCase());
  return [
    {
      name: "The reply was signed inside the sealed hardware",
      pass: s.signature.signing_algo === "ecdsa" && signer !== "" && allowed.includes(signer),
      detail: signer,
    },
    {
      name: "Your words reached the AI unchanged",
      pass: reqHash === sha256Hex(s.requestBody) && (model === null || model === s.model),
    },
    { name: "The reply reached you unchanged", pass: resHash === sha256Hex(s.responseText) },
  ];
}

// The text she sees. Some models put private reasoning before "</think>";
// it stays in the signed bytes but isn't shown.
export function replyText(s: Signed): string {
  const content: string = JSON.parse(s.responseText).choices?.[0]?.message?.content ?? "";
  const i = content.lastIndexOf("</think>");
  return (i >= 0 ? content.slice(i + 8) : content).trim();
}
