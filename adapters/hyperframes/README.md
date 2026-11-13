# HyperFrames with motionproof

A HyperFrames composition already meets the seek contract: its GSAP timelines are registered in `window.__timelines` and its root carries `data-composition-id`, `data-width`, `data-height` and `data-duration`. So:

```
node scripts/probe.mjs path/to/composition/index.html --zones reels
node scripts/render.mjs path/to/composition/index.html out/draft.mp4 --scale 0.5     (or the HyperFrames renderer)
python scripts/review.py out/draft.mp4 --zones reels --exit-required
```

Notes:
- If the composition has several timelines, `main` is seeked last, so nested timelines are positioned first.
- To give review.py exact cut times, push `{ t, type: 'cut' }` objects into `window.__events` when you build the timeline.
- Mark interface detail that is meant to be illegible with `data-texture`, and in-world timecodes or counters (a control room, a countdown) with `data-diegetic`.
- Motion values: copy the curves from `data/tokens.json` as GSAP custom eases or `cubic-bezier()` strings.
