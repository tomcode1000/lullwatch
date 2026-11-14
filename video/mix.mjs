// Soundtrack: narration (levelled), the music bed ducked under the voice, effects on their frames.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TOTAL = 162.3;
const ev = [];
const add = (f, t, g) => { if (t != null && t >= 0 && t < TOTAL) ev.push([f, +t.toFixed(3), g]); };

// scene changes (the teal wipes)
for (const t of [54.7, 65.75, 142.15]) add('whoosh', t, 0.3);
add('chime', 55.15, 0.4); // logo
// research builds
add('pop', 21.2, 0.3); add('pop', 29.3, 0.22); add('pop', 31.4, 0.22); add('pop', 47.35, 0.3);
for (let i = 0; i < 18; i += 3) add('pop', 45.1 + i * 0.06, 0.12);
// callouts beside the phone
for (const t of [68.3, 69.3, 70.9, 73.3, 74.7, 83.3, 86.6, 90.4, 91.8, 94.4, 97.0, 99.8, 106.5, 109.0, 112.2, 117.2, 123.7, 129.6, 131.3]) add('pop', t, 0.16);
for (const t of [135.8, 138.4, 141.0]) add('chime', t, 0.18);
// taps on the real app, from the takes' own logs
for (const take of ['a', 'b', 'c', 'd', 'e']) {
  const j = JSON.parse(readFileSync(`take/${take}/frames.json`, 'utf8'));
  for (const l of j.log) if (l.t != null && !/shown|scroll|hover|in view/.test(l.what)) add('tap', l.t - 0.05, 0.3);
}
// the product's own moments
add('chime', 110.6, 0.35); // verified call script appears (take c)
add('error', 121.75, 0.3); // go now (take d)
add('chime', 130.65, 0.3); // verified reply (take e)
add('chime', 159.0, 0.45); // close
console.log(ev.length, 'effects');

const inputs = ['-i', 'narration.mp3', '-i', 'music.wav'];
ev.forEach(([f]) => inputs.push('-i', `sfx/${f}.wav`));
let g = `[0:a]aresample=48000,highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${TOTAL},asplit=2[voice][key];`;
g += `[1:a]aresample=48000,volume=0.4,atrim=0:${TOTAL},afade=t=in:d=1.5,afade=t=out:st=${TOTAL - 3}:d=3[bed];`;
g += `[bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked];`;
const labels = [];
ev.forEach(([, t, gain], i) => { g += `[${i + 2}:a]aresample=48000,volume=${gain},adelay=${Math.round(t * 1000)}:all=1[e${i}];`; labels.push(`[e${i}]`); });
g += `[voice][ducked]${labels.join('')}amix=inputs=${2 + labels.length}:normalize=0,alimiter=limit=0.89,loudnorm=I=-14:TP=-1:LRA=11,atrim=0:${TOTAL}[out]`;
execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', g, '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', 'soundtrack.m4a'], { stdio: 'inherit' });
console.log('soundtrack.m4a');
