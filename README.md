# ARAUTO

Um "Jarvis da informação" pessoal: todo dia às 06:30, e quando você pedir, um briefing de notícias em português simples. O visual do app muda conforme a notícia mais comentada do mundo.

- Requisitos: [docs/briefing.md](docs/briefing.md)
- Plano, decisões, riscos e custos: [PLAN.md](PLAN.md)
- O que foi aprendido em cada etapa: [docs/aprendizado.md](docs/aprendizado.md)

## Pacotes

| Pacote | Função | Etapa |
|---|---|---|
| `packages/core` | Esquemas Zod, tipos e catálogo de temas | 0 (pronto) |
| `packages/server` | API, agendador e pipeline | 1 e 2 |
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
