# Diário de aprendizado do ARAUTO

Uma entrada por etapa, escrita quando a etapa fecha. Cada entrada responde três perguntas:

1. **O que foi feito?**
2. **Por que essa solução?**
3. **Qual alternativa foi descartada, e por quê?**

---

## Etapa 0 — fundação (04/11/2026)

### O que foi feito

- **Plano aprovado.** [PLAN.md](../PLAN.md) com decisões, riscos e custos. Antes de escrevê-lo, testei na rede os feeds e as APIs do briefing. Isso achou 11 pontos que precisavam mudar, entre eles Reuters e AP sem RSS público, o feed CAP do INMET fora do ar e a verificação de desenvolvedor do Android já em vigor no Brasil.
- **Monorepo pnpm** com `core`, `server`, `web`, `desktop`, `mobile` e `themes`. Só o `core` tem código; os outros cinco são cascas vazias com README, para o Tauri, o Capacitor e o Rust não entrarem antes da hora.
- **TypeScript estrito** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e mais) e **Biome** para lint e formatação.
- **`@arauto/core`**: esquemas Zod do briefing, do catálogo fechado de 15 temas, dos passos do pipeline e do `meta.json` de tema, mais o JSON Schema do briefing gerado a partir do Zod. **65 testes**.
- **CI** em `.github/workflows/ci.yml`: instalação com lockfile congelado, build, typecheck, lint e testes.
- `git init` local. Nenhum commit foi feito.

### Por que essa solução

- **Zod como fonte única de verdade.** O mesmo esquema valida o que o modelo devolve, o que a API entrega e o que a interface lê, e dele sai o JSON Schema. É o argumento principal para o servidor ser TypeScript e não ASP.NET (PLAN.md, D1).
- **Regras de segurança já nos esquemas, onde dá.** O tema `luto` não pode ter som em `meta.json`, tema desconhecido vira `neutro` por `normalizarTemaId`, e o texto do aviso tem 40 e 110 caracteres no máximo. O que depende de julgamento sobre a notícia fica para a Etapa 1.
- **`PropostaDeTema` separada de `TemaEscolhido`.** A primeira é a saída crua do modelo, com o `id` como texto livre. Assim um id inventado vira `neutro` em vez de derrubar o passo inteiro. A segunda é o tema já validado, com o `id` no catálogo, e é a que vai para o briefing.
- **Catálogo de versões** (`catalog:` no `pnpm-workspace.yaml`): cada versão é declarada uma vez e os pacotes só referenciam.
- **`core` compila para `dist/`.** É o caminho mais previsível para o servidor, o Vite e as cascas consumirem o mesmo pacote.

### Alternativa descartada

- **Deixar o Biome formatar o Markdown.** Ele quis realinhar todas as tabelas do plano; excluí `*.md` da checagem para os documentos ficarem como foram escritos.
- **Aceitar o Biome 2.6.5.** Foi publicado 11 horas antes da instalação, e o pnpm 12 abriu sozinho uma exceção na própria proteção contra pacote comprometido para instalá-lo. Fixei a 2.6.4 (7 dias de idade). Quando a 2.6.5 tiver alguns dias, basta subir a versão no catálogo.
- **Pacotes do monorepo apontando direto para o `src/`.** Funciona no Vite, mas o Node precisaria de extensões `.ts` e de sintaxe só apagável. Mais frágil que compilar.

### O que aprendi (surpresas)

- O `typescript` na versão 7 já é o compilador nativo e funcionou com o mesmo `tsc -p`, sem ajuste.
- O pnpm 12 tem **idade mínima de versão** por padrão: versão recém-publicada exige uma exceção explícita.
- Zod 4: `z.iso.date()`, `z.iso.datetime({ offset: true })`, `z.url({ protocol: /^https$/ })`, `z.literal([1, 2, 3])` e `z.toJSONSchema()`.
- `exactOptionalPropertyTypes` obriga a escolher entre "campo ausente" e "campo `undefined`". Por isso `pontuacaoParcial` usa `.default(false)` e não `.optional()`.

### Onde o contrato era vago, e o que o código fixou (revise)

| Ponto | O que o código faz | Por quê |
|---|---|---|
| `curiosidade` | Pode ser `null` | "Nunca preencha lacunas com texto inventado." O contrato mostrava `{}` sem forma definida. |
| Notícias por seção | De 1 a 4 | O passo de verificação descarta notícias e uma seção pode sobrar com uma só. O alvo "2 a 4" fica no prompt. |
| Teto de notícias | 14 nas seções, fora a curiosidade | PLAN.md, seção 0.1, item 9. Constante `TETO_NOTICIAS`. |
| `lados` | Lista de `{ quem, posicao }` | O contrato mostrava `[]`. "Atribuir cada posição a quem a defende" pede essa forma. |
| Ids de seção | `politica`, `economia`, `agro`, `tecnologia`, `seguranca_saude`, `parana`, `mundo` | Tirados dos blocos do prompt editorial. Seção "Games" fica para a Etapa 1 (Q8). |
| `alertas` | `{ fonte, tipo, nivel, inicio, fim, url? }`, com nível amarelo, laranja ou vermelho | "Tipo, nível e horário" do prompt, com a correspondência dos níveis do INMET. |
| `meta.json` → `som` | Booleano | **Provisório**: o pacote do Claude Design pode pedir mais que isso. |
| `historiaDoDia` | Campo extra `pontuacaoParcial` (padrão falso) | Marca o dia em que o GDELT falhou (PLAN.md, seção 0.1, item 3). |
| Passo do pipeline | Até 3 tentativas (1 inicial + 2 repetições) | "Tente de novo 2 vezes por passo." |

### Pendente para fechar a Etapa 0

- O CI ainda não rodou: depende do repositório no GitHub.
- Você testar (`pnpm verificar` na sua máquina).
