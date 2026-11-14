// The live landing page at 1280x720 x1.5 (1920x1080 frames), captured frame by frame at 30 fps:
// the real page, a real mouse (hover states fire) and eased trackpad scrolls. Nothing drawn on it
// except the arrow cursor.
//   node rec-landing.mjs l1|l2|l3
import { chromium } from 'playwright-core';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { B, POINTER, sleep } from './lib.mjs';

const which = process.argv[2] || 'l1';
const FPS = 30;
const CH = 'C:\\Users\\Toleexxzy\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const dir = `take/${which}`;
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const br = await chromium.launch({ executablePath: CH, args: ['--force-device-scale-factor=1.5'] });
const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
await ctx.addInitScript(POINTER('desktop'));
const p = await ctx.newPage();
await p.goto(B + '/', { waitUntil: 'load', timeout: 120000 });
await p.evaluate(() => document.fonts.ready);
await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
await sleep(2500);

const topOf = (sel, pad = 0) => p.evaluate(([s, pad]) => Math.round(document.querySelector(s).getBoundingClientRect().top + scrollY - pad), [sel, pad]);
const rectAt = async (sel, y) => { await p.evaluate((y) => scrollTo(0, y), y); await sleep(200); return p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); };

let T0, T_END, S, C;
if (which === 'l1') {
  // "So we built Lullwatch" (54.98) .. "Setup is three questions" (66.08)
  T0 = 56.4; T_END = 66.3;
  const how = await topOf('#how', -10);
  const btn = await rectAt('.hero-copy .primary-l', 0);
  const h1 = await rectAt('.hero-copy h1', 0);
  const phone = await rectAt('#how .phone', how);
  S = [[56.4, 0], [62.4, 0], [63.7, how]];
  C = [[56.4, 1000, 560], [58.2, h1[0] + 120, h1[1] + 10], [60.6, btn[0], btn[1]], [62.2, btn[0] + 20, btn[1] + 30], [64.6, phone[0] + 40, phone[1] - 60], [66.3, phone[0] + 60, phone[1] - 40]];
} else if (which === 'l2') {
  // "Nobody can read her labour" (143.66) .. "Private AI you can verify" (149.28)
  T0 = 142.6; T_END = 149.6;
  const pv = await topOf('#privacy', 0);
  const y0 = pv + 40;
  const cert = await rectAt('.cert-l', y0);
  const cta = await rectAt('#privacy .primary-l', y0);
  S = [[142.6, y0 - 160], [143.6, y0]];
  C = [[142.6, 640, 600], [144.6, cert[0] - 60, cert[1] - 120], [146.6, cert[0] - 40, cert[1] + 60], [148.6, cta[0], cta[1]], [149.6, cta[0] + 6, cta[1] + 4]];
} else {
  // "Lullwatch is free, open source, and works offline" (155.08) .. "Know when to go" (158.92)
  T0 = 154.8; T_END = 159.2;
  const cl = await topOf('.closing', 0);
  const y = cl - 40;
  const btn = await rectAt('.closing .primary-l', y);
  S = [[154.8, y - 200], [155.8, y]];
  C = [[154.8, 900, 620], [157.2, btn[0], btn[1]], [159.2, btn[0] + 4, btn[1] + 3]];
}
await p.evaluate(() => scrollTo(0, 0)); await sleep(400);

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const cursor = (t) => {
  let i = 0; while (i + 1 < C.length && C[i + 1][0] <= t) i++;
  if (i + 1 >= C.length) return C.at(-1).slice(1);
  const [t1, x1, y1] = C[i + 1], [t0, x0, y0] = C[i];
  const dur = Math.min(1.1, t1 - t0); const k = Math.max(0, Math.min(1, (t - (t1 - dur)) / dur)); const e = ease(k);
  const arc = Math.sin(k * Math.PI) * Math.min(18, Math.hypot(x1 - x0, y1 - y0) * 0.06);
  return [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e - arc];
};
const scroll = (t) => {
  let i = 0; while (i + 1 < S.length && S[i + 1][0] <= t) i++;
  if (i + 1 >= S.length) return S.at(-1)[1];
  const [t0, y0] = S[i], [t1, y1] = S[i + 1];
  const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  return Math.round(y0 + (y1 - y0) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
};

const cdp = await ctx.newCDPSession(p);
const frames = [];
const n = Math.round((T_END - T0) * FPS);
for (let i = 0; i < n; i++) {
  const t = T0 + i / FPS;
  await p.evaluate((y) => scrollTo(0, y), scroll(t));
  const [x, y] = cursor(t);
  await p.mouse.move(x, y);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true });
  const f = `${String(i).padStart(6, '0')}.jpg`;
  writeFileSync(`${dir}/${f}`, Buffer.from(data, 'base64'));
  frames.push({ f, t: i / FPS });
}
// same shape as the phone takes: film time = T0 + (t - wall0/1000)
writeFileSync(`${dir}/frames.json`, JSON.stringify({ T0, wall0: 0, frames }));
console.log(which, 'frames', frames.length);
await br.close();
