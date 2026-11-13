// style.mjs - layout warnings for probe.mjs: patterns that make a film read as a slide deck or a stock app screen.
// W3 kicker, W4 slide layout, W5 typed headline, W6 progress bar, W7 stock UI card. WARN by default, FAIL with --strict-style.
// Exempt: data-diegetic, data-ui (declared interface surface), data-allow-<name> with the names in RULES below.

export const RULES = {
  W3: { name: 'kicker over headline', allow: 'kicker' },
  W4: { name: 'slide layout', allow: 'slide' },
  W5: { name: 'typed headline', allow: 'typing' },
  W6: { name: 'progress bar', allow: 'progress' },
  W7: { name: 'stock UI card', allow: 'card' },
};

// page side, evaluated once: shared element ids, data-allow-* names, nearest rounded card with a fill
export const PAGE_STYLE = String.raw`(() => {
  window.__mpIds = window.__mpIds || new WeakMap();
  window.__mpId = (e) => { let v = window.__mpIds.get(e); if (!v) { v = (window.__mpN = (window.__mpN || 0) + 1); window.__mpIds.set(e, v); } return v; };
  window.__mpAllow = (e) => { const s = []; for (let x = e; x && x.nodeType === 1; x = x.parentElement) for (const a of x.attributes) if (a.name.startsWith('data-allow-')) s.push(a.name.slice(11)); return s; };
  window.__mpFill = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor || ''); const p = m ? m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat) : []; return s.backgroundImage !== 'none' ? 1 : p.length > 3 ? p[3] : p.length ? 1 : 0; };
  window.__mpIsCard = (e) => {
    if (!e || e === document.body || e === document.documentElement || e.hasAttribute('data-composition-id')) return false;
    const s = getComputedStyle(e), r = e.getBoundingClientRect(), S = Math.min(innerWidth, innerHeight), a = r.width * r.height / (innerWidth * innerHeight);
    return parseFloat(s.borderTopLeftRadius) >= 0.006 * S && window.__mpFill(s) >= 0.08 && a >= 0.01 && a <= 0.6;
  };
  window.__mpCard = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) if (window.__mpIsCard(x)) return window.__mpId(x); return 0; };
  return true;
})()`;

// page side, every sample: media boxes (W4), status dots inside cards (W7), thin filled bars (W6)
export const EXTRAS = String.raw`(() => {
  const W = innerWidth, H = innerHeight, S = Math.min(W, H), cs = (e) => getComputedStyle(e);
  const seen = (e) => { let o = 1; for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = cs(x); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= parseFloat(s.opacity); } return o; };
  const flags = (e) => ({ ui: !!e.closest('[data-ui]'), diegetic: !!e.closest('[data-diegetic]'), allow: window.__mpAllow(e) });
  const out = { media: [], dots: [], bars: [] };
  for (const e of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|TEMPLATE)$/.test(e.tagName) || (e.parentElement && e.parentElement.closest('svg'))) continue;
    const r = e.getBoundingClientRect(); if (r.width < 0.5 && r.height < 0.5) continue;
    const empty = !e.textContent.trim(), tag = e.tagName.toLowerCase();
    const isMedia = /^(img|video|canvas|picture|iframe|svg)$/.test(tag) || window.__mpIsCard(e);
    const thin = Math.min(r.width, r.height) <= 0.012 * S;
    const dotSize = r.width <= 0.03 * S && r.width >= 0.004 * S && Math.abs(r.width - r.height) <= 1.5;
    if (!(isMedia && r.width >= 0.15 * W && r.height >= 0.1 * S) && !(empty && (thin || dotSize))) continue;
    const o = seen(e); if (o < 0.3) continue;
    const box = { id: window.__mpId(e), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    if (isMedia && r.width >= 0.15 * W && r.height >= 0.1 * S) { out.media.push(box); continue; }
    const s = cs(e), fill = window.__mpFill(s);
    if (dotSize && fill >= 0.5 && parseFloat(s.borderTopLeftRadius) >= 0.4 * r.width) {
      const p = /rgba?\(([^)]+)\)/.exec(s.backgroundColor || ''), c = p ? p[1].split(/[ ,\/]+/).map(parseFloat) : [0, 0, 0];
      if (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) >= 40) out.dots.push({ ...box, card: window.__mpCard(e.parentElement), ...flags(e) });
    } else if (thin && (fill >= 0.1 || parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) > 0)) out.bars.push({ ...box, ...flags(e) });
  }
  return out;
})()`;

