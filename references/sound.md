# Sound

## Picture and music share one clock
- Choose the track first when the film is cut to music. Get its tempo and the time of the first downbeat, then `python scripts/beats.py grid --bpm <bpm> --offset <s> --fps 30 --duration <s>` gives every beat as a frame.
- Put cuts and big arrivals on beats, not all of them: a cut exactly on every beat becomes a metronome. After the final render, `beats.py check --report <review>/report.json` shows which cuts landed within one frame of a beat.
- The ledger's `track` axis stops the same track coming back within three films of a brand.

## Hits
- One to three hand-placed hero hits per film, on the moments that change belief (the reveal, the proof landing, the mark arriving).
- Silence or a drop just before the biggest hit makes it land.
- A whoosh under every move is noise. A sound for the cursor click, the stamp, the switch is detail.
- If the environment has a sound-effects bank or an audio analysis tool, use it to choose hits and to check the mix; this skill only measures the result.

## Voice
Write lines at about 2.5-3 words per second, one short line per beat. On-screen words land 0-2 frames before they are heard.

## Delivery targets (`data/targets.json`)
| target | integrated | true peak |
|---|---|---|
| reels, tiktok, shorts, youtube | -14 LUFS | -1 dBTP |
| web, podcast | -16 LUFS | -1 dBTP |
| broadcast | -23 LUFS | -1 dBTP |
Tolerance in review.py: +-1.5 LU. `master.py` gets there with a two-pass linear loudnorm and leaves the video stream untouched. If a project has its own house target, add it to the JSON and use `--target`.

## Ending
The film ends with a fade of 0.8-1.5 s on the music, together with the picture's exit move. `review.py --fade-required` checks that the last 0.25 s is at least 6 dB below the two seconds before it, and R6 fails a silent tail longer than 0.3 s (the music ended before the picture).
