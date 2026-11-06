import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { checkAttestation, checkReply, recoverAddress, replyText, sha256Hex, type Attestation, type Signed } from "./verify";

// Private key 1 has a well-known Ethereum address.
const PRIV = new Uint8Array(32);
PRIV[31] = 1;
const ADDR = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

function personalSign(message: string): string {
  const msg = utf8ToBytes(message);
  const digest = keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
  const sig = secp256k1.sign(digest, PRIV);
  return "0x" + bytesToHex(sig.toCompactRawBytes()) + (27 + sig.recovery).toString(16);
}

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const NONCE = "ab".repeat(32);

function attestation(overrides: Partial<Attestation> = {}): Attestation {
  const jwt = `x.${b64url({ "x-nvidia-overall-att-result": true, eat_nonce: NONCE })}.y`;
  return {
    model: "z-ai/glm-5.3-flash",
    nonce: NONCE,
    gateway: { signing_address: "0xgateway", request_nonce: NONCE },
    models: [{ signing_address: ADDR, request_nonce: NONCE, nvidia_payload: "{}", nras: [["JWT", jwt], { "GPU-0": "t" }] }],
    ...overrides,
  };
}

function signed(requestBody = '{"q":1}', responseText = '{"a":2}'): Signed {
  const text = `z-ai/glm-5.3-flash:${sha256Hex(requestBody)}:${sha256Hex(responseText)}`;
  return {
    model: "z-ai/glm-5.3-flash",
    requestBody,
    responseText,
    signature: { text, signature: personalSign(text), signing_address: ADDR, signing_algo: "ecdsa", signature_kind: "provider_tee" },
  };
}

describe("recoverAddress", () => {
  it("recovers the known address of private key 1", () => {
    expect(recoverAddress("hello", personalSign("hello")).toLowerCase()).toBe(ADDR);
  });
});

describe("checkAttestation", () => {
  it("passes a fresh, NVIDIA-approved report", () => {
    expect(checkAttestation(attestation(), NONCE).every((c) => c.pass)).toBe(true);
  });

  it("fails a replayed report with someone else's nonce", () => {
    const checks = checkAttestation(attestation(), "cd".repeat(32));
    expect(checks.some((c) => c.pass)).toBe(false);
  });

  it("fails when NVIDIA does not approve", () => {
    const jwt = `x.${b64url({ "x-nvidia-overall-att-result": false, eat_nonce: NONCE })}.y`;
    const a = attestation();
    a.models[0].nras = [["JWT", jwt], {}];
    expect(checkAttestation(a, NONCE)[2].pass).toBe(false);
  });
});

describe("checkReply", () => {
  it("passes a reply signed by the attested key", () => {
    expect(checkReply(signed(), attestation()).every((c) => c.pass)).toBe(true);
  });

  it("catches a reply our server changed", () => {
    const s = signed();
    s.responseText = '{"a":"something else"}';
    const checks = checkReply(s, attestation());
    expect(checks[2].pass).toBe(false);
  });

  it("catches a signature from a key that is not in the sealed hardware", () => {
    const a = attestation();
    a.models[0].signing_address = "0x0000000000000000000000000000000000000001";
    expect(checkReply(signed(), a)[0].pass).toBe(false);
  });
});

describe("replyText", () => {
  it("hides reasoning that leaked before </think>", () => {
    const s = signed("{}", JSON.stringify({ choices: [{ message: { content: "planning...</think> You have 45 minutes." } }] }));
    expect(replyText(s)).toBe("You have 45 minutes.");
  });
});
