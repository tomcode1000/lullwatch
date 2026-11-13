# Lullwatch

**Know when to go.** A private labour companion: time your contractions, and Lullwatch tells you when to pack and when to leave for the hospital, counting your journey time. Its AI runs on sealed hardware, and your phone checks the proof.

Built at the NEAR HACKATHON (1–14 Nov 2026), track **03 Privacy & Private AI**.

## The problem

In the last weeks of pregnancy, it's hard to tell when contractions mean it's time to go. Women go too early and are sent home, or leave it too late. Pregnancy data is also among the most sensitive data there is: in August 2025 a US jury found Meta liable for collecting Flo app users' period and pregnancy data.

## What it does

- **Timer:** tap when a contraction starts and stops (or press the space bar).
- **Hands-free voice:** switch voice on and say "now" when a contraction starts and "stop" when it ends, or just ask a question. Speech is transcribed by Whisper inside NEAR AI Cloud's TEE; silence is never sent. Verified replies are read aloud with an on-device voice only. Honest limit: NEAR AI Cloud's end-to-end encryption covers chat, not audio, so short voice clips pass through our server in the clear on their way to Whisper. The server holds each clip in memory for that one request and never stores or logs it; a spoken question is then sealed like a typed one before it reaches the companion.
- **"Leave by 4:36 PM":** fixed rules check whether her midwife's rule (5-1-1 by default) has held long enough. If not yet, a trend line forecasts when it will. Lullwatch subtracts her journey time to give a leave-by time, and says "start packing" two hours before.
- **Tell her partner, call her midwife:** when it's time, one tap opens her own messaging app with the text written ("It's time to leave for St Mary's. Please come now."), and another calls her midwife. No SMS service or server is involved, and the text says only where and when, never her health details.
- **What to say when you call:** tapping "Call midwife" opens a short script for the phone call, written by the sealed AI from her timer ("This is my first baby. My contractions are about 5 minutes apart and last about 60 seconds. I've been timing them for an hour."). It's signed and verified like every reply, and plain code checks that every number in it came from the timer and that it adds nothing she didn't record (weeks, waters, bleeding). If a check fails or the AI is unreachable, a fixed script built on her phone is shown instead. At "Go now" the button dials straight away.
- **Install it, and it works offline:** add Lullwatch to the home screen and the timer, leave-by forecast and warning signs keep working with no connection (labour often starts at night on patchy data). The offline worker ([app/public/sw.js](app/public/sw.js)) never caches the AI, voice or the Intel/NVIDIA checks, so every proof is fresh.
- **Warning signs come first:** waters breaking, bleeding, the baby moving less and other red flags turn the screen to "Go now", whatever the count says.
- **Ask Lullwatch:** a short, calm AI companion (Qwen3.8-27B on NEAR AI Cloud, thinking off) that explains the numbers and helps with breathing or packing. It is never allowed to change the decision.
- **End-to-end encrypted:** her browser seals every message to the model's attested key (X25519 + XChaCha20-Poly1305, NEAR AI Cloud E2EE v2). Our server relays ciphertext only and refuses plain text.
- **Proof of privacy:** each reply comes from a model inside a TEE (Intel TDX + NVIDIA confidential GPUs) on NEAR AI Cloud. Her browser checks the hardware with Intel and NVIDIA itself, and checks every reply's signature. Open the app with `?proof` to run the checks straight away.

## How the privacy proof works

Her browser makes a fresh random nonce, asks for the attestation, and checks:

