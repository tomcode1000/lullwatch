// Renders film.html frame by frame (seek, never real time) into ffmpeg.
//   node render.mjs stills 5,60,110          -> stills/t005.00.jpg
//   node render.mjs video [from] [to] [out]  -> picture only, 30 fps, 1920x1080
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
  createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const W = 1920, H = 1080, FPS = 30;
const CH = 'C:\\Users\\Toleexxzy\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const [mode = 'stills', a1, a2, a3] = process.argv.slice(2);
const br = await chromium.launch({ executablePath: CH, args: ['--force-device-scale-factor=1'] });
const page = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/video/film.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.evaluate(() => window.ready);
const cdp = await page.context().newCDPSession(page);
const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true })).data, 'base64');

if (mode === 'stills') {
  mkdirSync('stills', { recursive: true });
  for (const t of a1.split(',').map(Number)) {
    await page.evaluate((t) => window.render(t), t);
    writeFileSync(`stills/t${t.toFixed(2).padStart(6, '0')}.jpg`, await shot());
  }
  console.log('stills done');
} else {
  const from = +(a1 || 0), to = +(a2 || 162.3), out = a3 || 'pic.mp4';
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((to - from) * FPS);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = from + i / FPS;
    await page.evaluate((t) => window.render(t), t);
    const b = await shot();
    if (!ff.stdin.write(b)) await new Promise((ok) => ff.stdin.once('drain', ok));
    if (i % 300 === 0) console.log(out, `${i}/${n}`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((ok) => ff.on('close', ok));
  console.log('done', out, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await br.close();
server.close();
