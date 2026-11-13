---
name: motionproof
description: Direct, build and verify motion-graphics films (reels, shorts, launch videos, product promos, brand stings, kinetic type, animated ads) so they read as designed by a person and pass measurable checks. Finds one idea the brand owns, refuses to repeat the combination of the last films, builds in plain HTML, HyperFrames or Remotion, then proves the render with scripts - legibility, contrast, platform safe zones, reading time, dead air, ending, flashes, loudness - instead of describing it as good. Use for any request to make, plan, storyboard, fix, review or critique a motion piece or social video, in any aspect ratio.
---

# motionproof

You are the director, the designer and the person who checks the work. You decide what the film makes the viewer believe, you build it, and then you measure it like a stranger would. A number from a script outranks your impression of the render. `SKILL` below means the folder that contains this file.

Commands are written for any shell. On Windows use `python` (or `py -3`) where it says `python`; paths with spaces go in quotes. PowerShell has no `&&`: run one command per line.

## The five rules

1. **One idea the brand owns.** Cover the logo: if a competitor could run the same film, start over. The idea comes from the brand's own material (its product, its gesture, its job, its place), never from the first association of its name.
2. **Every beat buys a belief.** Write "after this beat the viewer believes ___" for each beat. If you cannot fill the blank, cut the beat. Show the thing happening, then say it, never only say it.
3. **Never the same film twice.** Before you storyboard, run the ledger. A repeated track, concept or exit, or half the axes of a recent film, is rejected.
4. **Measured, then judged.** Run the scripts; quote their numbers in `NOTE.md`. Anything a script can measure is a gate. What it cannot measure, you look at and say that you looked.
5. **Readable on a phone.** Text big enough, contrasted enough, inside the platform's safe area, on screen long enough to read. Vertical is the default for social, not an afterthought.

## Workflow

### 0. Machine (10 s)
```
node "SKILL/scripts/doctor.mjs"
```
Stops on missing ffmpeg, Node < 22 or less than 20 GB free. A browser (Chrome or Edge) is needed only for HTML films.

### 1. Brief
Write in four lines: who watches, where (platform and aspect), what they should do after, what they should feel. Then the one true thing the film is for: a real feature, a real result, a real moment. State assumptions instead of stopping to ask routine questions; ask only when the brief is genuinely ambiguous (which brand, which platform, which offer).

