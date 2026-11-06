# Lullwatch: a private labour agent

NEAR HACKATHON, track 03 Privacy & Private AI. Build 1-14 Nov 2026; deadline 14 Nov 23:59 UTC.

## The problem
In late pregnancy it's hard to tell when contractions mean "go to the hospital". Women go too early and are sent home, or leave too late. Pregnancy data is also among the most sensitive data there is: in Aug 2025 a US jury found Meta liable for collecting Flo app users' period and pregnancy data.

## What it does
1. She talks to the agent hands-free. She says "now" when a contraction starts and "stop" when it ends. Voice is transcribed by Whisper on NEAR AI Cloud.
2. The app counts each contraction's length and the gap between contractions, and watches the trend.
3. It forecasts when she'll meet her midwife's rule (by default 5-1-1: contractions 5 minutes apart, lasting 1 minute, for 1 hour). It subtracts the travel time to her chosen hospital and tells her "start packing" and then "leave by 7:40pm". A second baby usually comes faster, so the rule is tighter.
4. When it's time, it texts her partner or midwife by SMS. The text says only "time to leave"; none of her data leaves her phone.
5. Every AI reply comes from a model running in a sealed enclave (a TEE), and she can see a "Verified" panel showing the proof checks.

## Why it fits track 03
- The track's sponsor tech is TEE + NEAR AI Cloud. This uses both, for data where privacy truly matters.
- The track's own prompt asks for:
  - NEAR AI Cloud through its OpenAI-compatible API, with the key in .env
  - an attestation report requested with a fresh nonce, plus a "Verified" panel
  - nothing stored server-side
  - fictional sample data for judges
  All four apply here.
- Most entrants will build the track's suggested expense auditor. This one is different and solves a daily-life problem.

## Payments
Not required. The track asks for TEE and NEAR AI Cloud only. Adding crypto payments would be forced, and judges mark forced chain use down. Her data must never go on-chain.

## Design rules (safety)
- A fixed rule engine decides "pack" or "go", using her midwife's numbers. The AI only talks and explains; it never makes the go decision alone.
- Warning signs skip the AI entirely. Waters breaking, bleeding, the baby moving less, or severe constant pain show an immediate "call now / go now" with the local emergency number.
- It says plainly that it supports her decision and does not replace a midwife or doctor.
- Contraction log stays on her device, encrypted. The server keeps nothing after a reply.

## Checked so far (3 Nov)
- NEAR AI Cloud lists openai/whisper-large-v3 (audio to text) and TEE-friendly models such as Qwen/Qwen3.8-27B and z-ai/glm-5.3-flash.
- The model list doesn't say which privacy tier each model runs in. The tiers are:
  - Confidential TEE: NEAR's own GPUs
  - 3P TEE: another provider's enclave
  - Incognito: only the gateway runs in a TEE
  Checked 5 Nov: Whisper, glm-5.3-flash and Qwen3.8-27B all return NVIDIA GPU enclave proofs (Confidential TEE).
- Credits: $10 key claimed via NEAR Builders (5 Nov).
- No "AI labour agent" found. Contraction timer apps exist, so the timer alone is not new.

## Budget: $10 must last past submission
Prices are per million tokens:

| Model | Input | Output | Use |
|---|---|---|---|
| z-ai/glm-5.3-flash | $0.08 | $0.50 | chat (default) |
| Qwen/Qwen3.8-27B | $0.04 | $1.35 | backup chat |
| openai/whisper-large-v3 | $0.01 | $0.01 | voice to text |

A typical reply is about 1,500 tokens in and 150 out, which costs about $0.0002. That's roughly 40,000 replies for $10. The real danger is bugs and strangers, not normal use.

Rules:
- The timer, forecast and warning signs run on her phone and cost nothing. The AI is called only when she speaks or asks something.
- The attestation report endpoint is free; cache it for a few minutes anyway.
- Every call sets max_tokens to 250 or less, with reasoning off. Keep prompts short.
- The key lives only on our server. The server has a per-visitor rate limit and a hard daily spending cap; it stops calling the AI when the cap is hit.
- Tests and development use recorded responses, never live calls. Live calls happen only in a manual check.
- Don't use the browser's built-in voice recognition: Chrome sends audio to Google, which breaks the privacy promise. Use Whisper on NEAR AI Cloud, and send short clips only.

## First step (the track's own advice)
A minimal script: one completion plus attestation verification with a fresh nonce, run against
https://cloud-api.near.ai/v1. Use near-examples/nearai-cloud-verification-example and nearai/nearai-cloud-verifier as references. Only then build the UI.
