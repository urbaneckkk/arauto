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
| `packages/web` | App web e PWA (Stories, Lista, Ouvir, 15 temas, offline) | 2 (no ar; falta Web Push) |
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

Depois de clonar, rode uma vez `pnpm hooks:instalar`: ele liga a trava que **bloqueia commit e envio com segredo** (`.githooks/`).

## O app no ar (Etapa 2, versão enxuta)

**Endereço:** <https://urbaneckkk.github.io/arauto/> (público: qualquer pessoa com o link lê o briefing; não há dado pessoal nele).

- **iPhone:** abra o link no **Safari** → Compartilhar → *Adicionar à Tela de Início*. Abre em tela cheia e funciona sem internet.
- **Android:** Chrome → três pontinhos → *Instalar app*.
- **Windows, macOS ou Linux:** Chrome ou Edge → ícone de instalar na barra de endereço. A tela `#/instalar` do app mostra o passo a passo do seu aparelho.

Como funciona, sem servidor próprio: um fluxo do GitHub Actions (`.github/workflows/publicar.yml`) gera o briefing todo dia às 06:00 (horário de Brasília), guarda o resultado na branch `dados` e publica o site no GitHub Pages. Quem abre o app só **lê um arquivo**: abrir, recarregar ou atualizar a página não chama a API paga.

```bash
pnpm automacao:ativar      # guarda a chave do .env como segredo do GitHub e pede o briefing de hoje (rode no seu PC)
pnpm automacao:desativar   # apaga o segredo: o site continua no ar, só para de gerar briefing novo
pnpm web:dev               # app em modo de desenvolvimento (abre em http://localhost:5173/arauto/)
pnpm site:exportar         # transforma o estado local em arquivos de briefing para o app
```

Sem o segredo configurado, o fluxo só republica o app com o último briefing guardado (custo zero). As travas: perfil econômico (3 buscas, ~US$ 0,21 por briefing), `MAX_USD_MES` = US$ 5 (variáveis do repositório em *Settings → Secrets and variables → Actions → Variables*) e no máximo um briefing por dia.

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
