# Adapters: plain HTML, HyperFrames, Remotion

All three end as an MP4 that `review.py` checks. The difference is how the film is driven frame by frame and whether `probe.mjs` can read its DOM.

## The seek contract (HTML and HyperFrames)
`render.mjs` and `probe.mjs` move the film to time `t` with the first of these that exists:
1. `window.__seek(t)` (kit.js provides it; may return a promise)
2. `window.__timelines = { name: gsapTimeline, ... }` (HyperFrames); every timeline is paused and seeked, `main` last
3. `gsap.globalTimeline`
Then CSS and Web Animations are paused at `t`, and `<video>` elements are seeked to `t - data-start`.
Duration: `window.__duration`, else `data-duration` on `[data-composition-id]`, else the main timeline's duration.
Size: `data-width` / `data-height` on `[data-composition-id]`, else 1920x1080.
Optional: `window.__ready` (a promise awaited before the first frame) and `window.__events` (`[{ t, type: 'cut', label }]`, written beside the MP4 so review.py knows the real cut times).

Every frame must be a pure function of `t`: no `setTimeout`, `Date`, `Math.random` or free-running CSS animations driving the picture. Use a seeded generator if you need noise.

## Plain HTML with kit.js
`templates/kit.js` has no dependencies and works from `file://`. API: `MP.film({ root, fps, duration, width, height })` then `tween`, `cut`, `show`, `hide`, `words`, `count`, `on(fn)`, and `ready()` at the end. Curves by name from the motion catalog. Open the film with `?safe` to see the safe zone and `?play` to preview in real time.

## HyperFrames
Nothing to change: a HyperFrames composition already registers its GSAP timelines in `window.__timelines` and carries `data-composition-id` with size and duration, so `probe.mjs` and `render.mjs` work on its `index.html`. You can render with HyperFrames' own renderer instead; `review.py` checks either output. See `adapters/hyperframes/README.md`.

## Remotion
`probe.mjs` cannot read a Remotion composition's DOM (Remotion drives frames through its own renderer). Use instead:
- `adapters/remotion/motionproof.ts`: `ease(name)` for `interpolate(..., { easing })`, `dur(name, fps)`, `safeBox(zone, w, h)`, `readingFrames(text, fps)`, `minFontPx(w, h)`, all with the same values as `data/`.
- `adapters/remotion/SafeGuide.tsx`: a preview overlay of the safe zone, shown only when an input prop says so.
- Design-time rules in code: place text inside `safeBox`, size it at least `minFontPx`, hold every line at least `readingFrames`.
- After `npx remotion render`, run `review.py` on the MP4 (R1-R6, including the pixel safe-zone check and flashes).

## Render budget
Check disk first (`doctor.mjs`). Draft at `--scale 0.5`, render only the hard range with `--from/--to`, and check stills before full renders. WebGL and heavy filters render slowly in a headless browser; budget time accordingly and delete intermediate files when done.
