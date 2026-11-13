/* kit.js - motionproof runtime for plain HTML films. No dependencies. Classic script, works from file://.
 *
 * Contract: every frame is a pure function of time. The film exposes window.__seek(t), window.__duration and window.__events,
 * and writes data-composition-id / data-width / data-height / data-duration on its root element, so scripts/render.mjs and
 * scripts/probe.mjs can drive it. Never use setTimeout, Date, Math.random or CSS animations for picture: use film.on() instead.
 *
 *   const film = MP.film({ root: '#main', fps: 30, duration: 15, width: 1080, height: 1920 });
 *   film.tween('#title', { at: 0, frames: 12, from: { y: 80, opacity: 0 }, to: { y: 0, opacity: 1 }, curve: 'land' });
 *   film.cut(90, { hide: ['#s1'], show: ['#s2'] });          // hard cut, logged in __events
 *   film.words('#line', { at: 100, gap: 4, frames: 12, from: { y: 40, opacity: 0 } });
 *   film.count('#n', { at: 120, frames: 24, from: 0, to: 1280, format: 'pt-BR' });
 *   film.on((t, f) => { ... });                              // custom renderer, must only read t / f
 *   film.ready();                                            // call once at the end
 * Properties: x, y (px), scale, scaleX, scaleY, rotate (deg), opacity, blur (px). Curves come from data/tokens.json.
 */
