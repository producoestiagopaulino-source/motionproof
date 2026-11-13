# motionproof - progresso (13/11/2026)

## Pronto
- Skill completa: SKILL.md (9 passos), references/, data/ (zonas seguras, loudness, tokens, vocabulario), templates/.
- Scripts: doctor, render (HTML para MP4 via Chrome/Edge), probe (DOM: tamanho, contraste, zona segura, corte, tempo de leitura), review (MP4: R1 a R6), master (loudness e fade), beats, ledger (anti-repeticao).
- Adaptadores Remotion (TypeScript) e HyperFrames.
- Regras de layout W3 a W7 no probe (kicker sobre headline, layout de slide, headline digitada, barra de progresso, cartao de interface generico): avisos por padrao, `--strict-style` reprova, `--skip` e `data-allow-*` desligam.
- Bateria offline: `python tests/run_all.py` com 52 testes passando.
- Repositorio publico: https://github.com/producoestiagopaulino-source/motionproof (ramo main).

## Em aberto
- Revisao cega A/B, captura de marca por site, voz, efeitos e musica, regra de flash vermelho.
- Valores de zona segura de TikTok e Shorts sao aproximados.
- Checagem de DOM para Remotion (hoje so pelos pixels do MP4 e helpers no codigo).

- Limites das regras W: W4 avisa demais em titulo de 2 linhas alinhado a esquerda no vertical; W5 nao ve revelacao por opacidade ou mascara; W6 nao ve barra em SVG ou canvas; W7 usa faixa fixa de cinza.
- Sem teste proprio para `data-diegetic` nas regras W e para cada escape individual.

## Pendente do Tiago
- Nada. Decisoes tomadas em 13/11: loudness -14 LUFS com pico -2 dBTP (data/targets.json) e perfil `profiles/default-vertical.json`; nome motionproof mantido (repositorios homonimos sao de outros donos).

## Armadilhas
- Commits usam o e-mail noreply do GitHub, nao o pessoal.
- Fixtures de video sao geradas pelo ffmpeg em pasta temporaria; nada binario no repositorio.
