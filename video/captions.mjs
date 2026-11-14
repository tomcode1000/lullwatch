// Burned-in captions and an .srt from the word timings, with Whisper's mishearings fixed.
import { readFileSync, writeFileSync } from 'node:fs';
const words = JSON.parse(readFileSync('words-all.json'));
const FIX = [
  [/^meta-liable$/i, 'Meta liable'], [/^labor([.,]?)$/i, 'labour$1'], [/^iCloud([.,]?)$/i, 'AI Cloud$1'],
  [/^1600$/, '1,600'], [/^U\.S\.$/, 'US'], [/^jur-$/, 'jury'],
];
// Whisper splits hyphenated words ("first", "-time"): join them first.
const joined = [];
for (const w of words) { if (w.w.startsWith('-') && joined.length) { const p = joined.at(-1); p.w += w.w; p.e = w.e; } else joined.push({ ...w }); }
const toks = joined.map((w) => {
  let t = w.w; for (const [re, s] of FIX) if (re.test(t)) t = t.replace(re, s);
  return { ...w, w: t };
});
// "near AI cloud" / "near" + "iCloud" -> NEAR AI Cloud; "No when to go" -> "Know when to go"
for (let i = 0; i < toks.length; i++) {
  if (/^near$/i.test(toks[i].w) && /^(AI|AI Cloud)/.test(toks[i + 1]?.w || '')) toks[i].w = 'NEAR';
  if (/^cloud([.,]?)$/i.test(toks[i].w) && toks[i - 1]?.w === 'AI') toks[i].w = toks[i].w.replace(/^cloud/i, 'Cloud');
  if (toks[i].w === 'No' && toks[i + 1]?.w === 'when') toks[i].w = 'Know';
  if (toks[i].w === 'Rules' && toks[i + 1]?.w === 'decide') toks[i + 1].w = 'decide.';
  if (toks[i].w === 'the' && toks[i - 1]?.w === 'decide.') toks[i].w = 'The';
  if (toks[i].w === 'call' && toks[i + 1]?.w.startsWith('midwife') && toks[i - 1]?.w === 'taps') toks[i].w = 'Call';
}
const chunks = [];
let cur = [];
const flush = () => { if (cur.length) chunks.push({ s: cur[0].s, e: cur.at(-1).e, text: cur.map((x) => x.w).join(' ') }); cur = []; };
for (const w of toks) {
  const len = cur.map((x) => x.w).join(' ').length + w.w.length + 1;
  const gap = cur.length ? w.s - cur.at(-1).e : 0;
  if (cur.length && (len > 46 || gap > 0.45)) flush();
  cur.push(w);
  if (/[.?!]$/.test(w.w) || (/,$/.test(w.w) && cur.map((x) => x.w).join(' ').length > 24)) flush();
}
flush();
// fold a short tail ("apps,", "data.", "Cloud,") back into the line before it
for (let i = chunks.length - 1; i > 0; i--) {
  const c = chunks[i], p = chunks[i - 1];
  if (c.text.length < 14 && !/[.?!]$/.test(p.text) && p.text.length + c.text.length < 62 && c.s - p.e < 0.5) {
    p.text += ' ' + c.text; p.e = c.e; chunks.splice(i, 1);
  }
}
// hold each caption until the next one starts (or 0.6 s after its last word)
chunks.forEach((c, i) => { c.e = Math.min(chunks[i + 1]?.s ?? c.e + 0.6, c.e + 0.6); });
writeFileSync('captions.json', JSON.stringify(chunks));
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
writeFileSync('Lullwatch-demo.srt', chunks.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(c.e)}\n${c.text}\n`).join('\n'));
for (const c of chunks) console.log(c.s.toFixed(2), c.text);
