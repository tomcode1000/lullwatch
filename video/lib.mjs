// Shared recorder helpers: CDP screencast with real frame timestamps, a hand-paced pointer,
// taps and typing on the real product. Nothing is drawn on the page except the pointer.
import { mkdirSync, writeFileSync } from 'node:fs';

export const B = process.env.B || 'https://lullwatch.54-255-109-186.sslip.io';
export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Phone pointer: a soft touch dot (a phone has no arrow), ring on press. Desktop: plain arrow.
export const POINTER = (kind) => `(() => {
  const add = () => {
    if (document.getElementById('__ptr')) return;
    const p = document.createElement('div'); p.id = '__ptr';
    const phone = ${kind === 'phone'};
    p.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:opacity .25s;opacity:0;' + (phone
      ? 'width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.75);box-shadow:0 4px 14px rgba(0,0,0,.35)'
      : 'width:22px;height:30px;margin:0;background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 22 30%27><path d=%27M2 2v22l6-5 4 9 4-2-4-9h8z%27 fill=%27white%27 stroke=%27black%27 stroke-width=%271.6%27 stroke-linejoin=%27round%27/></svg>") no-repeat;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))');
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:3px solid rgba(255,255,255,.9);opacity:0;transform:scale(.4)';
    document.documentElement.append(p, ring);
    let hide;
    addEventListener('mousemove', (e) => { p.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; p.style.opacity = 1; clearTimeout(hide); hide = setTimeout(() => { if (phone) p.style.opacity = 0; }, 1600); }, true);
    addEventListener('mousedown', (e) => {
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
      ring.animate([{ opacity: .9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 450, easing: 'ease-out' });
      if (phone) p.animate([{ transform: p.style.transform + ' scale(1)' }, { transform: p.style.transform + ' scale(.82)' }, { transform: p.style.transform + ' scale(1)' }], { duration: 220 });
    }, true);
  };
  if (document.documentElement) add(); document.addEventListener('DOMContentLoaded', add);
})();`;

export class Rec {
  constructor(page, name, dir) {
    this.page = page; this.name = name; this.dir = dir; this.frames = []; this.x = 195; this.y = 600; this.log = [];
    mkdirSync(dir, { recursive: true });
  }
  async start({ w, h, nth = 1 }) {
    this.cdp = await this.page.context().newCDPSession(this.page);
    let n = 0;
    this.cdp.on('Page.screencastFrame', async (f) => {
      const file = `${String(n++).padStart(6, '0')}.jpg`;
      writeFileSync(`${this.dir}/${file}`, Buffer.from(f.data, 'base64'));
      this.frames.push({ f: file, t: f.metadata.timestamp });
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: w, maxHeight: h, everyNthFrame: nth });
  }
  async stop() { try { await this.cdp.send('Page.stopScreencast'); } catch {} }
  save(extra = {}) { writeFileSync(`${this.dir}/frames.json`, JSON.stringify({ frames: this.frames, log: this.log, ...extra })); }
  note(what, clock) { this.log.push({ t: clock ? clock() : null, wall: Date.now() / 1000, what }); }

  // Eased move, paced by the clock (not by step count) so slow frames never make it late.
  async moveTo(x, y, ms = 420) {
    const x0 = this.x, y0 = this.y, t0 = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = ease(k);
      // a slight arc, like a hand
      const arc = Math.sin(k * Math.PI) * Math.min(18, Math.hypot(x - x0, y - y0) * 0.06);
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e - arc);
      if (k >= 1) break;
      await sleep(16);
    }
    this.x = x; this.y = y;
  }
  async box(sel) {
    const el = this.page.locator(`${sel} >> visible=true`).first();
    await el.waitFor({ state: 'visible', timeout: 20000 });
    // scroll smoothly if it is not comfortably in view, the way a thumb would
    const inView = await el.evaluate((n) => { const r = n.getBoundingClientRect(); return n.closest('.tabs, .sheet, .composer, .top, .primary.sticky') ? true : (r.top > 60 && r.bottom < innerHeight - 70); });
    if (!inView) {
      await el.evaluate((n) => {
        const sc = (() => { let p = n.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p; p = p.parentElement; } return document.scrollingElement; })();
        const r = n.getBoundingClientRect();
        sc.scrollBy({ top: r.top - innerHeight * 0.45, behavior: 'smooth' });
      });
      let last = -1;
      for (let i = 0; i < 60; i++) { await sleep(50); const y = await el.evaluate((n) => Math.round(n.getBoundingClientRect().top)); if (y === last) break; last = y; }
    }
    return el.boundingBox();
  }
  // One hand per phone: gestures never overlap.
  async hand(fn) { const prev = this._h || Promise.resolve(); let done; this._h = new Promise((ok) => { done = ok; }); await prev; try { return await fn(); } finally { done(); } }
  async sheetOpen() { return this.page.evaluate(() => document.querySelector('.moment-scrim h2')?.textContent || null).catch(() => null); }
  async idle(maxMs = 15000) { const t0 = Date.now(); while (Date.now() - t0 < maxMs && (await this.sheetOpen())) await sleep(120); }
  // Close each moment sheet by hand after a reading pause. rules: [[titleStart, holdSec, notBefore, 'primary'|'quiet']]
  async watchSheets(rules, clock, until, mark) {
    let cur = null, seen = 0;
    while (clock() < until) {
      const title = await this.sheetOpen();
      if (title && title !== cur) { cur = title; seen = clock(); mark(`${this.name} sheet: ${title}`); }
      if (!title) cur = null;
      if (title) {
        const r = rules.find(([k]) => title.startsWith(k)) || ['', 3.0, 0, null];
        const want = Math.max(seen + r[1], r[2]);
        if (clock() >= want) {
          const which = r[3] || ((await this.page.locator('.moment-scrim [data-m=quiet]').count()) ? 'quiet' : 'primary');
          await this._tap(`.moment-scrim [data-m=${which}]`, {});
          mark(`${this.name} closed: ${title} (${which})`);
          cur = null; await sleep(400);
        }
      }
      await sleep(120);
    }
  }
  async tap(sel, opt = {}) { return this.hand(() => this._tap(sel, opt)); }
  async _tap(sel, { pause = 140, move = 420, left = false } = {}) {
    const b = await this.box(sel);
    await this.moveTo(left ? b.x + 22 : b.x + b.width / 2, b.y + b.height / 2, move);
    await sleep(pause);
    await this.page.mouse.down(); await sleep(70); await this.page.mouse.up();
  }
  async hover(sel, ms = 420) { return this.hand(async () => { const b = await this.box(sel); await this.moveTo(b.x + b.width / 2, b.y + b.height / 2, ms); }); }
  async type(sel, text, { delay = 42, move = 380, left = false } = {}) {
    await this.hand(async () => { await this._tap(sel, { move, pause: 90, left }); await this.page.keyboard.type(text, { delay }); });
  }
}
