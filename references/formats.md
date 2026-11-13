# Formats, safe zones, type sizes

## Sizes
| aspect | pixels | typical use | default zone preset |
|---|---|---|---|
| 9:16 | 1080x1920 | Reels, TikTok, Shorts, Stories | `reels` |
| 4:5 | 1080x1350 | feed post | `feed45` |
| 1:1 | 1080x1080 | feed, carousel | `square` |
| 16:9 | 1920x1080 | YouTube, site, screens, events | `wide` |
`--zones auto` (the default in probe.mjs and review.py) picks the preset from the aspect ratio.

## Safe zones
Margins are fractions of the frame that text and the focal action must stay out of (`data/zones.json`):
| preset | top | bottom | left | right | note |
|---|---|---|---|---|---|
| reels | 0.115 | 0.22 | 0.12 | 0.12 | header, caption, buttons |
| tiktok | 0.08 | 0.25 | 0.06 | 0.15 | right-side action column |
| shorts | 0.09 | 0.21 | 0.06 | 0.12 | |
| story | 0.13 | 0.17 | 0.06 | 0.06 | reply bar at the bottom |
| vertical | 0.13 | 0.25 | 0.12 | 0.15 | union of the above: one master for every vertical platform |
| feed45 / square | 0.06-0.08 | | 0.06 | 0.06 | crop and rounded corners |
| wide | 0.05 | 0.05 | 0.05 | 0.05 | title-safe |
Platforms change their interface: these are working values, not guarantees. Update the JSON, never the scripts. Backgrounds and images may run to the edge; text and the thing the viewer must see may not.

## Type sizes
- Minimum: 3.1 % of the short side (34 px on a 1080-wide frame). probe.mjs L1 fails anything smaller unless marked `data-texture` (unreadable on purpose, like interface detail in the background).
- Contrast: 4.5:1 for text under 6 % of the short side, 3:1 above (WCAG). probe.mjs L2 measures text colour against the pixels actually under it.
- Headlines on vertical: 6-10 % of the width per line height is a comfortable range; a hero word can go much bigger once.
- Size is measured as rendered: a word scaled up by a transform counts at its rendered size, and a word still arriving from oversize is not judged until it has held for 0.3 s.

## Reading time
A line must stay fully visible (opacity at least 0.9, unclipped) for `0.5 s + characters / 17`. "Seu evento no ar" (13 characters without spaces) needs 1.27 s, which is 38 frames at 30 fps. Use `readingFrames()` in Remotion, and probe.mjs L5 checks HTML.

## One master or several
If the same film goes to several platforms, either build on `vertical` (the strictest union) once, or build per platform and run probe/review with each preset. Do not crop a 16:9 master into 9:16 and expect the text to survive.
