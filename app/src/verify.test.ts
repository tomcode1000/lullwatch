import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha384 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { newClientKeys, seal } from "./e2ee";
import {
  checkAttestation,
  checkIntel,
  checkReply,
  expectedMrConfigId,
  expectedReportData,
  recoverAddress,
  replayRtmr3,
  replyText,
  sha256Hex,
  type Attestation,
  type IntelVerifier,
  type Signed,
} from "./verify";

const NONCE = "ab".repeat(32);
const MODEL = "Qwen/Qwen3.8-27B";
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// An ed25519 key standing in for the model's sealed signing key.
const MODEL_SECRET = ed25519.utils.randomPrivateKey();
const MODEL_KEY = bytesToHex(ed25519.getPublicKey(MODEL_SECRET));

const EVENTS = [
  { imr: 3, event_type: 134217729, event: "compose-hash", event_payload: "aa".repeat(32) },
  { imr: 3, event_type: 134217729, event: "instance-id", event_payload: "bb".repeat(20) },
  { imr: 0, event_type: 1, event: "", event_payload: "" },
];
const COMPOSE = '{"services":{"vllm":{"image":"example"}}}';

function attestation(overrides: Partial<Attestation> = {}): Attestation {
  const jwt = `x.${b64url({ "x-nvidia-overall-att-result": true, eat_nonce: NONCE })}.y`;
  return {
    model: MODEL,
    nonce: NONCE,
    gateway: { signing_address: "0xgateway", request_nonce: NONCE },
    models: [
      {
        signing_address: MODEL_KEY,
        signing_algo: "ed25519",
        request_nonce: NONCE,
        intel_quote: "00",
        event_log: JSON.stringify(EVENTS),
        app_compose: COMPOSE,
        nvidia_payload: "{}",
        nras: [["JWT", jwt], { "GPU-0": "t" }],
      },
    ],
    ...overrides,
  };
}

function signed(requestBody = '{"q":1}', responseText = '{"a":2}'): Signed {
  const text = `${MODEL}:${sha256Hex(requestBody)}:${sha256Hex(responseText)}`;
  return {
    model: MODEL,
    requestBody,
    responseText,
    signature: {
      text,
      signature: bytesToHex(ed25519.sign(utf8ToBytes(text), MODEL_SECRET)),
      signing_address: MODEL_KEY,
      signing_algo: "ed25519",
      signature_kind: "provider_tee",
    },
  };
}

// A stand-in for Intel's verifier that returns the report a genuine node would.
function intel(overrides: { status?: string; reportData?: string; rtMr3?: string; mrConfigId?: string } = {}): IntelVerifier {
  return async () => ({
    status: overrides.status ?? "UpToDate",
    advisory_ids: [],
    report: {
      data: {
        reportData: hexToBytes(overrides.reportData ?? expectedReportData(MODEL_KEY, NONCE)),
        rtMr3: hexToBytes(overrides.rtMr3 ?? replayRtmr3(JSON.stringify(EVENTS))),
        mrConfigId: hexToBytes(overrides.mrConfigId ?? expectedMrConfigId(COMPOSE)),
      },
    },
  });
}

