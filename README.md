# ARAUTO

Um "Jarvis da informação" pessoal: todo dia às 06:30, e quando você pedir, um briefing de notícias em português simples. O visual do app muda conforme a notícia mais comentada do mundo.

- Requisitos: [docs/briefing.md](docs/briefing.md)
- Plano, decisões, riscos e custos: [PLAN.md](PLAN.md)
- O que foi aprendido em cada etapa: [docs/aprendizado.md](docs/aprendizado.md)

## Pacotes

| Pacote | Função | Etapa |
|---|---|---|
| `packages/core` | Esquemas Zod, tipos e catálogo de temas | 0 (pronto) |
| `packages/server` | Pipeline do briefing e comandos de linha (Etapa 1); API e agendador na Etapa 2 | 1 (falta a execução real) e 2 |
| `packages/web` | App web e PWA | 2 |
| `packages/desktop` | Casca Windows (Tauri 2) | 3 |
| `packages/mobile` | Casca Android (Capacitor) | 4 |
| `packages/themes` | Pacotes visuais dos temas | 2 |

## Como rodar

Precisa de Node 24 e pnpm (a versão fica em `packageManager` no `package.json`).

```bash
pnpm install
pnpm verificar   # build, typecheck, lint e testes: o mesmo que o CI roda
```

Comandos avulsos: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`.

## Gerar um briefing (Etapa 1)

```bash
cp .env.example .env                 # preencha ANTHROPIC_API_KEY (o .env nunca vai para o Git)
pnpm tema:testar                     # casos de tema contra o modelo real (~US$ 0,15)
pnpm brief:gerar --sem-banco         # gera o briefing do dia, sem Postgres
pnpm brief:ver --sem-banco           # lê o briefing
pnpm brief:ver --sem-banco --links   # reabre cada fonte e confere a idade
pnpm brief:gerar --sem-banco --gravar real-1   # gera e grava tudo em gravacoes/real-1
pnpm brief:gerar --sem-banco --replay real-1   # repete a gravação: sem internet, sem modelo, sem custo
```

As travas de custo (`MAX_USD_POR_EXECUCAO`, `MAX_USD_MES`, `GASTOS_PAUSADOS`) ficam no `.env`. Com Postgres local: `docker compose up -d` e `DATABASE_URL` no `.env`; sem banco, use `--sem-banco`.