const CARET = /[|_▌█▍▏│]+$/;
const GREETING = /(^|[^\p{L}])(bom dia|boa tarde|boa noite|ol[aá],|oi,|bem-vind[oa] de volta|good (morning|afternoon|evening)|hello,|hi,|welcome back)/iu;
const LABEL_VALUE = /\p{L}[^·•]{0,30}\s[·•]\s\S/u;

// longest run of consecutive sample times (gap at most 1.5 steps), in seconds
function longestRun(ts, step) {
  ts.sort((a, b) => a - b); let best = 0, start = ts[0];
  for (let i = 0; i < ts.length; i++) { if (i && ts[i] - ts[i - 1] > step * 1.5) start = ts[i]; best = Math.max(best, ts[i] - start + step); }
  return best;
}

export function makeStyle({ W, H, step, add, skip }) {
  const S = Math.min(W, H), r3 = (v) => +v.toFixed(3);
  const on = (k) => !skip.has(k);
  const box = (b) => [r3(b.x0 / W), r3(b.y0 / H), r3(b.x1 / W), r3(b.y1 / H)];
  const free = (b, rule) => !b.diegetic && !b.ui && !b.allow.includes(RULES[rule].allow);
  const isHead = (b) => b.fs >= 0.05 * S;
  const kickerOf = (k, h) => isHead(h) && k !== h && k.fs <= 0.4 * h.fs && k.text.length <= 60 &&
    k.y1 <= h.y0 + 0.15 * h.fs && h.y0 - k.y1 <= h.fs &&
    (Math.abs(k.x0 - h.x0) <= 0.02 * W || Math.abs((k.x0 + k.x1) / 2 - (h.x0 + h.x1) / 2) <= 0.02 * W);
  const slideRuns = new Map(), texts = new Map(), bars = new Map();

  function sample(t, blocks, ex) {
    const vis = blocks.filter((b) => b.minOp >= 0.5);
    for (const h of vis) {
      if (!isHead(h)) continue;
      // W3 kicker: small line right above a headline, sharing its left edge or its centre
      if (on('W3') && free(h, 'W3')) for (const k of vis) if (free(k, 'W3') && kickerOf(k, h))
        add('W3', k.id + '-' + h.id, t, { text: k.text.slice(0, 40) + ' | ' + h.text.slice(0, 40), el: k.tag + ' ' + h.tag, bbox: box(k), note: `${k.fs.toFixed(0)} px line over ${h.fs.toFixed(0)} px headline` });
      // W4 slide: left-aligned headline on the left fifth, with media on the right, a subtitle, a kicker, or two lines
      if (on('W4') && free(h, 'W4') && h.x0 < 0.2 * W && /^(left|start|justify)$/.test(h.align)) {
        const media = ex.media.some((m) => m.x0 >= h.x1 - 0.02 * W && (m.x0 + m.x1) / 2 > 0.5 * W && m.y0 < h.y1 + h.fs && m.y1 > h.y0 - h.fs);
        const sub = vis.some((b) => b !== h && b.fs <= 0.7 * h.fs && b.y0 >= h.y1 - 0.1 * h.fs && b.y0 - h.y1 <= 1.5 * h.fs && Math.abs(b.x0 - h.x0) <= 0.03 * W);
        const kick = vis.some((k) => kickerOf(k, h));
        const lines = h.y1 - h.y0 >= 1.8 * h.fs;
        if (media || sub || kick || lines) {
          const r = slideRuns.get(h.id) || { ts: [], b: h, why: new Set() };
          r.ts.push(t); r.b = h;
          for (const [w, v] of [['media on the right', media], ['subtitle', sub], ['kicker', kick], ['2+ lines', lines]]) if (v) r.why.add(w);
          slideRuns.set(h.id, r);
        }
      }
    }
    if (on('W5')) for (const b of vis) if (free(b, 'W5')) {
      const h = texts.get(b.id) || { b, seq: [] }; h.b = b; h.seq.push([t, b.text.replace(CARET, '').trim()]); texts.set(b.id, h);
    }
    if (on('W6')) for (const b of ex.bars) if (free(b, 'W6')) {
      const h = bars.get(b.id) || { b, seq: [] }; h.b = b; h.seq.push([t, b.x1 - b.x0, b.y1 - b.y0]); bars.set(b.id, h);
    }
    // W7 stock card: two or more of greeting, "label · value", coloured status dot, zinc-grey text, inside one rounded filled card
    if (on('W7')) {
      const cards = new Map();
      for (const b of vis) if (b.card && free(b, 'W7')) {
        const c = cards.get(b.card) || { sig: new Set(), first: b }; const [r, g, bl, a] = b.color;
        if (GREETING.test(b.text)) c.sig.add('greeting');
        if (LABEL_VALUE.test(b.text)) c.sig.add('label · value');
        if (a >= 0.6 && Math.max(r, g, bl) - Math.min(r, g, bl) <= 18 && (r + g + bl) / 3 >= 80 && (r + g + bl) / 3 <= 190) c.sig.add('zinc-grey text');
        cards.set(b.card, c);
      }
      for (const d of ex.dots) if (d.card && cards.has(d.card) && free(d, 'W7')) cards.get(d.card).sig.add('status dot');
      for (const [cid, c] of cards) if (c.sig.size >= 2)
        add('W7', cid, t, { text: c.first.text, el: c.first.tag, bbox: box(c.first), note: 'card with ' + [...c.sig].join(', ') });
    }
  }

  function finish() {
    for (const [id, r] of slideRuns) { const len = longestRun(r.ts, step); if (len >= 1.2) add('W4', id, r.ts[0], { text: r.b.text, el: r.b.tag, bbox: box(r.b), note: `left-anchored headline with ${[...r.why].join(', ')}, held ${len.toFixed(1)} s` }); }
    for (const [id, h] of texts) {
      // W5 typed text: the same element grows by a few characters at a time, each state a prefix of the next
      let grows = 0, from = null;
      for (let i = 1; i < h.seq.length; i++) {
        const a = h.seq[i - 1][1], b = h.seq[i][1];
        if (b.length > a.length && b.length - a.length <= 4 && b.startsWith(a)) { grows++; if (from === null) from = i - 1; }
      }
      const last = h.seq[h.seq.length - 1][1];
      if (grows >= 5 && last.length - h.seq[from ?? 0][1].length >= 8) add('W5', id, h.seq[from][0], { text: last, el: h.b.tag, bbox: box(h.b), note: `text grew in ${grows} small steps` });
    }
    for (const [id, h] of bars) {
      // W6 progress bar: thin side stays under 1.2 % of the short side while the long side keeps growing for 1 s or more
      const ax = h.seq.reduce((s, q) => s + q[1], 0) >= h.seq.reduce((s, q) => s + q[2], 0) ? 1 : 2, side = ax === 1 ? W : H;
      if (h.seq.some((q) => q[3 - ax] > 0.012 * S)) continue;
      let ups = 0, t0 = null, t1 = null, back = false;
      for (let i = 1; i < h.seq.length; i++) {
        const d = h.seq[i][ax] - h.seq[i - 1][ax];
        if (d > 0.5) { ups++; t0 ??= h.seq[i - 1][0]; t1 = h.seq[i][0]; } else if (d < -0.5) back = true;
      }
      const grow = h.seq[h.seq.length - 1][ax] - h.seq[0][ax];
      if (!back && ups >= 5 && t1 - t0 >= 1 && grow >= 0.15 * side) add('W6', id, t0, { text: '', el: '<bar>', bbox: box(h.b), note: `${ax === 1 ? 'width' : 'height'} grew ${(grow / side * 100).toFixed(0)}% of the frame over ${(t1 - t0).toFixed(1)} s` });
    }
  }
  return { sample, finish };
}
