# ADR 0002 — Modelo de células (trilha × compasso) para o revezamento

- **Status:** Aceito (design); migration pendente de execução
- **Data:** 2026-06-12
- **Depende de:** [ADR 0001](0001-formato-canonico.md) (alphaTex como formato canônico)

## Decisão (resumo)
A **célula `(trilha, compasso)` é a fonte da verdade**; o alphaTex completo é um
**artefato derivado**, montado a partir das células e validado/canonizado pelos
importador/exportador oficiais do alphaTab. Entidades: **`Track`** e **`Measure`** são o
**andaime estável** (ids, não índices); **`Cell`** é o slot `(trilha, compasso)`;
**`CellContribution`** é o conteúdo + autor + status (`accepted`/`proposed`/`rejected`).
A **`Revision`** existente vira **snapshot/proveniência** imutável. Decisão tomada com
evidência de spike (abaixo), incluindo **fidelidade estrutural**, não só de notas.

## As três perguntas (e as respostas)

### Q1 — Fonte da verdade: a célula
A verdade é a **contribuição de célula** (fragmento alphaTex + autor + status). O alphaTex
completo **nunca é editado à mão**: é montado das células e passa pelo importador/
exportador oficiais. **Regra anti-drift:** existe **um** lugar editável (as células);
`Revision.alphaTex` e o blob são **read-only derivados/proveniência**, nunca uma segunda
cópia editável. Edição = só numa célula; documento = montado na hora.

### Q2 — Identidade estável (andaime vs. preenchimento)
`Track` e `Measure` têm **`id` estável** + `order` (posição). "Baixo, compasso 5" =
`Cell(trackId=<baixo>, measureId=<id do 5º compasso>)` — nunca o inteiro 5. A **estrutura
do compasso** (fórmula, tempo, seção, repetições, voltas, jumps, armadura) é o **andaime
compartilhado**, em `Measure`. **Inserir/remover compasso é uma operação estrutural
separada e controlada** (mexe em `Measure.order`); como os vínculos são por `id`, a
autoria não escorrega quando a numeração muda.

### Q3 — Reconciliação com `Revision`
`Revision` deixa de ser onde a vida acontece e vira **snapshot imutável** (blob original +
alphaTex daquele momento; campo `kind = "import" | "snapshot"`). A colaboração viva
acontece nas **células**. Um import **materializa** o andaime + células (cada célula com
uma contribuição inicial `accepted`, autor = quem subiu). Tirar snapshot = montar as
células → alphaTex → congelar numa `Revision`. **Um grid vivo por música; vários snapshots
no tempo.** `CellContribution.status ∈ {accepted, proposed, rejected}` já antecipa o
"propor correção" (PR) sem precisar da UI agora.

## Schema proposto (Prisma)
```prisma
model Revision {            // agora: SNAPSHOT imutável (já existe; +kind)
  // ...campos atuais (number, alphaTex, storedPath/blob, ...)...
  kind String @default("import")   // "import" | "snapshot"
}

model Track {              // andaime por trilha (estável)
  id           String  @id @default(cuid())
  songId       String
  order        Int
  name         String
  headerFragment String?  // \track/\staff/\tuning opaco (montagem)
  tuning       String?    // tokens, ex.: "E4 B3 G3 D3 A2 E2"  (UI/leitura)
  instrument   Int?       // programa GM (UI)
  isPercussion Boolean @default(false)
  ownerName    String?    // quem "reivindicou" a trilha (stub)
  cells        Cell[]
  @@unique([songId, order])
}

model Measure {            // andaime compartilhado (estrutura)
  id            String @id @default(cuid())
  songId        String
  order         Int
  tsNumerator   Int @default(4)   // tipado: a UI lê pra desenhar o grid
  tsDenominator Int @default(4)
  tempo         Int?              // tipado: idem
  structPrefix  String?           // resto da estrutura como fragmento alphaTex OPACO
  cells         Cell[]            // (\section \ro \rc \ae \jump \beaming ...)
  @@unique([songId, order])
}

model Cell {               // o slot (trilha × compasso)
  id                     String  @id @default(cuid())
  songId                 String
  trackId                String
  measureId              String
  acceptedContributionId String? @unique
  contributions          CellContribution[] @relation("cellContribs")
  @@unique([trackId, measureId])
}

model CellContribution {   // conteúdo + autoria + status (a verdade)
  id         String  @id @default(cuid())
  cellId     String
  authorName String  @default("anon")
  alphaTex   String           // fragmento da célula: bar-meta (clef/ks) + notas
  status     String  @default("accepted")  // accepted | proposed | rejected
  message    String?
  createdAt  DateTime @default(now())
}
```

