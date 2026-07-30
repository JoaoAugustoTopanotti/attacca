# attacca

> *attacca* (it., música) — emendar no próximo movimento, sem pausa.

**Alguém começa. Você continua.**

Plataforma de transcrição musical colaborativa — um "GitHub para tablatura".
A comunidade completa transcrições incompletas num revezamento assíncrono,
trilha por trilha, com a autoria de cada contribuição preservada.

Uma transcrição incompleta não é um beco sem saída: é um convite para contribuir.

## Como funciona

1. **Alguém começa** — cria a música, envia um Guitar Pro ou transcreve a primeira trilha.
2. **Você continua** — pega uma trilha vazia ("falta baixo") e propõe a sua parte.
3. **O dono aceita** — a proposta entra na música, seu nome fica nos créditos, para sempre.

Cada música tem Player · Colaborar · Propostas · Histórico — o modelo do Git
tornado literal para música.

## Rodar localmente

```
npm install          # NODE_OPTIONS=--use-system-ca se houver TLS corporativo
npx prisma db push   # SQLite local (prisma/dev.db)
npm run db:seed      # músicas demo tocáveis
npm run dev          # http://localhost:4000
```

Detalhes de stack, arquitetura e decisões: [`CLAUDE.md`](CLAUDE.md) e [`docs/adr/`](docs/adr/).
Vocabulário do projeto (o que significa "célula", "materializar", "slot"…):
[`docs/GLOSSARIO.md`](docs/GLOSSARIO.md).

---

*Este projeto se chamava GitSong até 2026-07-15.*
