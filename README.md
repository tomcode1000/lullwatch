# Lullwatch

**Know when to go.** A private labour companion: time your contractions, and Lullwatch tells you when to pack and when to leave for the hospital, counting your journey time. Its AI runs on sealed hardware, and your phone checks the proof.

Built at the NEAR HACKATHON (1–14 Nov 2026), track **03 Privacy & Private AI**.

## The problem

In the last weeks of pregnancy, it's hard to tell when contractions mean it's time to go. Women go too early and are sent home, or leave it too late. Pregnancy data is also among the most sensitive data there is: in August 2025 a US jury found Meta liable for collecting Flo app users' period and pregnancy data.

## What it does

- **Timer:** tap when a contraction starts and stops (or press the space bar).
- **Hands-free voice:** switch voice on and say "now" when a contraction starts and "stop" when it ends, or just ask a question. Speech is transcribed by Whisper inside NEAR AI Cloud's TEE; silence is never sent. Verified replies are read aloud with an on-device voice only.
- **"Leave by 4:36 PM":** fixed rules check whether her midwife's rule (5-1-1 by default) has held long enough. If not yet, a trend line forecasts when it will. Lullwatch subtracts her journey time to give a leave-by time, and says "start packing" two hours before.
- **Warning signs come first:** waters breaking, bleeding, the baby moving less and other red flags turn the screen to "Go now", whatever the count says.
- **Ask Lullwatch:** a short, calm AI companion (Qwen3.8-27B on NEAR AI Cloud, thinking off) that explains the numbers and helps with breathing or packing. It is never allowed to change the decision.
- **Proof of privacy:** each reply comes from a model inside a TEE (Intel TDX + NVIDIA confidential GPUs) on NEAR AI Cloud. The browser itself checks six things, listed below.

## How the privacy proof works

Her browser makes a fresh random nonce and runs these checks:

| Check | How |
|---|---|
| The proof was made just now for this app | The attestation report echoes our nonce |
| The AI runs on sealed hardware | Every TEE node serving the model returns attestation bound to the nonce |
| NVIDIA confirms the GPUs are genuine | NVIDIA's attestation service (NRAS) verdict, with `eat_nonce` equal to our nonce |
| The reply was signed inside the TEE | EIP-191 signature recovered in the browser; the signer must be an attested model key |
| Her words reached the AI unchanged | SHA-256 of the exact request bytes matches the signed hash |
| The reply reached her unchanged | SHA-256 of the exact response bytes matches the signed hash |

If our server altered a reply, the last check fails and the app says so. The checks are in [app/src/verify.ts](app/src/verify.ts).

## Testing

- **Decision rules:** 36 tests, including realistic labours generated with uneven timing: false labour (Braxton Hicks), early labour that stalls, uneven 4-6 minute gaps, a missed tap, a contraction stopped early by mistake, a long pause, a fast second baby, journeys from 10 to 90 minutes, and every warning sign. A missed tap never restarts the count, because that would delay leaving.
- **Companion:** [evals/](evals) holds 24 questions a woman in labour might ask, each with the timer state she'd be in, checked by plain code: it explains the right leave time and never invents one; it sends her to her midwife for waters breaking, bleeding, reduced movement, headache with blurred vision, constant pain or fever; it holds "go now" when she asks to wait; it refuses to move the leave time or reveal its instructions; it never diagnoses or doses medicine. Every reply must also pass the six privacy checks. Latest run: **24/24** ([results](evals/results.md)), for under half a cent.
- **Voice:** 6 phrases in 2 voices, clean and with background noise added, 24/24 understood. Pure noise is ignored.
- **Privacy checks and spending guard:** tampered replies, replayed proofs, wrong signing keys, rate limits, daily and total caps.

`cd app && npm test` and `cd server && npm test` run everything except the live evals.

## Safety

- The AI explains; fixed rules decide. The decision logic ([app/src/engine/labour.ts](app/src/engine/labour.ts)) is plain code with tests.
- The rule is whatever her midwife told her. 5-1-1 is only the default.
- Lullwatch supports her decision. It does not replace a midwife or doctor.

## Privacy by design

- Contractions are stored only on her phone (browser storage). Sample data is never stored.
- The model sees the timer's summary (stage, average gap and length, leave-by time), not the raw log.
- The server keeps the API key, rate limits and a spending cap. It records only token counts and dollars, never what anyone said.

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
  src/verify.ts          the in-browser privacy checks
  src/Ask.tsx            the AI companion
  src/Voice.tsx          hands-free listening (pre-roll, silence detection, WAV)
  src/commands.ts        what a spoken phrase means: start, stop or a question
server/   Node server (no dependencies): key, limits, NEAR AI Cloud calls
evals/    live companion eval: 24 cases, code-checked
```

## License

MIT
