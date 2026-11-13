// motionproof tokens for Remotion. No imports: works with interpolate()'s `easing` option and anywhere else.
//
//   import { ease, dur, safeBox, readingFrames } from './motionproof';
//   const y = interpolate(frame, [0, dur('land')], [80, 0], { easing: ease('land'), extrapolateRight: 'clamp' });
//   const box = safeBox('reels', 1080, 1920);   // { left, top, right, bottom, width, height } in px
//   const hold = readingFrames('Seu evento no ar', fps);   // minimum frames a line must stay fully visible
//
// Values mirror data/tokens.json and data/zones.json (tests/run_all.py fails if they drift).

export type CurveName = 'land' | 'landFirm' | 'snap' | 'glide' | 'exit' | 'throw' | 'inOut' | 'linear' | 'lean' | 'settle';
export type ZoneName = 'reels' | 'tiktok' | 'shorts' | 'story' | 'vertical' | 'feed45' | 'square' | 'wide' | 'none';

export const CURVES: Record<CurveName, { bezier: [number, number, number, number]; frames: number }> = {
  land: { bezier: [0.16, 1.0, 0.3, 1.0], frames: 12 },
  landFirm: { bezier: [0.05, 0.9, 0.2, 1.0], frames: 10 },
  snap: { bezier: [0.0, 0.95, 0.1, 1.0], frames: 6 },
  glide: { bezier: [0.33, 0.6, 0.5, 1.0], frames: 10 },
  exit: { bezier: [0.55, 0.0, 0.9, 0.4], frames: 12 },
  throw: { bezier: [0.7, 0.0, 1.0, 0.6], frames: 8 },
  inOut: { bezier: [0.45, 0.0, 0.55, 1.0], frames: 9 },
  linear: { bezier: [0.0, 0.0, 1.0, 1.0], frames: 30 },
  lean: { bezier: [0.34, 1.35, 0.64, 1.0], frames: 15 },
  settle: { bezier: [0.2, 1.6, 0.4, 1.0], frames: 14 },
};

export const ZONES: Record<ZoneName, { top: number; bottom: number; left: number; right: number }> = {
  reels: { top: 0.115, bottom: 0.22, left: 0.12, right: 0.12 },
  tiktok: { top: 0.08, bottom: 0.25, left: 0.06, right: 0.15 },
  shorts: { top: 0.09, bottom: 0.21, left: 0.06, right: 0.12 },
  story: { top: 0.13, bottom: 0.17, left: 0.06, right: 0.06 },
  vertical: { top: 0.13, bottom: 0.25, left: 0.12, right: 0.15 },
  feed45: { top: 0.06, bottom: 0.08, left: 0.06, right: 0.06 },
  square: { top: 0.06, bottom: 0.06, left: 0.06, right: 0.06 },
  wide: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
  none: { top: 0, bottom: 0, left: 0, right: 0 },
};

export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sy = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(s) - x, d = dx(s);
      if (Math.abs(e) < 1e-6) return sy(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0, hi = 1;
    s = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(s);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return sy(s);
  };
}

const cache = new Map<CurveName, (x: number) => number>();
export function ease(name: CurveName): (x: number) => number {
  let f = cache.get(name);
  if (!f) { const [a, b, c, d] = CURVES[name].bezier; f = bezier(a, b, c, d); cache.set(name, f); }
  return f;
}

/** Starting duration of a curve in frames, scaled from 30 fps to the composition's fps. */
export function dur(name: CurveName, fps = 30): number {
  return Math.max(1, Math.round(CURVES[name].frames * fps / 30));
}

export function safeBox(zone: ZoneName, width: number, height: number) {
  const z = ZONES[zone];
  const left = Math.round(z.left * width), top = Math.round(z.top * height);
  const right = Math.round(width - z.right * width), bottom = Math.round(height - z.bottom * height);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Minimum frames a text must stay fully visible: 0.5 s + 17 characters per second (spaces not counted). */
export function readingFrames(text: string, fps = 30): number {
  return Math.ceil((0.5 + text.replace(/\s/g, '').length / 17) * fps);
}

/** Smallest legible font size in px for a frame: 3.1 % of the short side (34 px on a 1080-wide frame). */
export function minFontPx(width: number, height: number): number {
  return Math.ceil(0.031 * Math.min(width, height));
}
