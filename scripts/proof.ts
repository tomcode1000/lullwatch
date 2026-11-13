// The minimal proof, no app and no server: one end-to-end encrypted
// completion from a TEE-hosted model on NEAR AI Cloud, with the attestation
// fetched for a fresh random nonce and every check printed.
//
//   cd app && npm install
//   node --env-file=../.env ../scripts/proof.ts       (costs about $0.0002)
//
// It uses the same code as the app: server/nearai.ts fetches the evidence,
// app/src/verify.ts checks it, app/src/e2ee.ts seals and opens the messages.

import { attest, chat } from "../server/nearai.ts";
import { buildRequest } from "../server/request.ts";
import { newClientKeys, seal } from "../app/src/e2ee.ts";
import { checkAttestation, checkIntel, checkReply, defaultIntelVerifier, newNonce, replyText, type Check } from "../app/src/verify.ts";

const KEY = process.env.NEARAI_API_KEY;
if (!KEY) throw new Error("Put NEARAI_API_KEY in .env");
const MODEL = process.env.CHAT_MODEL ?? "Qwen/Qwen3.8-27B";

const show = (title: string, checks: Check[]) => {
  console.log(`\n${title}`);
  for (const c of checks) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
};

// 1. Attestation for a nonce made just now.
const nonce = newNonce();
console.log(`Model: ${MODEL}\nNonce: ${nonce}`);
const a = await attest(KEY, MODEL, nonce);
const hardware = [...checkAttestation(a, nonce), ...(await checkIntel(a, nonce, await defaultIntelVerifier()))];
show("Sealed hardware", hardware);

// 2. One completion, sealed to the attested key so only the enclave can read it.
const modelKey = a.models.find((m) => m.signing_algo === "ed25519")?.signing_address.replace(/^0x/, "");
if (!modelKey) throw new Error("No attested ed25519 key to encrypt to");
const keys = newClientKeys();
const question = "Contractions are 6 minutes apart. Should I leave yet? Answer in one sentence.";
const body = buildRequest(
  {
    messages: [
      { role: "system", content: seal("You are a calm labour companion. Be brief and send her to her midwife for medical decisions.", modelKey) },
      { role: "user", content: seal(question, modelKey) },
    ],
    clientPubKey: keys.publicHex,
    modelPubKey: modelKey,
  },
  MODEL,
);
const signed = await chat(KEY, body, MODEL, { clientPubKey: keys.publicHex, modelPubKey: modelKey });
const reply = replyText(signed, keys.x25519Secret);
const onTheWire = !body.includes(question) && !signed.responseText.includes(reply.slice(0, 20));

console.log(`\nQuestion: ${question}\nReply:    ${reply}`);
show("This reply", [...checkReply(signed, a), { name: "Only ciphertext crossed the network", pass: onTheWire }]);

const all = [...hardware, ...checkReply(signed, a)].every((c) => c.pass) && onTheWire;
console.log(`\n${all ? "VERIFIED" : "NOT VERIFIED"} · ${signed.usage.prompt_tokens} in / ${signed.usage.completion_tokens} out tokens`);
process.exit(all ? 0 : 1);
