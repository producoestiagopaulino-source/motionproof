# Review: every gate, its number, its blind spot

A gate is a floor. Passing all of them means nothing is broken in the ways a script can see; it does not mean the film is good. Write what you checked, never that the film is good.

## probe.mjs (HTML and HyperFrames, live DOM)
| rule | fails when | blind spot |
|---|---|---|
| L1 size | rendered font size < 3.1 % of the short side, for 0.3 s or more | text inside canvas, images, video |
| L2 contrast | median WCAG ratio of text colour over the pixels under it < 4.5 (< 3 for large text) | gradient-filled text (transparent colour) is skipped |
| L3 safe zone | a text box inside the platform margins for 0.3 s or more | non-text focal objects |
| L4 clipped | less than 98 % of a text box visible (frame edge or overflow), for 0.3 s or more | |
| L5 reading time | a text block fully visible for less than 0.5 s + characters / 17 | assumes one reader pace |
| W1 overlap | two visible text blocks overlap (ghost text from a previous scene) | warning only |
| W2 chrome | small corner text, tracked capitals, counters or timecodes | warning only; `data-diegetic` silences it |

### Style warnings (W3-W7): the film looks like a slide deck or a stock app screen
WARN by default, FAIL with `--strict-style`, switched off one by one with `--skip W4,W6`. Text inside `data-diegetic` or `data-ui` (a declared interface surface: the product screen is the subject) never counts. Each rule has its own opt-out on the element or an ancestor.
| rule | warns when | opt-out | blind spot |
|---|---|---|---|
| W3 kicker | a line at most 40 % of the headline's size sits right above it (gap up to one headline size), sharing its left edge or its centre, for 0.3 s or more; a headline is text of 5 % of the short side or larger | `data-allow-kicker` | an eyebrow drawn as an image |
| W4 slide | a left-aligned headline starting in the left 20 % of the frame comes with media or a card on its right, a smaller subtitle under it, a kicker, or wraps to 2+ lines, for 1.2 s or more in a row | `data-allow-slide` | centred or right-aligned decks |
| W5 typed | the same element's text grows 5+ times by at most 4 characters, each state a prefix of the next, 8+ characters in all (a trailing caret is ignored) | `data-allow-typing` | letters revealed by opacity, clip-path or a mask |
| W6 progress | an element with no text, under 1.2 % of the short side thick, grows along its length 5+ times over 1 s or more, never shrinking, by 15 % of the frame or more | `data-allow-progress` | bars drawn in SVG strokes or canvas |
| W7 stock card | a rounded card with a fill holds 2+ of: a greeting ("bom dia", "good morning", "olá,"), a "label · value" line, a coloured status dot, zinc-grey text, for 0.3 s or more | `data-allow-card` | cards built from images |

Opt-outs: `data-texture`, `data-diegetic`, `data-ui`, `data-allow-unsafe`, `data-allow-crop`, `data-allow-kicker`, `data-allow-slide`, `data-allow-typing`, `data-allow-progress`, `data-allow-card`. Each one used must be explained in `NOTE.md`.

## review.py (any MP4)
| gate | fails when |
|---|---|
| R1 render | under 75 % of frames carry picture, under 20 % of frames change, duration off `--expect` by more than one frame (min 0.05 s), no audio with `--expect-audio` |
| R2 dead air | a flat-field run longer than 3 frames inside the film (a black open up to 1 s is allowed), a frozen picture longer than `--freeze-max` (2.0 s) before the end |
| R3 ending | end hold longer than `--end-hold-max` (1.4 s); with `--exit-required`, end hold over 0.6 s or under 0.25 s of motion in the last second |
| R4 flashes | more than 6 opposing luminance transitions (more than 3 flashes) in any 1 s, in any of 9 screen cells; transitions are swings of 0.1 relative luminance with the darker side under 0.8 |
| R5 safe zones | persistent edges (in two consecutive samples 0.5 s apart) cover 1.2 % or more of a margin band; WARN by default, FAIL with `--strict-zones` |
| R6 sound | integrated loudness off target by more than 1.5 LU, true peak above target, silent tail over 0.3 s, and with `--fade-required` no 6 dB drop in the last 0.25 s |
A frame "changes" when at least 0.1 % of the analysis pixels move by 4 levels or more, so small text moving on a large ground still counts.

Blind spots: R4 is an approximation of the WCAG general-flash rule, not a certified photosensitivity test, and it ignores the red-flash rule. R5 cannot tell text from a sharp static texture: that is why it warns, and why the sheet shows the margins in red. Motion mean is printed as a reading, never as a gate.

## Profiles
Save a house standard once and pass it every time:
```json
{ "zones": "reels", "target": "reels", "exit_required": true, "fade_required": true, "expect_audio": true }
```
`python scripts/review.py film.mp4 --profile house.json`

## The look routine (after the numbers)
1. Open `sheet.jpg`. Describe every frame in one sentence: what is on screen, where the eye goes.
2. Thumbnail test: which frame would someone screenshot? If none, the hero moment is missing.
3. Cover test: hide the text; does the picture still tell the beat?
4. Watch once at full speed with sound, once silent.
5. Fix in order: untrue or broken; the idea; handoffs; hierarchy and scale; timing; surface; sound.
