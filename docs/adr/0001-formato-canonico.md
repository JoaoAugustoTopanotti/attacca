# ADR 0001 — Formato canônico interno

- **Status:** Aceito
- **Data:** 2026-06-07
- **Decisão:** Adotar **alphaTex** (o formato de notação em texto do alphaTab) como
  **representação canônica interna** das transcrições. Manter o blob original do upload
  (`.gp`/MusicXML) apenas como *proveniência*. `JsonConverter` (JSON do alphaTab) fica
  como **fallback de alta fidelidade** para um eventual cache de modelo, **não** como
  fonte de verdade. **MusicXML está descartado** como formato canônico.

## Contexto

O diferencial do produto é **completar transcrições em conjunto, por trilha** —
revezamento assíncrono com merge por célula `(trilha, compasso)`. Isso exige uma
representação interna **estruturada, endereçável e versionável**. Não dá para versionar
nem fazer merge do blob binário do Guitar Pro. Esta é uma **porta de mão única**: decidir
errado obriga a refazer tudo que vier depois. Por isso o spike foi feito **antes** do M2.

Princípio guia do projeto: pequeno, nichado, **provado de ponta a ponta**. A decisão
abaixo é baseada em **experimento com arquivo real**, não em suposição.

## Experimento

Arquivo real: a transcrição multi-instrumento de **"Stairway to Heaven"** (`.gp`),
**13 trilhas / 167 compassos / 19.786 notas**, com bends, hammer-ons, ties, tuplets,
slides, ghost/dead notes, palm mute, vibrato — guitarras, baixo, bateria, teclado e voz.

Para cada candidato tecnicamente viável, executamos:

```
.gp ──(alphaTab importa)──▶ modelo ──(serializa)──▶ FORMATO ──(reimporta)──▶ modelo'
```

e comparamos uma **impressão estrutural** do modelo antes/depois (contagem de trilhas,
compassos, beats, rests, notas e efeitos). Script descartável em
[`spikes/roundtrip.mjs`](../../spikes/roundtrip.mjs). O alphaTab roda em **Node** para
import/export do modelo (sem DOM), então o experimento é puramente de dados.

## Resultados observados (não suposição)

| Critério | MusicXML | JSON (`JsonConverter`) | **alphaTex** |
|---|---|---|---|
| alphaTab **exporta**? | ❌ só importa | ✅ oficial (`scoreToJson`/`jsonToScore`) | ✅ oficial (`AlphaTexExporter`/`loadAlphaTex`) |
| Fidelidade no round-trip | — (precisaria de serializer próprio) | **100% lossless** (beats, rests, notas, efeitos idênticos) | **notas, trilhas, compassos e todos os efeitos medidos 100% preservados**; só **rests redundantes** normalizados |
| Beats que carregam nota | — | 7.551 → 7.551 | **7.551 → 7.551** (idêntico) |
| Rests (beats vazios) | — | 8.210 → 8.210 | 8.210 → **2.031** (normalizado) |
| Tamanho (esta música) | — | **22,5 MB** | **324 KB** (~70× menor) |
| É **texto** (diff/merge/versão)? | XML (verboso) | ❌ blob JSON aninhado gigante | ✅ texto; `\track` por trilha, barras separadas por `\|` |
| Endereçar `(trilha, compasso)` | médio | navegar árvore JSON enorme | trivial no modelo (`tracks[i].staves[].bars[j]`) e visível no texto |
| Código próprio necessário | **muito** (serializer MusicXML) | nenhum | nenhum |
| Acoplamento | baixo | **alto** (schema interno do alphaTab; quebra se o modelo mudar) | baixo (formato de autoria estável e documentado) |

**Achado central:** o número de **beats que carregam nota é exatamente igual
(7.551 = 7.551)** no round-trip do alphaTex — ou seja, a única divergência é a
**normalização de rests redundantes** (compassos vazios/segundas vozes de pausa), não
perda de conteúdo musical. Notas e efeitos batem nota a nota.