| Check | How |
|---|---|
| The proof was made just now for this app | The attestation echoes our nonce |
| The AI runs on sealed hardware | Every TEE node serving the model returns an Intel quote and NVIDIA evidence bound to the nonce |
| NVIDIA confirms the GPUs are genuine | NVIDIA's attestation service (NRAS) verdict, with `eat_nonce` equal to our nonce |
| Intel confirms the CPU enclave is genuine and up to date | The TDX quote is verified in the browser with [dcap-qvl](https://github.com/Phala-Network/dcap-qvl) against Intel's collateral, which the browser fetches itself; TCB status must be UpToDate |
| The key that signs replies lives inside that enclave | The quote's `report_data` must equal the signing key (padded to 32 bytes) followed by our nonce |
| The software inside matches its published measurements | RTMR3 replayed from the event log, and MRCONFIGID equal to `01 ‖ SHA-256(app_compose) ‖ 0…` |

Then, for every reply:

| Check | How |
|---|---|
| The reply was signed inside the TEE | Ed25519 signature verified in the browser; the signer must be the attested key |
| Her words reached the AI unchanged | SHA-256 of the exact (encrypted) request bytes matches the signed hash |
| The reply reached her unchanged | SHA-256 of the exact response bytes matches the signed hash |

Messages are sealed to that same attested key, so only the enclave can read them. If our server altered anything, a check fails and the app says so. The checks are in [app/src/verify.ts](app/src/verify.ts); encryption is in [app/src/e2ee.ts](app/src/e2ee.ts).

## Minimal proof (no app, no server)

One end-to-end encrypted completion plus attestation verification with a fresh nonce, using the same code as the app ([scripts/proof.ts](scripts/proof.ts)):

```sh
cd app && npm install
node --env-file=../.env ../scripts/proof.ts
```

Output from a live run (13 Nov 2026):

```
Model: Qwen/Qwen3.8-27B
Nonce: 3a977f4086d1872583a79313716f9cfdf2eedf585e8f665c827b99f9f0a77e6e

Sealed hardware
  PASS  The proof is fresh, made just now for this app
  PASS  The AI runs on sealed hardware  (1 sealed server for Qwen/Qwen3.8-27B)
  PASS  NVIDIA confirms the GPUs are genuine and locked  (8 GPU(s) checked by NVIDIA)
  PASS  Intel confirms the CPU enclave is genuine and up to date  (UpToDate)
  PASS  The key that signs replies lives inside that enclave
  PASS  The software inside matches its published measurements

Question: Contractions are 6 minutes apart. Should I leave yet? Answer in one sentence.
Reply:    Please call your midwife now to confirm if it is time to head to the hospital.

This reply
  PASS  The reply was signed inside the sealed hardware  (89154a43a47684742c3d1753252bb6f49f61da9d8c84fc9b1def2df130cb2d93)
  PASS  Your words reached the AI unchanged
  PASS  The reply reached you unchanged
  PASS  Only ciphertext crossed the network

VERIFIED · 55 in / 19 out tokens
```

## Testing

- **Decision rules:** 36 tests, including realistic labours generated with uneven timing: false labour (Braxton Hicks), early labour that stalls, uneven 4-6 minute gaps, a missed tap, a contraction stopped early by mistake, a long pause, a fast second baby, journeys from 10 to 90 minutes, and every warning sign. A missed tap never restarts the count, because that would delay leaving.
- **Companion:** [evals/](evals) holds 24 questions a woman in labour might ask, each with the timer state she'd be in, checked by plain code: it explains the right leave time and never invents one; it sends her to her midwife for waters breaking, bleeding, reduced movement, headache with blurred vision, constant pain or fever; it holds "go now" when she asks to wait; it refuses to move the leave time or reveal its instructions; it never diagnoses or doses medicine. Each run uses one attested session exactly like the app: Intel and NVIDIA checks, every message encrypted, every reply decrypted and signature-checked, and a check that only ciphertext crossed our server. Latest run: **24/24, end-to-end encrypted, proof verified** ([results](evals/results.md)), for under half a cent.
- **Voice:** 6 phrases in 2 voices, clean and with background noise added, 24/24 understood. Pure noise is ignored.
- **Privacy checks, encryption and spending guard:** tampered replies, forged signatures, replayed proofs, swapped servers, out-of-date hardware, altered measurements, tampered ciphertext, plain text refused, rate limits, daily and total caps.

`cd app && npm test` and `cd server && npm test` run everything except the live evals.

## Safety

- The AI explains; fixed rules decide. The decision logic ([app/src/engine/labour.ts](app/src/engine/labour.ts)) is plain code with tests.
- The rule is whatever her midwife told her. 5-1-1 is only the default.
- Lullwatch supports her decision. It does not replace a midwife or doctor.

## Privacy by design

- Contractions are stored only on her phone (browser storage). Sample data is never stored.
- The model sees the timer's summary (stage, average gap and length, leave-by time), not the raw log.
- The server keeps the API key, rate limits and a spending cap. For chat it only ever sees ciphertext; voice clips pass through unencrypted for one request and are never stored (see Hands-free voice above). It records only token counts and dollars.
- Each visit uses fresh encryption keys, so nothing links one session's questions to another's.

## Run it

You need Node 22.18 or newer and a NEAR AI Cloud API key.

```sh
echo "NEARAI_API_KEY=your-key" > .env

cd server && npm run dev          # API on :8787
cd app && npm install && npm run dev   # app on :5173, proxies /api
```

Open the app with `?sample` (for example http://localhost:5173/?sample) to load a fictional labour.

Tests: `cd app && npm test` (engine, scenarios, voice commands, verification), `cd server && npm test` (spending guard and prompt). Live companion eval: with the server running, `cd app && node ../evals/run.ts`.

## Layout

```
app/      React + Vite web app
  src/engine/labour.ts   the decision rules and forecast
  src/verify.ts          the in-browser privacy checks (NVIDIA, Intel TDX, signatures)
  src/e2ee.ts            end-to-end encryption to the attested model key
  src/companion.ts       the instructions, sealing, asking and checking
  src/Ask.tsx            the AI companion
  src/Voice.tsx          hands-free listening (pre-roll, silence detection, WAV)
  src/commands.ts        what a spoken phrase means: start, stop or a question
server/   Node server (no dependencies): key, limits, NEAR AI Cloud calls
evals/    live companion eval: 24 cases, code-checked
scripts/proof.ts   the minimal proof: one encrypted completion + every attestation check
```

## License

MIT
