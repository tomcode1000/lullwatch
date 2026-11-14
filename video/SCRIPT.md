# Lullwatch demo video: narration script

For: you to record as the voiceover. About 2 minutes 20 seconds at a calm pace.
Leave about one second of silence between paragraphs (the edit cuts there).
Numbers are written as words so they read naturally. Every claim matches what's on screen.

---

## Narration

**1. Hook**
It's two in the morning. Her contractions started an hour ago, and she has one question. Is this it?

**2. The problem**
Go in too early, and she's sent home. Leave it too late, and the journey itself becomes the risk.

**3. The second problem**
And the apps that could help her want the most private data there is. In twenty twenty-five, a US jury found Meta liable for collecting pregnancy data from Flo app users.

**4. What it is**
This is Lullwatch. A private labour companion that tells her when to pack, and when to leave for the hospital. Its AI runs on sealed hardware on NEAR AI Cloud, and her own phone checks the proof.

**5. Setup**
Setup is three questions. Is this her first baby, which hospital, and how long the journey takes. Lullwatch applies the standard rule for her. If her midwife gave her different numbers, those win.

**6. Timing**
When a contraction starts, she taps. When it ends, she taps again. Or, hands free, she just says "now" and "stop". The log never leaves her phone.

**7. The decision**
A few hours in, the gaps are shrinking. Fixed, tested rules watch the trend, forecast when she'll meet her midwife's rule, subtract the journey, and give her a time. Start packing. Leave by this time.

**8. The call**
When it's time to call the maternity unit, she doesn't have to think. She taps Call midwife, and the sealed AI writes exactly what to say, from her timer. Every number is checked against the timer before she sees it.

**9. Warning signs**
And if something feels wrong, like bleeding, or the baby moving less, the count doesn't matter anymore. Lullwatch says go now. Rules decide. The AI only explains.

**10. Private by proof**
She can ask it anything. Her question is encrypted on her phone, to a key only the sealed hardware holds. Then her phone checks for itself. NVIDIA confirms the GPUs. Intel confirms the enclave is up to date. And every reply is signed inside it.

**11. Why NEAR**
Nobody can read her labour. Not even us. That's what NEAR AI Cloud makes possible: private AI you can verify, not just trust.

**12. Close**
Lullwatch is free, open source, and works offline. Know when to go.

---

## Scene plan (what the judges see)

| # | Line | On screen | Type |
|---|---|---|---|
| 1 | "two in the morning… Is this it?" | Dark night scene in the landing page's graded teal style: a phone clock reads 2:00 AM, then the words "Is this it?" in Instrument Serif | Motion |
| 2 | "too early… too late" | Two cards: "Too early: sent home", "Too late: the journey is the risk" | Motion |
| 3 | "Meta liable… Flo" | Third card "Too exposed", with the Flo verdict as a quoted line | Motion |
| 4 | "This is Lullwatch" | Logo sting, then the **live landing page** in a browser window: hero, "Know when *to go.*", then a smooth scroll through How it works | Live capture (1280x720 @1.5) |
| 5 | "Setup is three questions" | Phone in a device frame: the real setup screen, typed by hand (Yes, St Mary's, 30). The "standard rule" sentence appears in step 3 | Live phone (390x844) |
| 6 | "she taps… now and stop" | Phone: tap the big button, the orange ripple and live seconds, tap again. A callout beside the phone reads "Voice: say now / stop" | Live phone + side callout |
| 7 | "gaps are shrinking… Start packing" | Phone with the sample labour: the History chart of shrinking gaps, then the Timer with "Start packing / Leave for St Mary's by …" | Live phone |
| 8 | "Call midwife… what to say" | Phone: tap Call midwife, the script appears with "Written in sealed hardware · verified". Callout: "Every number checked against the timer" | Live phone + side callout |
| 9 | "something feels wrong… go now" | Phone: open "Something feels wrong?", tick "Bleeding", Done, the card turns red: "Go now" | Live phone |
| 10 | "ask it anything… Intel… NVIDIA" | Phone: Ask a question, verified reply. Then the Proof tab with checks ticking in. Callouts beside it: "Encrypted on the phone", "NVIDIA ✓", "Intel ✓", "Signed in the enclave" | Live phone + side callouts |
| 11 | "Not even us… NEAR AI Cloud" | The landing page's dark privacy band ("Nobody can read it. *Not even us.*") in the browser window, then a motion card: "Private AI you can verify, not just trust" | Live capture, then motion |
| 12 | "free, open source… Know when to go" | The landing page's closing section, then an end card: logo, lockup, the live URL and the GitHub link | Live capture, then motion |

Live times on the app ("Leave by …") come from the real clock at recording, so the
narration never names a specific time.

## Production notes (rules from the product-demo-video skill)

- **Real product only.** Nothing is drawn over the app or the landing page; emphasis sits in
  callouts beside the phone and in captions below the frame.
- **Landing page** recorded live with a hand-moved arrow cursor and eased scrolling at
  1280x720 @1.5; **phone** at its real 390x844, in a device frame on the brand's dark field.
- **Motion scenes** use the landing page's own language: graded teal photo fields, Instrument
  Serif headlines with the italic phrase in the glow colour, mono kickers.
- **New rungs over Detour (v9):** designed transitions (a teal wipe between scenes),
  burned-in captions styled in the brand (below the frame, never over the product), and a 1:1
  square cut for the X timeline, alongside the 1080p master and a 9:16 cut.
- Music: an original bed from make_music.py (tense for 1 to 3, lift on 4, under for the
  demo, resolve on 11 and 12), ducked under your voice.

## How to record

1. Read the narration above in a quiet room, phone or laptop mic is fine.
2. Pause about one second between the numbered paragraphs.
3. Save it as an mp3 (or m4a) and put it in `lullwatch/video/` or Downloads, then tell me.
