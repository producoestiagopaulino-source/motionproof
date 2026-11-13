#!/usr/bin/env node
// probe.mjs - measure what a viewer can read in an HTML film (plain HTML, kit.js or HyperFrames). Reads the live DOM while seeking.
//
// Usage: node probe.mjs <film.html> [--zones auto|reels|tiktok|shorts|story|vertical|feed45|square|wide|none]
//                       [--samples 12] [--step 0.1] [--min-text 0.031] [--min-hold 0.3] [--json] [--duration S]
// L1, L3 and L4 count only when the problem lasts at least --min-hold seconds (a move through a margin is not a layout).
//
// FAIL rules (exit 1):
//   L1 text too small      font size < --min-text x the short side of the frame (0.031 = 34 px on a 1080-wide frame)
//   L2 low contrast        WCAG ratio text vs the pixels under it < 4.5 (text under 0.06 x short side) or < 3.0 (larger)
//   L3 outside safe zone   any part of a text block in the platform overlay margins (data/zones.json)
//   L4 clipped text        a text block cut by the frame edge or by an ancestor with overflow hidden
//   L5 too short to read   a text block fully visible for less than 0.5 s + characters / 17 (seconds)
// WARN rules: W1 overlapping text blocks (ghost text), W2 page chrome (corner micro-label, tracked caps, counter, timecode).
// Opt-outs on an element or ancestor: data-texture (illegible on purpose: skips L1, L2, L5), data-diegetic (skips W2),
//   data-allow-unsafe (skips L3), data-allow-crop (skips L4).
// Text drawn in canvas, WebGL, images or video is invisible here: review.py checks the rendered pixels for those.
// Exit: 0 pass (warnings allowed), 1 a rule failed, 2 bad usage or the page failed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { launch, parseArgs, toUrl, PAGE_HELPERS } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pos, opt;
try { ({ pos, opt } = parseArgs(process.argv.slice(2), { zones: 's', samples: 's', step: 's', 'min-text': 's', 'min-hold': 's', json: 'bool', duration: 's', help: 'bool' })); }
catch (e) { console.error('error: ' + e.message); process.exit(2); }
if (opt.help || !pos[0]) { console.log('node probe.mjs <film.html> [--zones auto] [--samples 12] [--step 0.1] [--json]'); process.exit(opt.help ? 0 : 2); }
const ZONES = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'zones.json'), 'utf8'));
const minText = Number(opt['min-text'] ?? 0.031);