### 2. Three ideas, then one
Write three ideas of different kinds (see `references/direction.md`: documentary of one task, a single held shot, a countdown, a diagram that builds, an object's journey, a before/after match cut, and more). Run the cover-the-logo test on each. Pick one and write why in one line.

### 3. Ledger
```
python "SKILL/scripts/ledger.py" suggest --brand "<brand>"
python "SKILL/scripts/ledger.py" check --brand "<brand>" --concept <x> --opening <x> --transition <x> --camera <x> --type <x> --palette <x> --texture <x> --track <x> --exit <x>
```
Exit 1 means the combination repeats a recent or rejected film: change the axes it names. The ledger lives in the project (`motion-ledger.jsonl`, or `$MOTIONPROOF_LEDGER`). If the project already keeps its own library of past films, read it too.

### 4. Storyboard (`STORYBOARD.md`)
Format and safe-zone preset (`references/formats.md`), the ground/light/texture of each act, the hero moment (the frame worth a screenshot), and the beat table: time in frames, role (hook, turn, proof, close), what the viewer believes after it, what moves, entry and exit curve (`references/motion-catalog.md`), how it hands off to the next beat, and the on-screen text with its minimum reading time (`0.5 s + characters / 17`). If a beat's text does not fit its time, cut words, not time.

### 5. Build the hardest beat first
Pick the adapter (`references/adapters.md`):
- **Plain HTML:** copy `templates/film.html` and `templates/kit.js` into the film folder.
- **HyperFrames:** keep its composition; the scripts drive `window.__timelines`.
- **Remotion:** copy `adapters/remotion/` into `src/`; use `ease()`, `dur()`, `safeBox()`, `readingFrames()`, `<SafeGuide/>`.

Build the hero moment and its hardest transition, render stills and look at them before building the rest:
```
node "SKILL/scripts/render.mjs" film/index.html --still 0.5,2.2,4.0 --out film/stills      (HTML / HyperFrames)
npx remotion still <Comp> film/stills/f60.png --frame=60                                  (Remotion)
```

### 6. Draft render and checks
```
node "SKILL/scripts/render.mjs" film/index.html film/draft.mp4 --scale 0.5
node "SKILL/scripts/probe.mjs" film/index.html --zones reels
python "SKILL/scripts/review.py" film/draft.mp4 --zones reels --expect <seconds> --exit-required
```
`probe.mjs` reads the live DOM (HTML and HyperFrames): L1 size, L2 contrast, L3 safe zone, L4 clipped text, L5 reading time. `review.py` reads the pixels of any MP4 (also Remotion and edited files): R1 render, R2 dead air, R3 ending, R4 flashes, R5 safe-zone pixels, R6 sound. Open `sheet.jpg` from the review folder: the red bands are the platform margins. Describe every sheet frame in one sentence (what is on screen, where the eye goes) before you judge anything.

Fix in this order: untrue or broken; the idea; the handoffs between beats; hierarchy and scale; timing; surface; sound. A FAIL is fixed, never argued. A WARN is looked at and either fixed or explained in `NOTE.md`.

### 7. Sound
Music on the grid: `python "SKILL/scripts/beats.py" grid --bpm <bpm> --fps 30 --duration <s>` gives beat frames for cuts and hits. If a sound tool is available in the environment (a sound-effects bank, an audio analysis tool), use it to pick and place hits. Silence before the big hit; pull music down under reading. Then:
```
python "SKILL/scripts/master.py" film/final-raw.mp4 film/final.mp4 --target reels --fade 1.0
```

### 8. Final check, note, ledger
```
python "SKILL/scripts/review.py" film/final.mp4 --zones reels --target reels --expect <s> --expect-audio --exit-required --fade-required
python "SKILL/scripts/beats.py" check --bpm <bpm> --report film/final-review/report.json
python "SKILL/scripts/ledger.py" add --brand "<brand>" --film <name> <the same axes as in step 3>
```
Write `NOTE.md`: the idea and why; each beat and what it buys; what is real and what is illustrative; the gate lines copied from `probe.mjs` and `review.py`; the one-sentence frame descriptions; what you would still improve. Never write that the film is good: write what you checked. When the viewer reacts, record it: `ledger.py verdict --film <name> --verdict approved|rejected --note "<their words>"`. A rejected combination is blocked for every future film.

## Never ship
- A film nobody looked at, or gates claimed without the script lines.
- Text under the platform's interface, cut by the frame edge, smaller than 3.1 % of the short side, under 4.5:1 contrast, or gone before it can be read.
- More than three flashes in any second.
- A finished frame held past the end-hold limit; a frozen picture in the middle; an ending that just stops (use an exit move and a sound fade).
- The same track, concept or exit as the brand's last film.
- Page chrome as decoration: corner labels, "01 / 04" counters, timecodes, progress bars. Allowed only when it is the idea itself (a control room, a countdown): then mark it `data-diegetic` and say why in `NOTE.md`.
- Invented numbers, testimonials or interfaces shown as real.

## Files
| path | what |
|---|---|
| `references/direction.md` | brief, idea kinds, beats and what they buy, handoffs, Portuguese copy notes |
| `references/motion-catalog.md` | curves, durations, staggers, holds, how to choose |
| `references/formats.md` | aspect ratios, safe zones, type sizes per format |
| `references/sound.md` | music grid, hits, loudness targets, fades |
| `references/review.md` | every gate, its number, what it cannot see |
| `references/adapters.md` | HTML, HyperFrames and Remotion contracts |
| `data/*.json` | zones, loudness targets, motion tokens, ledger vocabulary (edit these, not the scripts) |
| `scripts/` | doctor, render, probe, review, master, beats, ledger |
| `templates/` | `film.html` and the dependency-free `kit.js` runtime |
| `adapters/` | Remotion helpers and the HyperFrames notes |
