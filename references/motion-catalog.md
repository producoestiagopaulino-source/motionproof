# Motion catalog

The values here are craft conventions used as starting points, not measurements of anyone's films. They are the same numbers as `data/tokens.json`, `templates/kit.js` and `adapters/remotion/motionproof.ts` (the test suite fails if those drift apart). Change them per film when the idea asks for it, and write the change in `NOTE.md`.

Frames are at 30 fps. At 60 fps double them; at 24 fps multiply by 0.8.

## Curves
| name | cubic-bezier | frames (range) | use |
|---|---|---|---|
| `land` | 0.16, 1, 0.3, 1 | 12 (8-18) | default arrival of text and panels: most of the travel early, a long quiet tail |
| `landFirm` | 0.05, 0.9, 0.2, 1 | 10 (6-14) | hero or logo arriving from oversize; heavy and certain |
| `snap` | 0, 0.95, 0.1, 1 | 6 (3-9) | UI state changes, close-beat pieces, near-cut arrivals |
| `glide` | 0.33, 0.6, 0.5, 1 | 10 (7-16) | medium moves that should not call attention |
| `exit` | 0.55, 0, 0.9, 0.4 | 12 (8-16) | leaving or shrinking away; ends at speed |
| `throw` | 0.7, 0, 1, 0.6 | 8 (5-12) | hard acceleration into a cut; the next shot inherits the speed |
| `inOut` | 0.45, 0, 0.55, 1 | 9 (6-16) | opacity, blur, colour ramps, reframing inside a shot |
| `linear` | 0, 0, 1, 1 | 30 (20-120) | drift, creep, counters: anything that keeps a hold alive |
| `lean` | 0.34, 1.35, 0.64, 1 | 15 (12-22) | one small late overshoot; at most once per beat |
| `settle` | 0.2, 1.6, 0.4, 1 | 14 (10-20) | the one visible spring of a film, for a physical payoff |

## How to choose
- **Arriving decelerates, leaving accelerates.** Entries use `land`, `landFirm`, `snap` or `glide`; exits use `exit` or `throw`. An exit that eases out looks like it changed its mind.
- **Move, do not fade.** Things arrive by travelling, scaling down from oversize, unmasking or focusing. Opacity is a helper of 4-6 frames under a move, not the move.
- **Arrive from big, not from zero.** A mark crashing in from 2.5-3.5x and landing reads as weight; growing from 0 reads as a template.
- **One spring per film.** `settle` is spent once, where a physical reward is earned. Everything else lands without bounce.
- **Hard cuts are state.** A UI row, a toggle, a counter step: switch it in one frame.

## Staggers (frames between sibling onsets)
| siblings | gap |
|---|---|
| letters, tiles | 1-2, uneven |
| words in a headline | 3-6 |
| words following a voice | 8-12 |
| rows, list items | 2-4 |
| pieces of a closing lockup | 6-9 |
Let each move last about twice the gap, so tails overlap and the group reads as one gesture. Uneven gaps (3, 2, 2, 4) read as hand-made; a fixed timer reads as a loading list.

## Holds
- A held frame keeps one living thing: a drift of 1-3 px per frame, a 0.5-1 % scale creep, light moving on the ground, a caret, a counter tick.
- A designed breath of 0.6-1.5 s before a payoff is good; state its reason in the storyboard.
- `review.py` fails a frozen picture longer than 2.0 s inside the film and an end hold longer than 1.4 s (0.6 s with `--exit-required`).

## Camera
- Push or pull of 1.1-1.5x over 15-25 frames to reframe; a one-frame snap zoom with a short tail to reveal.
- Keep one camera logic per film (locked, drifting, orbiting, or dollying). Mixing them reads as a template sampler.

## Clocks and blur
Pick one per film: smooth motion, or poses held on twos (every pose two frames, a hand-animated feel). Pick one blur grammar: none, directional smear on fast moves, or shutter-style blur. Never stack two.
