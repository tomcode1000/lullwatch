# Lullwatch

**Know when to go.** A private labour companion: time your contractions, and Lullwatch tells you when to pack and when to leave for the hospital, counting your journey time. Its AI runs on sealed hardware, and your phone checks the proof.

Built at the NEAR HACKATHON (1–14 Nov 2026), track **03 Privacy & Private AI**.

## The problem

In the last weeks of pregnancy, it's hard to tell when contractions mean it's time to go. Women go too early and are sent home, or leave it too late. Pregnancy data is also among the most sensitive data there is: in August 2025 a US jury found Meta liable for collecting Flo app users' period and pregnancy data.

## What it does

- **Timer:** tap when a contraction starts and stops (or press the space bar).
- **"Leave by 4:36 PM":** fixed rules check whether her midwife's rule (5-1-1 by default) has held long enough. If not yet, a trend line forecasts when it will. Lullwatch subtracts her journey time to give a leave-by time, and says "start packing" two hours before.
- **Warning signs come first:** waters breaking, bleeding, the baby moving less and other red flags turn the screen to "Go now", whatever the count says.
- **Ask Lullwatch:** a short, calm AI companion that explains the numbers and helps with breathing or packing. It is never allowed to change the decision.
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

What the proof doesn't cover yet: our server relays questions in plain text (it stores and logs nothing), and the Intel TDX quote is not yet checked against Intel's collateral in the browser.

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

Tests: `cd app && npm test` (engine and verification), `cd server && npm test` (spending guard and prompt).

## Layout

```
app/      React + Vite web app
  src/engine/labour.ts   the decision rules and forecast
  src/verify.ts          the in-browser privacy checks
  src/Ask.tsx            the AI companion
server/   Node server (no dependencies): key, limits, NEAR AI Cloud calls
```

## License

MIT
