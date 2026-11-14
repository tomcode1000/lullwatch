// Live phone takes of the real app at 390x844 x2, CDP screencast with real frame times.
// Each take is one scene, scheduled on the film clock (seconds of the narration):
//   a  setup + timing            64.5 .. 89.5
//   b  sample labour: history, start packing   88.0 .. 104.5
//   c  call midwife script       102.0 .. 116.0   (retried until the live reply is quick)
//   d  warning sign -> go now    114.5 .. 126.5
//   e  ask + privacy proof       124.5 .. 143.5
import { chromium } from 'playwright-core';
import { rmSync } from 'node:fs';
import { B, POINTER, Rec, sleep } from './lib.mjs';

const which = process.argv[2] || 'a';
const SPAN = { a: [64.5, 89.5], b: [88.0, 104.5], c: [102.0, 116.0], d: [114.5, 126.5], e: [124.5, 143.5] }[which];
const CH = 'C:\\Users\\Toleexxzy\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';

async function take() {
  const br = await chromium.launch({ executablePath: CH, args: ['--force-device-scale-factor=2'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'block' });
  await ctx.addInitScript(POINTER('phone'));
  const p = await ctx.newPage();
  const dir = `take/${which}`;
  rmSync(dir, { recursive: true, force: true });
  const r = new Rec(p, which, dir);
  const [T0, T_END] = SPAN;
  let wall0 = 0;
  const clock = () => T0 + (Date.now() - wall0) / 1000;
  const at = async (t) => { const w = t - clock(); if (w > 0) await sleep(w * 1000); };
  const marks = {};
  const mark = (what) => { marks[what] = clock(); r.note(what, clock); console.log(clock().toFixed(2), what); };

  await p.goto(B + '/app/', { waitUntil: 'load', timeout: 120000 });
  await p.evaluate(() => localStorage.clear());
  if (which === 'a') {
    await p.goto(B + '/app/', { waitUntil: 'load', timeout: 120000 });
  } else {
    // ?proof starts the attested session off camera (attestation and the Intel/NVIDIA checks
    // take a while, as on any first visit); on camera only the encrypted chat calls happen.
    await p.goto(B + '/app/?sample&proof', { waitUntil: 'load', timeout: 120000 });
    await p.waitForSelector('.cert.verified', { timeout: 120000 });
    await p.click(`nav.tabs button:has-text("${which === 'e' ? 'Ask' : which === 'b' ? 'Timer' : 'Timer'}")`);
    if (which === 'b') { /* starts on the timer, then goes to History on camera */ }
  }
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => scrollTo(0, 0));
  await sleep(1500);

  await r.start({ w: 780, h: 1688 });
  wall0 = Date.now();
  await p.mouse.move(r.x, r.y);

  if (which === 'a') {
    await at(66.8); await r.tap('.seg button:first-child'); mark('first baby: yes');
    await at(68.2); await r.type('input[placeholder="e.g. St Mary\'s"]', "St Mary's", { delay: 60 }); mark('hospital typed');
    await at(70.0);
    await r.hand(async () => { await r._tap('label:has-text("Journey time") input', {}); await p.keyboard.press('Control+A'); await p.keyboard.type('25', { delay: 90 }); });
    mark('journey 25');
    await at(71.8); await r.hover('.sentence', 700); mark('step 3 in view');
    await at(74.4); await r.tap('button:has-text("My midwife gave me different numbers")'); mark('custom numbers open');
    await at(76.0); await r.tap('button:has-text("Use the standard rule")'); mark('back to standard');
    await at(76.7); await r.tap('button.primary.sticky'); mark('start timing');
    await at(77.6); await r.tap('button.timer'); mark('contraction start');
    await at(83.2); await r.tap('button.timer'); mark('contraction stop');
    await at(84.6); await r.hover('.voice-btn', 600); mark('hover voice');
  } else if (which === 'b') {
    await at(89.6); await r.tap('nav.tabs button:has-text("History")'); mark('history');
    await at(95.0); await r.hand(async () => { await r.moveTo(195, 560, 500); });
    await at(97.2); await r.tap('nav.tabs button:has-text("Timer")'); mark('timer: start packing');
  } else if (which === 'c') {
    await at(105.8); await r.tap('.stage button.action'); mark('call midwife');
    for (let i = 0; i < 600; i++) { if (await p.locator('blockquote.script').count()) break; await sleep(50); }
    mark('script shown');
    await at(115.0); await r.tap('.sheet .icon-btn[aria-label="Close"]'); mark('close');
  } else if (which === 'd') {
    await at(115.4); await r.tap('button.wrong'); mark('flags open');
    await at(116.9); await r.tap('.flag:has-text("Bleeding")'); mark('bleeding');
    await at(119.6); await r.tap('.sheet button.primary'); mark('done: go now');
  } else if (which === 'e') {
    await at(126.6); await r.tap('.suggestion >> nth=1'); mark('asked: bag');
    for (let i = 0; i < 600; i++) { if (await p.locator('.msg.assistant:not(.thinking)').count()) break; await sleep(50); }
    mark('reply shown');
    await at(Math.max(134.4, marks['reply shown'] + 2.6)); await r.tap('nav.tabs button:has-text("Proof")'); mark('proof tab');
    await at(136.4);
    await r.hand(async () => { await r.moveTo(200, 620, 400); await p.evaluate(() => document.scrollingElement.scrollBy({ top: 330, behavior: 'smooth' })); });
    mark('scroll checks');
    await at(140.2);
    await r.hand(async () => { await p.evaluate(() => document.scrollingElement.scrollBy({ top: 430, behavior: 'smooth' })); });
    mark('scroll to last reply');
  }
  await at(T_END);
  await r.stop();
  r.save({ T0, wall0, marks });
  console.log('frames', r.frames.length);
  await br.close();
  return marks;
}

// The call scene needs the live reply on screen by "Every number is checked" (112.2).
for (let attempt = 1; attempt <= 5; attempt++) {
  const m = await take();
  if (which !== 'c' || m['script shown'] < 111.5) break;
  console.log(`attempt ${attempt}: script at ${m['script shown'].toFixed(1)}s, too late; again`);
}
