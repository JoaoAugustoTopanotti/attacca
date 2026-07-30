# `public/sf/` — soundfont de guitarras (versionado)

Diferente de `public/soundfont/`, que é **gerado** pelo plugin webpack do
alphaTab (e por isso gitignorado), esta pasta é conteúdo do repositório.

## `guitars.sf2` (3,3 MB)

Subconjunto dos presets de guitarra do **GeneralUser GS v2.0.3**, de
S. Christian Collins (<https://www.schristiancollins.com>), sob a
**GeneralUser GS License v2.0** — ver `LICENSE-guitars.txt`. A licença permite
uso em projetos de software e modificação do banco; e pede que não se aponte
direto para os arquivos de download do autor, e sim que se hospede uma cópia
local — que é exatamente o que este arquivo é.

### Por que ele existe

O soundfont padrão do alphaTab é o `sonivox.sf2` (SONiVOX EAS, o banco embarcado
de celular do Android): 1,3 MB para os 128 instrumentos GM. Nele os presets
**29 (Overdrive Gt)** e **30 (DistortionGt)** apontam para **os mesmos 7 samples**
— diferem só nos pontos de corte de `keyRange` —, e esses samples são loops de
152 a 394 amostras a **11 kHz**. Não existe conteúdo acima de ~5,5 kHz, que é
justamente onde mora a fritura que o ouvido reconhece como distorção. Resultado:
guitarra limpa, overdrive e distorção soavam a mesma coisa.

O `AlphaTabPlayer` carrega o `sonivox.sf2` e **anexa** este arquivo por cima
(`loadSoundFont(url, append: true)`), o que sobrepõe só os programas 24–31.
Baixo, bateria e teclas continuam vindo do sonivox.

### Como foi gerado

`GeneralUser-GS.sf2` (30,8 MB) → programas GM 24–31 → 3,3 MB, via um subsetter
de RIFF/sf2 escrito para esta tarefa (remapeia `phdr`/`pbag`/`pgen`/`inst`/
`ibag`/`igen`/`shdr` e recorta o `smpl` com o padding de 46 amostras do spec).

Uma modificação deliberada: a **atenuação de preset do programa 30 foi reduzida
em 7 dB** (9 dB → 2 dB nas duas camadas). O GeneralUser calibra os 128 presets
entre si, mas aqui eles convivem com outro banco; medido no sintetizador do
alphaTab, os três timbres de guitarra ficaram nivelados (RMS 0,040 limpa /
0,044 overdrive / 0,038 distorção para a mesma entrada MIDI).
