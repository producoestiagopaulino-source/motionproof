# motionproof - progresso (13/11/2026)

## Pronto
- Skill completa: SKILL.md (9 passos), references/, data/ (zonas seguras, loudness, tokens, vocabulario), templates/.
- Scripts: doctor, render (HTML para MP4 via Chrome/Edge), probe (DOM: tamanho, contraste, zona segura, corte, tempo de leitura), review (MP4: R1 a R6), master (loudness e fade), beats, ledger (anti-repeticao).
- Adaptadores Remotion (TypeScript) e HyperFrames.
- Bateria offline: `python tests/run_all.py` com 42 testes passando.
- Repositorio publico: https://github.com/producoestiagopaulino-source/motionproof (ramo main).

## Em aberto
- Revisao cega A/B, captura de marca por site, voz, efeitos e musica, regra de flash vermelho.
- Valores de zona segura de TikTok e Shorts sao aproximados.
- Checagem de DOM para Remotion (hoje so pelos pixels do MP4 e helpers no codigo).

## Pendente do Tiago
- Escolher um alvo de loudness padrao (BIBLIOTECA-MOTION usa -15/-3, MODELO-PEDIDO usa -14/-2) e gravar como `--profile`.
- Opcional: escolher outro nome se motionproof confundir (existem repositorios de outros donos com nome parecido).

## Armadilhas
- Commits usam o e-mail noreply do GitHub, nao o pessoal.
- Fixtures de video sao geradas pelo ffmpeg em pasta temporaria; nada binario no repositorio.
