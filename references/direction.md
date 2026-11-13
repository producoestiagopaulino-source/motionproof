# Direction: from brief to beats

## 1. The brief in four lines
- **Who** watches, and in what state (scrolling a feed with sound off, waiting for a talk to start, comparing vendors).
- **Where**: platform and aspect. This fixes the safe zone, the type sizes and the length.
- **After**: the one action or belief you want when the film ends.
- **Feel**: one word that a frame can carry (calm, certain, playful, urgent).

Then the one true thing: the real feature, result or moment the film is for. If there is none, there is no film yet; ask.

## 2. Inventory before ideas
List what the brand actually owns: its logo shape, its core gesture (what a user does), its material (paper, stage, screen, fabric, code), its verb, its moment of success, its voice, its colour logic, its type, and what it would never do. Ideas are built from this list, not from the brand's name.

## 3. Kinds of film (pick three different kinds, then one)
| kind | what the viewer watches | good when |
|---|---|---|
| documentary of one task | a real task done start to finish in the product | the product is the proof |
| single held shot | one continuous camera move through a built space | the brand is a place or a process |
| countdown | time running out, and the brand being ready | events, launches, deadlines |
| diagram that builds | a plan or system assembles, then comes alive | services that are invisible |
| object's journey | one object travels through the story and becomes the next scene | physical products, kits |
| before / after match cut | the same frame, wrong then right | a clear pain with a clear fix |
| typographic essay | words performed at speech rhythm, few and large | a strong line of copy |
| real-output montage | the actual things the brand made, fast | portfolios, studios |
| stillness that breaks | a calm frame held, then one decisive change | premium, calm brands |
| character gag | a small character or object with a problem | consumer brands, humour |
| data as object | a number becomes a physical thing in the scene | one strong, true figure |

Two tests for every idea:
- **Cover the logo.** Does the film still belong only to this brand? If not, go back to the inventory.
- **Competitor swap.** Put a rival's name on it. If nothing breaks, the idea is generic.

## 4. Beats
Roles: **hook** (the first 1-2 s decide whether the viewer stays; already moving on frame 0), **turn** (the problem flips or the stakes appear), **proof** (the thing happens on screen; the largest share of the film), **close** (the brand arrives because of what happened, and leaves on an exit move).

For each beat write: "After this beat the viewer believes ___." A beat that cannot finish the sentence is cut.

Handoffs: the last frame of one beat should prepare the first frame of the next. Ways to hand off: an object carried across the cut, a match of shape or position, a camera move that continues, a cut on the music, a mask that becomes the next ground. A hard cut is a decision, not a default; a crossfade between scenes is almost never the answer.

Emphasis is a budget: at most a quarter of the beats are "the point". Big needs small around it. One focal point per frame.

## 5. Length and pace (starting values)
- Reels / shorts: 8-20 s. The hook text appears within the first 0.5 s.
- Launch or promo: 15-45 s.
- A single moment or sting: 3-7 s.
- Shots change every 0.4-2.5 s; a designed breath of 0.6-1.5 s before a payoff is good, and should still have one living thing in it.

## 6. Copy
Short sentences in the brand's own voice. Avoid slogan patterns: "Not just X, it's Y", triplets of one-word sentences, "unlock", "the future of", "meet X". A claim on screen is followed by the product showing it.

### Portuguese (and other long languages)
- Portuguese runs roughly 20-30 % longer than the same English line (an estimate: measure your own copy). Plan the layout on the Portuguese text, not on an English draft.
- Reading time grows with characters, so cut words before you shrink type: the `0.5 s + characters / 17` rule in probe.mjs counts characters.
- Avoid hyphenation in display type; break lines by meaning, not by width.
- Accents need vertical room: check that line-height does not clip "Ã", "Ç", "É" in tight display settings (probe L4 catches clipping by containers).
- Numbers: Brazilian format uses a dot for thousands and a comma for decimals (`toLocaleString('pt-BR')`, `kit.js count({ format: 'pt-BR' })`).

## 7. Ending
End on an exit move (the mark shrinks to its place, an iris closes on it, a light wipes, the camera pulls away) and a sound fade. A logo held still with a tagline, a button and a URL is a web footer, not an ending. `review.py --exit-required --fade-required` checks both.