// ---- PNG decode (8-bit RGB/RGBA, non-interlaced: what Chrome writes)
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG'); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('unsupported PNG colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[o - stride + x] : 0, c = x >= bpp && y ? out[o - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[o + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// ---- page side: visible text blocks
const SCAN = String.raw`(() => {
  const W = innerWidth, H = innerHeight, cs = (e) => getComputedStyle(e);
  const ids = window.__mpIds || (window.__mpIds = new WeakMap()); let n = window.__mpN || 0;
  const id = (e) => { let v = ids.get(e); if (!v) { v = ++n; ids.set(e, v); window.__mpN = n; } return v; };
  const opa = (e) => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) o *= parseFloat(cs(x).opacity); return o; };
  const shown = (e) => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = cs(x); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
  const flag = (e, a) => !!e.closest('[' + a + ']');
  const rgba = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const groups = new Map();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const p = t.parentElement; if (!p || /^(SCRIPT|STYLE|TITLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || p.closest('svg')) continue;
    const txt = t.textContent.replace(/\s+/g, ' ').trim(); if (!txt || !shown(p)) continue;
    const r = document.createRange(); r.selectNodeContents(t);
    const rs = [...r.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5); if (!rs.length) continue;
    let c = p; while (c.parentElement && c !== document.body && /^(inline|contents)/.test(cs(c).display)) c = c.parentElement;
    const g = groups.get(c) || { c, parts: [], x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, minOp: 1, fs: 0, color: null, clip: 1 };
    const o = opa(p), s = cs(p);
    for (const q of rs) { g.x0 = Math.min(g.x0, q.left); g.y0 = Math.min(g.y0, q.top); g.x1 = Math.max(g.x1, q.right); g.y1 = Math.max(g.y1, q.bottom); }
    g.parts.push(txt); g.minOp = Math.min(g.minOp, o);
    // rendered size = CSS font size x the scale that transforms on the element and its ancestors apply
    const fsz = parseFloat(s.fontSize) || 16, bh = p.getBoundingClientRect().height, oh = p.offsetHeight;
    const eff = fsz * (oh > 0 && bh > 0 ? bh / oh : 1);
    if (!g.fs || eff < g.fs) g.fs = eff;
    if (!g.color) { g.color = rgba(s.color); g.color[3] *= o; }
    groups.set(c, g);
  }
  const out = [];
  for (const g of groups.values()) {
    let x0 = Math.max(g.x0, 0), y0 = Math.max(g.y0, 0), x1 = Math.min(g.x1, W), y1 = Math.min(g.y1, H);
    for (let a = g.c; a && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = a.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom);
    }
    const area = Math.max(1, (g.x1 - g.x0) * (g.y1 - g.y0)), vis = x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) / area : 0;
    if (vis <= 0 || g.minOp < 0.05) continue;
    out.push({ id: id(g.c), text: g.parts.join(' ').slice(0, 160), x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, vis, minOp: g.minOp,
      fs: g.fs, color: g.color,
      ls: (() => { const s = cs(g.c); return s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) / g.fs; })(),
      upper: cs(g.c).textTransform === 'uppercase' || (g.parts.join('').replace(/[^A-Za-z]/g, '').length >= 3 && g.parts.join('') === g.parts.join('').toUpperCase()),
      texture: flag(g.c, 'data-texture'), diegetic: flag(g.c, 'data-diegetic'), unsafeOk: flag(g.c, 'data-allow-unsafe'), cropOk: flag(g.c, 'data-allow-crop'),
      tag: '<' + g.c.tagName.toLowerCase() + (g.c.id ? '#' + g.c.id : '') + '>' });
  }
  return out;
})()`;
const HIDE_TEXT = `(() => { const s = document.createElement('style'); s.id = '__mpHide'; s.textContent = '*{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;-webkit-text-fill-color:transparent!important}'; document.head.appendChild(s); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))); })()`;
const SHOW_TEXT = `(() => { const s = document.getElementById('__mpHide'); if (s) s.remove(); return 1; })()`;

const hits = new Map();   // rule -> Map(key -> hit)
const SEV = { L1: 'FAIL', L2: 'FAIL', L3: 'FAIL', L4: 'FAIL', L5: 'FAIL', W1: 'WARN', W2: 'WARN' };
const NAMES = { L1: 'text too small', L2: 'low contrast', L3: 'outside safe zone', L4: 'clipped text', L5: 'too short to read', W1: 'overlapping text', W2: 'page chrome' };
const add = (rule, key, t, d) => { const m = hits.get(rule) || new Map(); const h = m.get(key) || { ...d, times: [] }; if (!h.times.includes(t)) h.times.push(t); m.set(key, h); hits.set(rule, m); };
const r3 = (v) => +v.toFixed(3);

let br, code = 0;
try {
  br = await launch();
  const { page } = br;
  await page.goto(toUrl(pos[0]));
  await page.eval(PAGE_HELPERS);
  await page.eval('window.__mpPrepare()');
  const info = await page.eval('window.__mpInfo()');
  const W = info.width || 1920, H = info.height || 1080, S = Math.min(W, H);
  await page.viewport(W, H);
  const dur = Number(opt.duration ?? info.duration ?? 0);
  if (!(dur > 0)) throw new Error('duration unknown: set window.__duration or pass --duration');
  let zname = opt.zones || 'auto';
  if (zname === 'auto') { const a = W / H; zname = a < 0.6 ? 'reels' : a < 0.9 ? 'feed45' : a < 1.2 ? 'square' : 'wide'; }
  const Z = ZONES[zname]; if (!Z) throw new Error('unknown zone preset ' + zname);
  const safe = { x0: Z.left * W, y0: Z.top * H, x1: W - Z.right * W, y1: H - Z.bottom * H };

  // dense pass for reading time (L5) and geometry rules; contrast only on the sparse sample times
  const step = Number(opt.step ?? 0.1), nS = Math.max(4, Number(opt.samples ?? 12));
  const sparse = new Set(Array.from({ length: nS }, (_, i) => +(((i + 0.5) * dur) / nS).toFixed(2)));
  const times = new Set(sparse); for (let t = 0; t < dur; t += step) times.add(+t.toFixed(2));
  const runs = new Map();   // block id -> { text, cur: start|null, best, req }
  for (const t of [...times].sort((a, b) => a - b)) {
    await page.eval(`window.__mpSeek(${t})`);
    const blocks = await page.eval(SCAN);
    for (const b of blocks) {
      const d = { text: b.text, el: b.tag, bbox: [r3(b.x0 / W), r3(b.y0 / H), r3(b.x1 / W), r3(b.y1 / H)] };
      const readable = b.minOp >= 0.9 && b.vis >= 0.98;
      const r = runs.get(b.id) || { text: b.text, start: null, best: 0, req: 0.5 + b.text.replace(/\s/g, '').length / 17, texture: b.texture, last: -1 };
      if (readable) { if (r.start === null || t - r.last > step * 1.5) r.start = t; r.best = Math.max(r.best, t - r.start + step); r.last = t; r.text = b.text; r.req = 0.5 + b.text.replace(/\s/g, '').length / 17; }
      runs.set(b.id, r);
      if (b.minOp < 0.5) continue;
      if (!b.texture && b.fs < minText * S) add('L1', b.id, t, { ...d, note: `font ${b.fs.toFixed(0)} px < ${(minText * S).toFixed(0)} px` });
      if (!b.unsafeOk && zname !== 'none' && (b.x0 < safe.x0 - 1 || b.y0 < safe.y0 - 1 || b.x1 > safe.x1 + 1 || b.y1 > safe.y1 + 1))
        add('L3', b.id, t, { ...d, note: `zone ${zname}: safe box [${r3(safe.x0 / W)},${r3(safe.y0 / H)},${r3(safe.x1 / W)},${r3(safe.y1 / H)}]` });
      if (!b.cropOk && b.vis < 0.98) add('L4', b.id, t, { ...d, note: `only ${(b.vis * 100).toFixed(0)}% of the text box is visible` });
      const small = b.fs < 0.045 * S, corner = ((b.x1 < 0.25 * W) || (b.x0 > 0.75 * W)) && ((b.y1 < 0.15 * H) || (b.y0 > 0.85 * H));
      const chrome = /\b\d{1,2}\s*[\/|]\s*\d{1,2}\b|\b\d{1,2}:\d{2}(:\d{2})?\b|\b(fps|bpm|rec|scene|chapter|cap[ií]tulo|cena)\s*\d*/i.test(b.text);
      if (!b.diegetic && small && (corner || (b.upper && b.ls >= 0.08) || chrome))
        add('W2', b.id, t, { ...d, note: corner ? 'small text in a corner' : chrome ? 'counter, timecode or production label' : 'small tracked caps label' });
    }
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j]; if (a.minOp < 0.3 || b.minOp < 0.3) continue;
      const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
      if (ix * iy > 0.1 * small) add('W1', a.id + '-' + b.id, t, { text: a.text.slice(0, 40) + ' | ' + b.text.slice(0, 40), el: a.tag + ' ' + b.tag, bbox: [r3(Math.max(a.x0, b.x0) / W), r3(Math.max(a.y0, b.y0) / H), r3(Math.min(a.x1, b.x1) / W), r3(Math.min(a.y1, b.y1) / H)] });
    }
    if (sparse.has(t)) {
      await page.eval(HIDE_TEXT);
      const img = decodePng(await page.shot('png'));
      await page.eval(SHOW_TEXT);
      for (const b of blocks) {
        if (b.texture || b.minOp < 0.5 || b.color[3] < 0.05) continue;
        const ls = [];
        const xa = Math.max(0, Math.floor(b.x0)), xb = Math.min(img.w - 1, Math.ceil(b.x1)), ya = Math.max(0, Math.floor(b.y0)), yb = Math.min(img.h - 1, Math.ceil(b.y1));
        const sx = Math.max(1, Math.floor((xb - xa) / 24)), sy = Math.max(1, Math.floor((yb - ya) / 8));
        for (let y = ya; y <= yb; y += sy) for (let x = xa; x <= xb; x += sx) {
          const o = (y * img.w + x) * img.bpp, a = b.color[3];
          const tr = b.color[0] * a + img.px[o] * (1 - a), tg = b.color[1] * a + img.px[o + 1] * (1 - a), tb = b.color[2] * a + img.px[o + 2] * (1 - a);
          ls.push(ratio(lum(tr, tg, tb), lum(img.px[o], img.px[o + 1], img.px[o + 2])));
        }
        if (!ls.length) continue;
        ls.sort((p, q) => p - q);
        const med = ls[Math.floor(ls.length / 2)], worst = ls[Math.floor(ls.length * 0.1)], need = b.fs >= 0.06 * S ? 3 : 4.5;
        if (med < need) add('L2', b.id, t, { text: b.text, el: b.tag, bbox: [r3(b.x0 / W), r3(b.y0 / H), r3(b.x1 / W), r3(b.y1 / H)], note: `contrast ${med.toFixed(2)}:1 (worst 10% ${worst.toFixed(2)}) < ${need}:1` });
      }
    }
  }
  for (const [bid, r] of runs) if (!r.texture && r.text.replace(/\s/g, '').length >= 3 && r.best + 1e-6 < r.req)
    add('L5', bid, +(r.last >= 0 ? r.last : 0).toFixed(2), { text: r.text, el: '', bbox: [], note: r.best === 0 ? 'never fully visible (opacity >= 0.9, unclipped)' : `fully visible ${r.best.toFixed(2)} s < ${r.req.toFixed(2)} s needed` });

  // geometry rules count only when the problem lasts (text flying through a margin or arriving from oversize is motion, not layout)
  const minHold = Number(opt['min-hold'] ?? 0.3);
  for (const k of ['L1', 'L3', 'L4']) for (const [key, h] of hits.get(k) || []) {
    const n = h.times.filter((t) => Math.abs(t / step - Math.round(t / step)) < 1e-6).length;
    if (n * step + 1e-6 < minHold) hits.get(k).delete(key); else h.note += `; lasts ~${(n * step).toFixed(1)} s`;
  }
  const rules = Object.keys(SEV).map((k) => ({ id: k, name: NAMES[k], status: hits.get(k)?.size ? SEV[k] : 'PASS', hits: [...(hits.get(k)?.values() || [])] }));
  const gate = rules.some((r) => r.status === 'FAIL') ? 'FAIL' : 'PASS';
  const out = { file: path.resolve(pos[0]), width: W, height: H, duration: dur, zones: zname, minTextPx: Math.round(minText * S), gate, rules };
  if (opt.json) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`probe ${out.file}  ${W}x${H}  ${dur}s  zones=${zname}  min text ${out.minTextPx} px`);
    for (const r of rules) {
      console.log(`${r.id} ${r.name.padEnd(20, '.')} ${r.status}${r.hits.length ? '  (' + r.hits.length + ')' : ''}`);
      for (const h of r.hits.slice(0, 5)) console.log(`    t=${h.times.slice(0, 4).join(',')}${h.times.length > 4 ? ',...' : ''}  ${JSON.stringify(h.text.slice(0, 50))} ${h.el} ${h.bbox.length ? '[' + h.bbox.join(',') + ']' : ''}${h.note ? '  ' + h.note : ''}`);
    }
    console.log('GATE probe: ' + gate);
  }
  code = gate === 'FAIL' ? 1 : 0;
} catch (e) { console.error('error: ' + e.message); code = 2; }
finally { if (br) await br.close(); }
process.exit(code);