describe("recoverAddress (ecdsa)", () => {
  it("recovers the known address of private key 1", () => {
    const priv = new Uint8Array(32);
    priv[31] = 1;
    const msg = utf8ToBytes("hello");
    const digest = keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
    const sig = secp256k1.sign(digest, priv);
    const hex = "0x" + bytesToHex(sig.toCompactRawBytes()) + (27 + sig.recovery).toString(16);
    expect(recoverAddress("hello", hex).toLowerCase()).toBe("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
  });
});

describe("checkAttestation", () => {
  it("passes a fresh, NVIDIA-approved report", () => {
    expect(checkAttestation(attestation(), NONCE).every((c) => c.pass)).toBe(true);
  });

  it("fails a replayed report with someone else's nonce", () => {
    expect(checkAttestation(attestation(), "cd".repeat(32)).some((c) => c.pass)).toBe(false);
  });

  it("fails when NVIDIA does not approve", () => {
    const a = attestation();
    a.models[0].nras = [["JWT", `x.${b64url({ "x-nvidia-overall-att-result": false, eat_nonce: NONCE })}.y`], {}];
    expect(checkAttestation(a, NONCE)[2].pass).toBe(false);
  });
});

describe("Intel TDX", () => {
  it("report_data is the key padded to 32 bytes, then the nonce", () => {
    expect(expectedReportData("0x" + "12".repeat(20), NONCE)).toBe("12".repeat(20) + "00".repeat(12) + NONCE);
    expect(expectedReportData(MODEL_KEY, NONCE)).toBe(MODEL_KEY + NONCE);
  });

  it("replays RTMR3 from imr-3 events only, with SHA-384", () => {
    let r = new Uint8Array(48);
    for (const e of EVENTS.filter((x) => x.imr === 3)) {
      const t = new Uint8Array(4);
      new DataView(t.buffer).setUint32(0, e.event_type, true);
      const d = sha384(new Uint8Array([...t, ...utf8ToBytes(`:${e.event}:`), ...hexToBytes(e.event_payload)]));
      r = sha384(new Uint8Array([...r, ...d]));
    }
    expect(replayRtmr3(EVENTS)).toBe(bytesToHex(r));
  });

  it("rejects an event log whose recorded digest was altered", () => {
    expect(() => replayRtmr3([{ ...EVENTS[0], digest: "00".repeat(48) }])).toThrow();
  });

  it("passes a genuine, up-to-date enclave bound to the signing key and nonce", async () => {
    expect((await checkIntel(attestation(), NONCE, intel())).every((c) => c.pass)).toBe(true);
  });

  it("fails hardware Intel says is out of date", async () => {
    expect((await checkIntel(attestation(), NONCE, intel({ status: "OutOfDate" })))[0].pass).toBe(false);
  });

  it("fails when the quote is for a different key (a swapped server)", async () => {
    const other = bytesToHex(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    expect((await checkIntel(attestation(), NONCE, intel({ reportData: expectedReportData(other, NONCE) })))[1].pass).toBe(false);
  });

  it("fails an old quote replayed with another nonce", async () => {
    expect((await checkIntel(attestation(), NONCE, intel({ reportData: expectedReportData(MODEL_KEY, "cd".repeat(32)) })))[1].pass).toBe(false);
  });

  it("fails when the software inside doesn't match its measurements", async () => {
    expect((await checkIntel(attestation(), NONCE, intel({ mrConfigId: expectedMrConfigId("{}") })))[2].pass).toBe(false);
    expect((await checkIntel(attestation(), NONCE, intel({ rtMr3: "00".repeat(48) })))[2].pass).toBe(false);
  });

  it("fails when Intel's verifier throws", async () => {
    const broken: IntelVerifier = async () => {
      throw new Error("bad quote");
    };
    expect((await checkIntel(attestation(), NONCE, broken)).some((c) => c.pass)).toBe(false);
  });
});

describe("checkReply", () => {
  it("passes a reply signed by the attested ed25519 key", () => {
    expect(checkReply(signed(), attestation()).every((c) => c.pass)).toBe(true);
  });

  it("catches a reply our server changed", () => {
    const s = signed();
    s.responseText = '{"a":"something else"}';
    expect(checkReply(s, attestation())[2].pass).toBe(false);
  });

  it("catches a signature from a key that is not in the sealed hardware", () => {
    const a = attestation();
    a.models[0].signing_address = bytesToHex(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    expect(checkReply(signed(), a)[0].pass).toBe(false);
  });

  it("catches a forged signature", () => {
    const s = signed();
    s.signature.signature = "00".repeat(64);
    expect(checkReply(s, attestation())[0].pass).toBe(false);
  });
});

describe("replyText", () => {
  it("hides reasoning that leaked before </think>", () => {
    const s = signed("{}", JSON.stringify({ choices: [{ message: { content: "planning...</think> You have 45 minutes." } }] }));
    expect(replyText(s)).toBe("You have 45 minutes.");
  });

  it("decrypts a reply sealed to her", () => {
    const me = newClientKeys();
    const s = signed("{}", JSON.stringify({ choices: [{ message: { content: seal("Leave by 10:05 PM.", me.publicHex) } }] }));
    expect(replyText(s, me.x25519Secret)).toBe("Leave by 10:05 PM.");
  });
});