## Pipeline de montagem (células → alphaTex)
Cabeçalho global + por trilha (`Track.headerFragment`) → por `Measure` em ordem:
`Measure.structPrefix` (compartilhado) + `Cell.accepted.alphaTex` (por trilha) + `|`.
Concatena → `ScoreLoader.loadAlphaTex` (valida) → `AlphaTexExporter` (canoniza).
**Validação no aceite:** se uma contribuição quebra o compasso, o import falha e a
proposta é recusada — nunca entra conteúdo inválido.

## Evidência do spike (`spikes/assemble.mjs`, descartável)
Critério reforçado (a pedido da revisão): comparar **estrutura**, não só notas —
fórmula de compasso, tempo, armadura, clave, seções, repetições, **casas alternativas**,
direções (segno/coda/fine). Testado num caso **controlado rico em estrutura** e no
**Stairway real** (13 trilhas / 167 compassos / 19.786 notas):

| Teste | Notas | Estrutura |
|---|---|---|
| **A** — round-trip do formato (export→import) | idênticas | **sem perda** |
| **B** — decompor→remontar (célula = fragmento completo) | idênticas | **sem perda** |
| **C** — decompor→remontar (**structPrefix compartilhado na Measure** + notas por célula) | idênticas | **sem perda** |

Achados que moldaram o design:
- O **formato alphaTex é estruturalmente lossless** (a única diferença é o flag derivado
  `isDoubleBar`, com `barLineRight` preservado — perda ilusória).
- **Fatiar por marcador de masterbar é frágil** (o exportador só os emite quando há
  mudança); **fatiar por `|`** (cada célula = stream completo do compasso) é robusto. Isso
  é uma instrução de implementação: **não** regex-splitar a saída do exportador por
  marcadores; usar `|` e/ou montar via importador/exportador oficiais.

## Limitação consciente (registrada de propósito)
**A célula é o compasso inteiro de UMA trilha, com todas as vozes juntas.** Bate com o
slice já provado e é mais simples, **mas** significa que **dois colaboradores não podem
dividir vozes diferentes da mesma trilha no mesmo compasso** (ex.: um faz a voz rítmica e
outro a melódica da guitarra no compasso 12). É raro e a simplificação vale a pena —
**não é esquecimento**. Se um dia o nicho exigir, a granularidade vira `(trilha, compasso,
voz)` sem mudar a filosofia.

## Mitigação adotada (em vez de enumerar toda estrutura em colunas)
Estrutura do masterbar = **fragmento alphaTex opaco** (`Measure.structPrefix`), round-trip
sem modelar cada caso. Colunas tipadas só para `ts` e `tempo` (a UI lê pra desenhar o
grid). Provado lossless no PART C.

## Riscos / reavaliar no futuro
- Granularidade por voz (limitação acima) — reavaliar se o nicho pedir.
- Mudança estrutural (inserir compasso, mudar fórmula) = operação separada e controlada
  (não é "preencher célula"); desenhar essa operação com cuidado no M2.
- Materialização de imports antigos (ex.: Stairway) num grid de células — fluxo de
  back-fill a escrever.
- Conflito de mesma célula (duas propostas) = M3 (flag + escolha humana), já antecipado
  pelo `status`.
