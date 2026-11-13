# motionproof

An agent skill for motion graphics that proves its work. It directs a film around one idea the brand owns, refuses to repeat the last films, builds in plain HTML, HyperFrames or Remotion, and then measures the render: legibility, contrast, platform safe zones, reading time, dead air, the ending, flashes and loudness. Numbers from scripts, not adjectives.

It works with any agent that reads a `SKILL.md` folder. Everything runs locally and offline.

- **Requirements:** Node.js 22+, Python 3 (standard library only), FFmpeg with ffprobe. A Chromium browser (Chrome or Edge) only for HTML films.
- **No npm install, no pip install, no API keys.**
- **Windows, macOS, Linux.** Paths, browser discovery and console output are tested on Windows.

## What it checks

| script | input | checks |
|---|---|---|
| `probe.mjs` | HTML / HyperFrames page | L1 text size, L2 WCAG contrast against the real pixels under the text, L3 platform safe zone, L4 text clipped by the frame, L5 reading time; warns on overlapping text, page chrome and the slide-deck look (kicker over headline, left-anchored slide layout, typed headline, progress bar, stock UI card), FAIL with `--strict-style` |
| `review.py` | any MP4 (also Remotion, editors) | R1 render, R2 dead air and mid-film freezes, R3 ending (end hold, exit move), R4 flashes (WCAG-style), R5 detail inside the safe-zone margins, R6 loudness, true peak, silent tail, fade-out; writes a contact sheet with the margins drawn |
| `ledger.py` | the film's ingredients | rejects a combination that repeats the brand's recent films or any rejected one; suggests unused options |
| `master.py` | MP4 or audio | two-pass loudness normalisation to a delivery target, fade-out, video copied |
| `beats.py` | BPM | beat grid in frames, and how many cuts land on a beat |
| `render.mjs` | HTML / HyperFrames page | deterministic frame-by-frame MP4 or stills |
| `doctor.mjs` | the machine | Node, Python, FFmpeg, browser, free disk |

Every gate has a number, an exit code and a documented blind spot (`references/review.md`).

## Install

Clone into the folder your agent loads skills from, for example:

```
git clone <this repository> ~/.agents/skills/motionproof
node ~/.agents/skills/motionproof/scripts/doctor.mjs
```

Windows (PowerShell):

```
git clone <this repository> "$HOME\.agents\skills\motionproof"
node "$HOME\.agents\skills\motionproof\scripts\doctor.mjs"
```

Use whatever skills folder your agent reads; the skill only needs to find `SKILL.md`. If the browser is not found, set `CHROME_PATH` to the Chrome or Edge executable.

## Quick start

```
node scripts/render.mjs templates/film.html out/demo.mp4
node scripts/probe.mjs templates/film.html
python scripts/review.py out/demo.mp4 --expect 6 --exit-required
```

Remotion: copy `adapters/remotion/` into your `src/`, use `ease('land')`, `safeBox('reels', w, h)` and `readingFrames(text, fps)`, render as usual, then run `review.py` on the MP4.

## Tests

```
python tests/run_all.py
```
Builds video fixtures with FFmpeg's generators (no fonts, no network) in a temporary folder, runs every script, checks exit codes and key lines, and deletes the folder. Browser tests are skipped when no browser is present. Current result: 42 passed.

## Layout

```
SKILL.md              the workflow the agent follows
references/           direction, motion catalog, formats, sound, review, adapters
data/                 zones, loudness targets, motion tokens, ledger vocabulary (edit these, not the code)
scripts/              doctor, render, probe, review, master, beats, ledger (+ cdp.mjs, a tiny DevTools client)
templates/            film.html and kit.js, a dependency-free seek-safe runtime
adapters/             Remotion helpers and HyperFrames notes
tests/                run_all.py and HTML fixtures
```

## Limits

- Pixel checks cannot tell text from sharp texture, so the safe-zone pixel check warns instead of failing unless `--strict-zones`.
- The flash check approximates the WCAG general-flash rule; it is not a certified photosensitivity test and ignores the red-flash rule.
- `probe.mjs` cannot read Remotion's DOM; Remotion films get design-time helpers and the pixel checks.
- Safe-zone values change when platforms change their interface; they live in `data/zones.json`.
- Passing every gate means nothing measurable is broken. It does not mean the film is good.

## License

MIT. See `LICENSE` and `NOTICE`.

---

## Em português

**motionproof** é uma skill de agente para motion graphics que prova o próprio trabalho. Ela dirige o filme em torno de uma ideia que pertence à marca, recusa repetir a combinação dos últimos filmes, constrói em HTML puro, HyperFrames ou Remotion e depois mede o render: tamanho e contraste do texto, zona segura de cada plataforma, tempo de leitura, quadro morto, final com saída, flashes e loudness. Número de script, não adjetivo.

**Requisitos:** Node.js 22+, Python 3 (só biblioteca padrão), FFmpeg com ffprobe. Navegador Chrome ou Edge só para filmes em HTML. Sem `npm install`, sem `pip install`, sem chave de API. Funciona no Windows (PowerShell), macOS e Linux.

**Instalação:** clone o repositório na pasta de skills do seu agente e rode `node scripts/doctor.mjs`. Se o navegador não for achado, defina `CHROME_PATH`.

**Fluxo:** briefing em quatro linhas, três ideias de tipos diferentes e uma escolhida, `ledger.py check` contra os últimos filmes da marca, storyboard com o que cada beat faz o espectador acreditar, o beat mais difícil primeiro, rascunho, `probe.mjs` e `review.py`, correção, som com `master.py`, revisão final e `NOTE.md` com os números. O veredito de quem assistiu entra no ledger, e uma combinação reprovada fica bloqueada para sempre.

**Cara de slide:** o `probe.mjs` avisa quando o filme parece apresentação ou tela de aplicativo genérica: linha pequena em cima do título (W3), título encostado à esquerda com mídia, subtítulo ou duas linhas (W4), título digitado letra a letra (W5), barra de progresso (W6) e cartão de interface com saudação, bolinha de status, "rótulo · valor" ou texto cinza (W7). É aviso; `--strict-style` reprova e `--skip W4,W6` desliga regra por regra. Quando o padrão é a ideia, marque o elemento com `data-allow-<nome>` ou `data-ui` e explique no `NOTE.md`.

**Português na tela:** o texto em português ocupa mais espaço que o inglês; planeje o layout no texto final, corte palavras antes de diminuir a letra e use `toLocaleString('pt-BR')` para números.

**Testes:** `python tests/run_all.py` gera os vídeos de teste com o FFmpeg numa pasta temporária, roda tudo e apaga a pasta.

**Licença:** MIT.