(function (root) {
  'use strict';
  const CURVES = {
    land: [0.16, 1, 0.3, 1], landFirm: [0.05, 0.9, 0.2, 1], snap: [0, 0.95, 0.1, 1], glide: [0.33, 0.6, 0.5, 1],
    exit: [0.55, 0, 0.9, 0.4], throw: [0.7, 0, 1, 0.6], inOut: [0.45, 0, 0.55, 1], linear: [0, 0, 1, 1],
    lean: [0.34, 1.35, 0.64, 1], settle: [0.2, 1.6, 0.4, 1],
  };
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (s) => ((ax * s + bx) * s + cx) * s, sy = (s) => ((ay * s + by) * s + cy) * s, dx = (s) => (3 * ax * s + 2 * bx) * s + cx;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let s = x;
      for (let i = 0; i < 8; i++) { const e = sx(s) - x, d = dx(s); if (Math.abs(e) < 1e-6) return sy(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
      let lo = 0, hi = 1; s = x;
      for (let i = 0; i < 40; i++) { const v = sx(s); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = s; else hi = s; s = (lo + hi) / 2; }
      return sy(s);
    };
  }
  const EASE = {}; for (const k in CURVES) EASE[k] = bezier.apply(null, CURVES[k]);
  const ease = (c) => (typeof c === 'function' ? c : Array.isArray(c) ? bezier.apply(null, c) : EASE[c] || EASE.land);
  const NEUTRAL = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, opacity: 1, blur: 0 };
  const all = (sel) => (typeof sel === 'string' ? Array.from(document.querySelectorAll(sel)) : sel instanceof Element ? [sel] : Array.from(sel));
  const need = (sel) => { const a = all(sel); if (!a.length) throw new Error('kit: nothing matches ' + sel); return a; };

  function film(cfg) {
    cfg = cfg || {};
    const fps = cfg.fps || 30, duration = cfg.duration || 10, W = cfg.width || 1920, H = cfg.height || 1080;
    const stage = document.querySelector(cfg.root || '#main');
    if (!stage) throw new Error('kit: root element not found');
    stage.setAttribute('data-composition-id', 'main');
    stage.setAttribute('data-width', W); stage.setAttribute('data-height', H); stage.setAttribute('data-duration', duration);
    const tracks = new Map();      // element -> { prop -> [segments sorted by start] }
    const vis = new Map();         // element -> [[frame, visible]]
    const renderers = [], events = [];
    const track = (el, p) => { let m = tracks.get(el); if (!m) tracks.set(el, (m = {})); return m[p] || (m[p] = []); };

    function tween(sel, o) {
      const at = o.at || 0, n = Math.max(1, o.frames || 12), f = ease(o.curve || 'land'), from = o.from || {}, to = o.to || {};
      need(sel).forEach((el, i) => {
        const start = at + i * (o.stagger || 0);
        for (const p of new Set(Object.keys(from).concat(Object.keys(to)))) {
          const segs = track(el, p);
          segs.push({ start, end: start + n, a: p in from ? from[p] : NEUTRAL[p], b: p in to ? to[p] : NEUTRAL[p], f });
          segs.sort((s, q) => s.start - q.start);
        }
      });
      return api;
    }
    function setVis(sel, frame, on) { need(sel).forEach((el) => { const v = vis.get(el) || []; v.push([frame, on]); v.sort((a, b) => a[0] - b[0]); vis.set(el, v); }); }
    function cut(frame, o) {
      (o.hide || []).forEach((s) => setVis(s, frame, false)); (o.show || []).forEach((s) => setVis(s, frame, true));
      events.push({ t: frame / fps, frame, type: 'cut', label: o.label || '' });
      return api;
    }
    function words(sel, o) {
      need(sel).forEach((el) => {
        if (!el.dataset.kitSplit) {
          const parts = el.textContent.split(/(\s+)/);
          el.textContent = '';
          for (const w of parts) {
            if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(w)); continue; }
            const s = document.createElement('span'); s.textContent = w; s.style.display = 'inline-block'; el.appendChild(s);
          }
          el.dataset.kitSplit = '1';
        }
        const spans = Array.from(el.querySelectorAll(':scope > span'));
        const gaps = o.gaps || [];
        let f = o.at || 0;
        spans.forEach((s, i) => { tween(s, { at: f, frames: o.frames || 12, from: o.from || { y: 30, opacity: 0 }, to: o.to || {}, curve: o.curve || 'land' }); f += gaps[i] != null ? gaps[i] : (o.gap || 4); });
      });
      return api;
    }
    function count(sel, o) {
      const els = need(sel), f = ease(o.curve || 'inOut'), n = o.frames || 24, at = o.at || 0;
      const fmt = typeof o.format === 'function' ? o.format : (v) => Math.round(v).toLocaleString(o.format || 'en-US');
      renderers.push((t, fr) => { const p = f(Math.min(1, Math.max(0, (fr - at) / n))); const v = o.from + (o.to - o.from) * p; els.forEach((e) => { e.textContent = fmt(v); }); });
      return api;
    }
    function on(fn) { renderers.push(fn); return api; }

    function valueAt(segs, fr) {
      let s = null;
      for (const q of segs) { if (q.start <= fr) s = q; else break; }
      if (!s) return segs[0].a;
      const p = s.end > s.start ? Math.min(1, (fr - s.start) / (s.end - s.start)) : 1;
      return s.a + (s.b - s.a) * s.f(p);
    }
    function render(t) {
      const fr = t * fps;
      for (const [el, props] of tracks) {
        const v = Object.assign({}, NEUTRAL);
        for (const p in props) v[p] = valueAt(props[p], fr);
        el.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) rotate(' + v.rotate + 'deg) scale(' + v.scale * v.scaleX + ',' + v.scale * v.scaleY + ')';
        if ('opacity' in props) el.style.opacity = Math.max(0, Math.min(1, v.opacity));
        if ('blur' in props) el.style.filter = v.blur > 0.01 ? 'blur(' + v.blur + 'px)' : 'none';
      }
      for (const [el, list] of vis) {
        let on = list[0][1] ? false : true;   // before the first switch, the element is in the opposite state
        for (const [f, s] of list) { if (f <= Math.floor(fr + 1e-6)) on = s; else break; }
        el.style.visibility = on ? 'visible' : 'hidden';
      }
      for (const r of renderers) r(t, Math.floor(fr + 1e-6));
    }
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const api = {
      fps, duration, width: W, height: H, tween, cut, words, count, on, ease: EASE, render,
      show: (sel, frame) => { setVis(sel, frame, true); return api; },
      hide: (sel, frame) => { setVis(sel, frame, false); return api; },
      ready() {
        (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { render(0); resolveReady(true); });
        return api;
      },
      play() {
        const t0 = performance.now();
        const loop = (now) => { render(((now - t0) / 1000) % duration); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      },
    };
    root.__duration = duration;
    root.__events = events;
    root.__ready = readyP;
    root.__seek = (t) => { render(Math.max(0, Math.min(duration, t))); };
    return api;
  }
  root.MP = { film, bezier, curves: CURVES };
})(window);
