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

### Publicação: o que quase deu errado

Na hora de publicar, a auditoria achou o que um olhar apressado deixaria passar:

- **O e-mail pessoal iria para o histórico público.** O git global tinha o Gmail do autor. Commit publicado não se apaga de verdade, então o repositório usa o e-mail *noreply* do GitHub, configurado só nele (`git config --local`).
- **Rotina pessoal na cópia do briefing** (horário de acordar, trajeto de ônibus). A seção foi omitida da cópia pública.
- **Nada impedia um segredo futuro.** Entrou o verificador `pnpm segredos`, testado de verdade: plantei uma chave falsa fora do repositório e ele acusou, sem imprimir o valor.
- **Ordem importa.** O repositório foi criado vazio, as proteções do GitHub (*secret scanning* e *push protection*) foram ligadas e lidas de volta, e só então o código subiu.

Detalhes e a lista do que fica para o servidor na Etapa 2: [PLAN.md](../PLAN.md), seção 2.9.

### Estado da Etapa 0

- Publicada em <https://github.com/urbaneckkk/arauto>. O CI passou no GitHub (23 s).
- **Falta você testar** (`pnpm verificar` na sua máquina) antes de abrir a Etapa 1.

---

## Etapa 1: cérebro, sem interface (04/11/2026)

### O que foi feito

- **Pipeline completo** em `packages/server`: coleta de 38 feeds, previsão (Open-Meteo) e alertas (INMET); termômetro do mundo; apuração com busca web; redação; verificação de fontes; tema; publicação.
- **Custo sob controle**: tabela de preços em código, livro-caixa por chamada e três travas (por execução, por mês e o interruptor `GASTOS_PAUSADOS`), checadas **antes** de cada chamada, pelo pior caso, e **depois**, pelo uso real.
- **Três repositórios** com o mesmo contrato de testes: memória, arquivo local (`--sem-banco`) e Postgres com migrações.
- **Gravar e repetir**: `--gravar` guarda a internet e as respostas do modelo; `--replay` repete de graça.
- **Comandos**: `brief:gerar`, `brief:ver` (com `--links` e `--passos`), `db:migrar`, `tema:testar`.
- **Regras de tema** no `core`, com vetos por manchetes para luto, nuclear e animal ferido.

### Por que essa solução

- **O modelo escreve texto; o código decide o que importa.** Pontuação, alertas, números do tempo, tema final, lista de fontes e limites do contrato são código. O redator cita fontes por identificador (`i042`) e não por URL, então link inventado não tem como existir.
- **Duas camadas na segurança de tema.** A ficha de sinais que o modelo preenche e, independente dela, vetos por palavras nas manchetes. Teste com um modelo **hostil** (sempre `ternura_animal`, ficha toda falsa) prova que luto, nuclear e animal ferido ficam em 100% mesmo assim.
- **Apuração e redação em chamadas separadas.** A busca web devolve citações, e a documentação avisa que citações são incompatíveis com saída estruturada. Separar evita um erro 400 que eu só descobriria com a sua chave.
- **Uma interface `Transporte` para toda a internet.** É o que torna possível gravar, repetir e testar sem rede.

### Alternativas descartadas

- **Busca web como única fonte de notícia.** O RSS já entrega fonte, URL, data e resumo de graça; a busca ficou só para confirmar e completar (PLAN.md, seção 3.3).
- **GDELT como peça central.** Ver abaixo: não é confiável. Virou sinal opcional com disjuntor.
- **Docker obrigatório para testar o Postgres.** O Docker Desktop não subiu aqui. Validei contra um Postgres 17 de verdade rodando temporário, fora do repositório; o CI usa um serviço do GitHub Actions.
- **`fallbacks: "default"` já ligado.** Exige a API beta e não dava para testar sem a chave; fica para depois da primeira execução real.

### O que aprendi (surpresas)

- **Teste com dados reais acha o que o teste sintético não acha.** A coleta real mostrou a Folha passando por `redir.folha.com.br` (216 links que a lista branca descartaria), o Plural bloqueando o robô (403) e um feed do g1 parado desde 2024.
- **GDELT**: 12 a 16 s por chamada e 429 mesmo com mais de 18 s entre as chamadas. O "limite de 1 chamada a cada 5 s" não é o problema; o serviço está instável.
- **Um teste de contrato pegou um bug de verdade.** O repositório em memória somava o gasto do mês pelo texto da data em UTC; um gasto às 23h de 30/11 em São Paulo caía em dezembro e embaralharia a trava mensal. O Postgres já fazia certo.
- **Teste de mutação.** Quebrei o código de propósito em 6 pontos críticos (fonte velha aceita, trava de custo frouxa, veto de tragédia removido...) e conferi que a suíte falhava em todos.
- **O corretor automático do Biome sugeriu `Math.max` sobre textos**, que devolveria `NaN`. Corretor automático sugere; quem decide é você.
- **`renameSync` no Windows** pode falhar de vez em quando (antivírus segurando o arquivo). O repositório em arquivo repete e, no último caso, grava direto.
- **Vetos por palavras precisam de testes dos dois lados.** "Cai 10%" não são 10 mortos, "acordo nuclear" não é arma nuclear, "filhote resgatado" não é animal ferido. Cada veto tem casos que acusam e casos que não acusam.

### Pendente para fechar a Etapa 1

- **3 execuções reais** (precisam da chave da Anthropic), com links abrindo, datas em até 36 h e leitura de 5 a 7 minutos.
- **`pnpm tema:testar`** com o modelo real (os casos de tema).
- Você testar. Depois disso, a Etapa 2.