## Decisão e justificativa

Vence **alphaTex**. Pelos critérios definidos:

- **(a) Round-trip com perda aceitável para o nicho:** sim. 100% das notas e efeitos; a
  perda é só de rests redundantes (cosmético para tab de instrumento de corda).
- **(b) Endereçamento `(trilha, compasso)` simples:** sim — é o melhor dos três.
- **(c) Mínimo de importador/exportador próprio:** zero (alphaTab faz os dois lados).
- **Desempate (preferir texto, versionável; evitar editar o modelo na mão):** alphaTex
  ganha com folga. É **texto** (o produto é "GitHub para tablatura" — precisa de diff),
  **70× menor** que o JSON, e o round-trip passa **sempre pelo importador/exportador
  oficial** do alphaTab — nunca reconstruímos o modelo na mão (o caminho frágil que a doc
  desaconselha).

O **JSON** é mais fiel (100% lossless), mas é um **dump de 22,5 MB do modelo interno**:
não-diffável, acoplado ao schema do alphaTab (frágil entre versões) e inadequado como
fonte de verdade versionável. Fica registrado como **fallback** caso algum dia
precisemos de persistência byte-exata do modelo (ex.: cache de render). **MusicXML** sai
porque o alphaTab **não exporta** — adotá-lo nos tornaria donos de uma serialização
MusicXML inteira (trabalho real e propenso a erro), sem ganho frente ao alphaTex.

## O que se perde (e por que é aceitável agora)

- **Rests redundantes** (compassos totalmente vazios e segundas vozes de pausa) são
  normalizados pelo exportador alphaTex. Como toda nota e efeito é preservado, e o nosso
  nicho inicial é **tablatura de instrumentos de corda**, isso é aceitável — na prática é
  uma canonicalização. **Reavaliar** se algum caso exigir espaçamento rítmico multi-voz
  byte-exato (aí o JSON entra como cache).

## Como será o endereçamento `(trilha, compasso)` (esboço — não implementação)

- **Fonte de verdade:** alphaTex (texto) da música/trilha.
- **Índice confiável:** importar via alphaTab → `score.tracks[i].staves[s].bars[j]` dá
  acesso O(1) à célula. **Não** parsear o texto na mão para semântica — usar sempre o
  importador oficial.
- **Mutação de célula (M2):** substituir o conteúdo de `(trilha i, compasso j)` opera no
  nível do modelo/fragmento alphaTex e re-exporta — sempre via importador/exportador
  oficial, nunca montando o modelo manualmente.
- **Merge:** trilhas diferentes = linhas diferentes da grade → união trivial. Correção em
  trilha alheia = pull request. Conflito de mesma célula = mostrar lado a lado, humano
  escolhe (M3). Diff **estrutural** (sobre a árvore), não textual cru.

## Riscos conhecidos / quando reavaliar

- **Normalização de rests** do alphaTex (acima). Gatilho de reavaliação: necessidade de
  fidelidade rítmica multi-voz exata.
- **Dependência do exportador alphaTex** do alphaTab (recurso 1.7+). Se ele regredir,
  o JSON (`JsonConverter`) é o plano B imediato.
- **Granularidade do round-trip hoje é a música inteira.** Extrair/reinserir uma única
  trilha/compasso como fragmento alphaTex é design do M2 (o modelo já dá o índice; falta
  a mecânica de fragmento).
- **MusicXML continua útil como *entrada*** (usuários sobem MusicXML), só não é o store
  canônico.

## Consequências para o M2

- O store passa a guardar **alphaTex** como conteúdo versionável da transcrição (além do
  blob original como proveniência). A modelagem de dados (trilha/célula como entidade) é
  trabalho do M2, agora destravado por esta decisão.
- Nada disto foi implementado neste spike: o código em `spikes/` é descartável e os
  artefatos gerados (`spikes/*.alphatex`, `spikes/*.json`) são gitignored (grandes e,
  no caso do Stairway, obra derivada protegida).
