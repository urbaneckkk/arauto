# ARAUTO — PLAN.md

**Status:** aprovado por André em 04/11/2026 (respostas Q1–Q7: recomendações adotadas). Etapas 0 e 1 entregues e publicadas. André aprovou a Etapa 1 em 05/11/2026 e a **Etapa 2 foi aberta pelo servidor** (fatia A, abaixo); as 3 execuções reais da Etapa 1 continuam pendentes da chave dele.
**Data:** 04/11/2026 · **Etapa:** 0 (fundação) · **Fonte de requisitos:** [docs/briefing.md](docs/briefing.md) (cópia fiel do seu briefing)

Legenda das verificações: ✅ testei hoje na rede ou li na documentação oficial · ⚠️ não consegui confirmar, fica como tarefa da etapa indicada.

---

## 0. Leia isto primeiro

### 0.1 O que no briefing precisa mudar (você pediu aviso)

| # | O briefing assume | O que verifiquei hoje | Proposta |
|---|---|---|---|
| 1 | Reuters e AP entram na coleta por RSS | ✅ Reuters não tem feed público (`reutersagency.com/feed` → 404, `feeds.reuters.com` não resolve, `reuters.com` → 401). AP: `apnews.com` e o `.rss` → 403. | Reuters e AP só entram pela **busca web** do passo 3 e indiretamente pelo GDELT. Saem da coleta RSS. |
| 2 | Valor e Estadão têm RSS | ✅ `valor.globo.com/rss/` → 404, mas `pox.globo.com/rss/valor` → 200 (100 itens). Estadão: `/rss/ultimas.xml` → 404, mas `/arc/outboundfeeds/feeds/rss/sections/brasil/?outputType=xml` → 200 (20 itens). | Usar essas URLs. A lista de feeds fica num arquivo versionado, com teste de saúde diário (você já pediu "teste se cada feed está ativo"). |
| 3 | GDELT dá o volume global | ✅ Duas chamadas de teste: uma devolveu `{}` depois de 18 s; a outra levou 429 ("one every 5 seconds") mesmo respeitando o intervalo. | GDELT vira **sinal opcional com degradação**: se falhar, a pontuação sai só do RSS e o briefing marca `pontuacaoParcial`. A Etapa 1 começa com um spike de um dia medindo latência, falhas e qualidade. |
| 4 | INMET tem "feed CAP/RSS" | ✅ O feed CAP oficial (`alert-as.inmet.gov.br`) só devolve 302 sem conteúdo. Funciona a API que o próprio site do INMET usa: `apiprevmet3.inmet.gov.br/avisos/ativos` (JSON, ~785 KB) e `/avisos/rss`. O JSON traz `geocodes` (inclui **4106902 = Curitiba**) e `severidade`. | Usar o JSON como principal e o RSS como reserva. "Laranja ou vermelho" = severidade `Perigo` ou `Grande Perigo`. A API não é documentada, então tem teste de saúde. **Hoje já existe um aviso laranja de tempestade cobrindo Curitiba**, ótimo caso real para testar o Plantão. |
| 5 | Android: ".apk instala tocando" | ✅ A verificação de desenvolvedor do Google **já vale no Brasil desde 30/09/2026**. A conta de *distribuição limitada* existe: até **20 dispositivos**, sem documento e sem taxa. Mas o usuário final "aceita um convite" do desenvolvedor, então o fluxo não é só tocar no .apk. Exige registrar o nome do pacote com um APK assinado pela sua chave. | A Etapa 4 começa por um **spike de registro e instalação no seu Android real**, antes de qualquer funcionalidade. A chave de assinatura nunca pode mudar depois do registro. |
| 6 | Windows: "instala em 2 cliques" | ✅ Sem certificado com reputação, o SmartScreen avisa na primeira instalação. O Azure Artifact Signing para pessoa física só cobre EUA e Canadá; no Brasil seria um certificado OV (cerca de US$ 150–500 por ano) e mesmo assim o aviso só some com o tempo. | Aceitar o aviso do SmartScreen na 1ª instalação (app de uso pessoal) e documentar o passo "Mais informações → Executar assim mesmo". ⚠️ Vou validar na Etapa 3 se as atualizações automáticas, que não passam pelo navegador, evitam o aviso. Critério de aceite ajustado: "instala em um Windows limpo, sem erro, em até 4 cliques". |
| 7 | Instaladores em GitHub Releases, com atualização automática | ✅ O updater do Tauri e o download do .apk no celular não autenticam em Releases de repositório **privado**. | Recomendo **repositório público** (segredos só no Railway e nos GitHub Secrets, nunca no código). Alternativa: repositório privado + um segundo repositório público só para releases. |
| 8 | `MAX_USD_MES=25` com "Atualizar agora" 3×/dia | Custo estimado por execução completa: US$ 0,35–0,90 (seção 3). 30 briefings diários já consomem ~US$ 15. Três atualizações completas por dia somariam mais ~US$ 45 e estourariam a trava na metade do mês. | "Atualizar agora" **incremental** (reaproveita o que não mudou) e orçamento do briefing das 06:30 **reservado** (seção 2.6). |
| 9 | ~1.300 palavras **e** 2–4 notícias por tema | Não fecha. Brasil tem 5 subtemas, mais Paraná, Mundo e Curiosidade: o mínimo de 2 por tema já passa de 1.300 palavras. | **Teto global de 14 notícias** (~70 palavras cada) e temas sem novidade omitidos. Tempo de leitura medido com 220 palavras por minuto. |
| 10 | Regras de segurança "aplicadas por código" | "O fato central é a perda de vidas" não é decidível por código puro. | O modelo preenche uma **ficha de sinais fechada** (sim/não e números) e o código decide o tema a partir dela, com um veto lexical independente (seção 2.5). O modelo continua sem gerar cor, código ou animação. |
| 11 | (menor) Tema "Plantão" no design e "plantão" na política de avisos | Mesmo nome para duas coisas. | Sugiro renomear o tema de saúde para "Pulso". O id no código continua `saude`. |

**Confirmado e correto no briefing:** os modelos Claude Haiku 5.5 e Sonnet 5.5 existem; busca web a US$ 10 por 1.000 buscas; Open-Meteo é gratuito para uso pessoal; Web Push no iPhone exige o app instalado na Tela de Início.

### 0.2 Decisões que preciso de você

Se você responder só "ok", sigo com a recomendação marcada em cada linha.

| # | Pergunta | Recomendação |
|---|---|---|
| Q1 | Server em **TypeScript** ou **ASP.NET Core**? | TypeScript (D1). |
| Q2 | Repositório **público** ou privado? | Público (item 7 da tabela acima). |
| Q3 | O que é "muitas vítimas" para o tema `luto`? | Massacre ou atentado com qualquer número de mortos confirmados, ou desastre com **5 ou mais** mortos confirmados. Ajustável em um arquivo de configuração. |
| Q4 | O que é "salto forte" na pontuação, para o Plantão? | Pontuação ≥ 0,85 **e** alta de ≥ 0,25 em 3 horas, em história ainda não avisada. Começo só com o INMET na Etapa 1 e ligo o salto na Etapa 2, depois de ver dados reais. |
| Q5 | "Atualizar agora" incremental (seção 2.6)? | Sim. |
| Q6 | Se o briefing do dia falhar, o aviso das 06:30 vira "briefing atrasou, mostrando o de ontem"? | Sim, e conta como o aviso do dia. |
| Q7 | Como chega o pacote do Claude Design? | Exportar para `themes/` antes da Etapa 2 (só a Etapa 2 depende disso). |
| Q8 | Seção "Games" (você joga e transmite)? | Fora do MVP. Decido com você na Etapa 1, depois de ver o volume de notícias. |

**Decisão em 04/11/2026:** André aprovou o plano e delegou as respostas. Foram adotadas as recomendações de Q1 a Q7, e Q8 ficou para a Etapa 1. Ele também disse que aceita investir um pouco se o custo-benefício em tokens por uso compensar, quer travas para que ninguém gaste a API só recarregando a página e aceita fonte gratuita que atenda. Isso virou a seção 2.8 (travas contra gasto) e a seção 3.3 (fontes de notícia e perfis de custo).

---

## 1. Decisões de arquitetura

| # | Decisão | Por quê | Alternativa descartada |
|---|---|---|---|
| D1 | **Server em TypeScript** (Node 24, Fastify) | Um único esquema Zod valida pipeline, API e interface e ainda gera o JSON Schema da saída estruturada do modelo. Mesma linguagem no server, na web e nas cascas Tauri/Capacitor. SDK oficial da Anthropic em TS. | **ASP.NET Core.** É o seu terreno firme e entregaria mais rápido no começo. Perde porque o contrato ficaria duplicado (C# no server, TS no cliente) e exigiria geração de código via OpenAPI. Se você preferir C#, a mudança é viável: só o `server` e o `core` mudam. |
| D2 | **Monorepo pnpm**: `core`, `server`, `web`, `desktop`, `mobile`, `themes`, mais `prompts/`, `fixtures/`, `docs/` | Como no briefing. `desktop` e `mobile` ficam como casca vazia até as Etapas 3 e 4. | Repositórios separados: contrato e temas teriam de ser publicados como pacotes. |
| D3 | TypeScript **estrito** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESM, Vitest, Biome (lint e formatação) | Um conjunto pequeno de ferramentas. Vitest funciona igual no Node e no Vite. | ESLint + Prettier: duas ferramentas e mais configuração. |
| D4 | **Postgres com SQL puro versionado** (`postgres.js`), sem ORM. Zod valida o que entra e sai. | Você domina SQL. Os passos do pipeline gravam `jsonb` para depuração. | Drizzle ou Prisma: abstração a mais para um esquema pequeno. Revisável na Etapa 1. |
| D5 | **Agendador próprio com laço de reconciliação** dentro do serviço: a cada minuto pergunta "o que já deveria existir hoje e não existe?" e executa. Chave única `(data, tipo)` no Postgres mais `pg_advisory_lock`. Vigia às 06:20 e às 06:40. | O Railway reinicia e faz deploy; um cron que "dispara às 06:00" se perde se o processo estiver reiniciando. O laço se recupera sozinho e nunca roda em dobro. | `pg-boss`, um agendador pronto para Postgres: bom, mas é mais uma dependência e esquema. Reavaliar se surgirem mais tipos de tarefa. |
| D6 | **Autenticação por token de pareamento** por dispositivo. Um comando no server gera um código de uso único; o aparelho troca o código por um token longo (256 bits, guardado como hash, revogável). | Passkey dentro do WebView do Tauri e do Capacitor exige ID de domínio e arquivos de associação por plataforma: muito atrito para um usuário só. O mesmo mecanismo serve a PWA, Windows e Android. | Passkey: pode entrar depois, só na web, como reforço opcional. |
| D7 | **A web empacotada dentro das cascas** (Tauri e Capacitor carregam o build local e falam com a API por URL absoluta e token). CORS liberado só para as origens das cascas. | Funciona offline e sem tela branca. | Casca abrir a URL do Railway: sempre atualizada, mas quebra sem internet. |
| D8 | **Notificação**: Web Push (VAPID, biblioteca `web-push`) na PWA e no iPhone; FCM no Android; consulta a cada 15 min no Windows. O servidor aplica a política de avisos (contador por dia, silêncio); as cascas aplicam só o que é local (jogo e transmissão). | Uma só fonte de verdade para "no máximo 1 + 2 por dia". | Cada cliente decidir sozinho: política inconsistente. |
| D9 | **Temas estáticos e confiáveis** carregados em `iframe sandbox` (sem mesma origem); tokens CSS aplicados na página. `prefers-reduced-motion` desliga o ambiente. | O modelo nunca produz código; o iframe isola o CSS e o JS dos temas. | Injetar HTML do tema na página: risco de vazamento de estilos. |
| D10 | **Fontes locais** (Sofia Sans Extra Condensed, Sofia Sans e Spectral, do design escolhido) servidas pelo próprio app. ⚠️ Confirmar licença (esperada: SIL OFL) na Etapa 2. | Funciona offline e sem pedir nada a terceiros. | CDN do Google Fonts. |
| D11 | **Não gravar texto integral de matéria.** O texto lido pela busca e pela leitura de páginas fica só em memória. O banco guarda título, URL, data e o texto próprio do briefing; os logs dos passos guardam notas próprias do modelo (sem trechos copiados), com validade de 14 dias. Um verificador simples barra sequências de 8 ou mais palavras iguais às do material coletado. | Respeita direitos autorais e o que você escreveu em "guarde". | Guardar páginas inteiras "para depurar": risco jurídico sem necessidade. |
| D12 | **CI**: GitHub Actions em Ubuntu com `typecheck`, `lint` e `test`. Workflows de release (Windows e Android) só nas Etapas 3 e 4. | Como no briefing. Nada de cron do GitHub. | — |

---

## 2. Pipeline: o que o briefing deixou em aberto

### 2.1 Modelos (✅ documentação atual)
- **Haiku 5.5** (`claude-haiku-5-5`): US$ 0,10 / 0,50 por milhão de tokens (entrada/saída, para prompts até 100 mil tokens). Passos 2 e 6.
- **Sonnet 5.5** (`claude-sonnet-5-5`): US$ 2 / 10 por milhão. Passos 3 e 4.
- Busca web: US$ 10 por 1.000 buscas, mais os tokens. Usar `web_search_20260209` (com filtragem dinâmica) e `web_fetch_20260209`, com `max_uses: 8` e `allowed_domains`. Esse parâmetro não pode ser combinado com `blocked_domains`.
- **Diferenças dos modelos novos que mudam o código**: `temperature` e similares não podem ser alterados (dão erro 400); `tool_choice` forçado dá 400, então a saída JSON vem de **saída estruturada** (`output_config.format`) e não de ferramenta forçada; o raciocínio vem ligado por padrão e conta como tokens de saída, então defino `effort` explicitamente por passo e meço.
- **Recusas por classificador de segurança**: o Sonnet 5.5 pode terminar com `stop_reason: "refusal"` em assuntos sensíveis (armas nucleares, ataques cibernéticos, armas biológicas), justamente o tipo de notícia que o Arauto trata. **Decisão da Etapa 1:** `refusal` é tratado como falha do passo (até 3 tentativas), nunca como texto, e a chamada recusada entra no custo. O `fallbacks: "default"` do servidor (recomendado pela documentação) fica **desligado por enquanto**: exige a API beta e eu não conseguia testá-lo sem a sua chave. Liga-se depois da primeira execução real, se houver recusa. O Haiku 5.5 não tem esse fallback: recusa vira tema `neutro` por código.

### 2.2 Coleta (passo 1) e verificação de saúde
Feeds em `packages/server/config/feeds.json`, com `ultimoStatus`, `ultimoItem` e `falhasSeguidas`. Resultado do teste de hoje:

| Fonte | Resultado em 04/11 |
|---|---|
| Agência Brasil | ✅ 200, 10 itens |
| G1 (home, política, Paraná) | ✅ 200, 100 itens cada (o de Paraná tem 491 KB) |
| Folha (topo, mercado) | ✅ 200, 100 itens |
| Estadão | ✅ só o feed por seção; `/rss/ultimas.xml` → 404 |
| Valor | ✅ só via `pox.globo.com/rss/valor` |
| BBC (mundo, português) | ✅ 200 |
| Reuters, AP | ❌ sem feed público (item 1 da seção 0.1) |
| Paraná: Gazeta do Povo, Banda B, Plural, Bem Paraná, Tribuna, CBN Curitiba | ✅ 200 |
| Agência Estadual de Notícias (AEN) | ❌ a home anuncia `/rss.xml`, que dá 404; entra só pela busca web |
| Defesa Civil PR | ⚠️ site abre (200), sem feed; só pela busca web |
| Simepar | ⚠️ 403 para scripts; só pela busca web (e pode falhar também lá) |
| Open-Meteo | ✅ 200. Gratuito, 10 mil chamadas por dia, uso não comercial, exige atribuição CC-BY 4.0. Uso previsto: poucas chamadas por dia. |

### 2.3 Termômetro do mundo (passo 2)
- Haiku agrupa manchetes por acontecimento e marca `continuaDe` quando o assunto aparece na lista de ontem (isso alimenta o selo "Continua de ontem").
- Para ter "países distintos" e volume, o RSS da lista branca não basta (é quase só Brasil e Reino Unido). Por isso o GDELT entra para os **8 acontecimentos mais fortes** (chamadas em série, 1 a cada 6 s, uma de lista de artigos e uma de volume). Estimativa: de 2 a 4 minutos, dentro da janela das 06:00 às 06:30.
- Pontuação inicial: 0,35 veículos + 0,25 países + 0,15 recência + 0,25 volume, cada termo normalizado de 0 a 1. Sem GDELT, os pesos de países e volume vão para veículos e recência e o resultado fica marcado como parcial. **Pesos provisórios**: calibrar com dados reais na Etapa 1.

### 2.4 Verificação (passo 5): o que "responde 200" não resolve
Reuters, AP e Simepar bloqueiam scripts (401/403), então uma checagem de HTTP descartaria todos os links deles. Regra em duas camadas:
1. **Proveniência (obrigatória)**: toda URL do briefing precisa ter aparecido no material que o código coletou (feeds ou resultados da busca web). URL que só existe na cabeça do modelo é descartada. Isso barra link inventado.
2. **Alcançabilidade**: GET com User-Agent de navegador; 2xx/3xx passa. Para domínios que bloqueiam script (lista configurável), 401/403/429 conta como "inconclusivo" e passa **se** a proveniência estiver provada. Qualquer outro erro descarta.
Data: dentro de 36 horas da publicação, vinda do feed ou do metadado do resultado da busca. Remover parâmetros `utm_*` antes de gravar a URL.

### 2.5 Tema (passo 6) e regras de segurança
O modelo devolve `id`, `intensidade`, `confianca`, `motivo`, texto do aviso **e uma ficha de sinais**: `perdaDeVidas`, `vitimasConfirmadas` (número ou nulo), `escaladaMilitar`, `armaOuInstalacaoNuclear`, `animalEmSofrimento`. O código então:
1. Id fora do catálogo ou `confianca` < 0,7 → `neutro`.
2. Prioridade: **luto** (perda de vidas, pelo limite da Q3) > **nuclear** (sinal nuclear concreto) > **conflito** (escalada sem nuclear) > escolha do modelo.
3. `animalEmSofrimento` → `ternura_animal` proibido (cai em `neutro`).
4. Vetos lexicais independentes do modelo, sobre as manchetes do acontecimento do dia:
   - **luto**: termo de morte (PT/EN: mortos, vítimas, killed, death toll…) perto de um número ≥ 5 ou de "dezenas/centenas", ou massacre/atentado/chacina junto de termo de morte.
   - **nuclear**: arma, teste, ataque ou acidente nuclear **concretos** ("míssil nuclear", "teste nuclear", "ataque a usina nuclear"). "Acordo nuclear", "energia nuclear" e "usina retoma obras" não contam.
   - **animal em sofrimento**: animal (cão, gato, filhote…) junto de ferido, maltratado, abandonado, atropelado ou morto. Impede `ternura_animal`.
5. `luto`: sem som e sem animação além de fade, aplicado no motor de temas e não no tema.
6. O limite de caracteres do aviso (40/110) é validado por Zod; falhou, uma nova tentativa; falhou de novo, texto-padrão do tema.

**Testes**: camada de regras com 100% de cobertura por construção (fichas sintéticas) mais os 8 casos fictícios do briefing e extras (acidente nuclear com mortos → luto; guerra sem mortos → conflito; usina nuclear em pauta de energia, que depende da sua resposta sobre o que conta como "instalação nuclear"). A camada do modelo roda com respostas gravadas e, em modo real, 10 repetições por caso (custo de centavos). O "100% em luto, nuclear e animal ferido" é medido **depois** da camada de código.

### 2.6 "Atualizar agora" e orçamento
- Limites do briefing mantidos: 3 por dia, 30 minutos de intervalo.
- **Incremental**: refaz a coleta (grátis), compara com o briefing atual; se a história do dia e as notícias não mudaram, devolve "nada novo". Só chama o modelo para o que é novo ou mudou de pontuação, reaproveitando as apurações em cache (por impressão digital do acontecimento).
- **Trava mensal com reserva**: antes de cada atualização, o servidor calcula `reserva = dias restantes × custo médio dos briefings diários`; atualização que invadiria a reserva é recusada com mensagem clara. O briefing das 06:30 nunca fica sem verba por culpa de atualizações.
- Trava por execução (`MAX_USD_POR_EXECUCAO=1`) verificada **antes e depois** de cada chamada ao modelo. Ao atingir qualquer trava: parar, gravar `abortado_por_custo`, mostrar o briefing de ontem com aviso e enviar um aviso de sistema (fora da cota de avisos editoriais, respeitando o silêncio).
- Tabela de preços **no código, com data**, para o custo gravado ser reproduzível; conferida contra o console da Anthropic. Recomendo também um limite mensal de gasto no próprio console da Anthropic como segunda trava.

### 2.7 Demais pontos
- **Falhas**: 2 novas tentativas por passo, tempo-limite global às 06:25; passou disso, mostra o de ontem com aviso claro. Nunca preenche lacuna com texto inventado.
- **Fuso**: `America/Sao_Paulo` por identificador IANA, nunca deslocamento fixo. A `data` do contrato é a data em São Paulo.
- **Execução repetida**: `pipeline_runs` com chave `(data, tipo)`, passos gravados com entrada resumida, saída, tokens e custo.
- **Teste sem gastar API**: `pnpm brief:gerar --gravar <nome>` grava a internet e as respostas do modelo em `gravacoes/<nome>`; `--replay <nome>` reproduz uma execução inteira de graça. As gravações ficam **fora do Git** (têm texto de veículos, direitos autorais); o que vai ao repositório são dados sintéticos.

### 2.8 Defesa de custo: quem abre ou recarrega a página não gasta nada

Princípio: **só dois caminhos chamam o modelo, o agendador e o "Atualizar agora".** Todo o resto lê do banco.

1. **Leitura é grátis.** As rotas de leitura (`GET /briefing/...`) entregam o JSON já gravado, com `ETag` e cache. Nenhuma delas chama modelo, busca web ou GDELT. Recarregar mil vezes custa só banda.
2. **Visitante sem token recebe 401** e não alcança nada pago. O pareamento usa código de uso único que expira em 10 minutos, com no máximo 5 tentativas.
3. **"Atualizar agora" tem limite global**, contado no Postgres (e não em memória, que some quando o serviço reinicia): 3 por dia e 30 minutos entre elas, somando todos os aparelhos. Cinco aparelhos não dão 15 atualizações.
4. **Uma execução paga por vez**, com trava no banco. Pedido feito durante uma execução devolve a mesma execução em andamento, sem iniciar outra: vários cliques viram um.
5. **Atualização incremental**: sem novidade, o custo em modelo é zero (seção 2.6).
6. **Limite de taxa HTTP** por IP e por token nas rotas de escrita, com resposta 429 e tempo de espera.
7. **Interruptor geral**: `GASTOS_PAUSADOS=1` (ou um comando no servidor). Ao bater `MAX_USD_MES`, o serviço entra sozinho em modo leitura e mostra o último briefing.
8. **Trava fora do nosso código**: limite mensal de gasto no console da Anthropic, que você configura. Recomendo US$ 30 se o teto do Arauto for US$ 25. Ela protege mesmo se houver bug nosso.
9. **Avisos de gasto** a 50%, 80% e 100% do teto, como aviso de sistema.
10. **Testes de abuso**: na Etapa 1, testes automáticos do livro-caixa de custos e das travas de orçamento. Na Etapa 2, testes das rotas: 100 pedidos de "atualizar" e 1.000 leituras não podem passar do limite de custo nem de contagem.

### 2.9 Segurança: repositório público e servidor

**Repositório (feito antes da primeira publicação, 04/11/2026):**
- Segredos vivem só no Railway e nos GitHub Secrets. `.env` e variantes, chaves, certificados e credenciais do Firebase estão no `.gitignore`; só `.env.example` (sem valores) é versionado.
- `pnpm segredos` (script `scripts/verificar-segredos.mjs`, com testes) falha o build se aparecer arquivo proibido ou texto com cara de segredo, e nunca imprime o valor achado. Roda no `pnpm verificar` e no CI.
- No GitHub: *secret scanning* e *push protection* ligados **antes** do primeiro envio, regra contra apagar o `main` ou reescrever o histórico, Actions com permissão só de leitura e aprovação manual para PR de fora, Dependabot com espera de 7 dias.
- No CI, as ações ficam fixadas por hash de commit e o `checkout` não guarda credenciais.
- O autor dos commits usa o e-mail *noreply* do GitHub: e-mail de commit publicado não se apaga depois.
- Dados pessoais fora: a cópia pública do briefing não traz a seção "Meu contexto" (rotina).
- Sem arquivo de licença por enquanto, o que na prática significa "todos os direitos reservados". Decidir depois, se quiser abrir.
- **Se um segredo vazar:** apagar o arquivo não basta, porque ele continua no histórico. Revogar e gerar outro primeiro; limpar o histórico depois.

**Servidor (Etapa 2, cada item com teste automático):**
- **Arquivos pela URL:** o servidor serve estático só de `packages/web/dist`, com `dotfiles` negados e sem listagem de diretório. Teste: `/.env`, `/.git/config`, `/package.json`, `/../`, `/%2e%2e/`, `/packages/server/...` e `/pnpm-lock.yaml` devolvem 404. Sem *source maps* em produção.
- **Nada secreto no bundle do cliente:** só variáveis públicas (`VITE_*`) chegam ao navegador. A chave da Anthropic, a chave privada VAPID e a conta de serviço do Firebase só existem no servidor. Teste: o verificador de segredos também varre o `dist` do web.
- **Cabeçalhos e origem:** `@fastify/helmet` (CSP, HSTS, `nosniff`, `Referrer-Policy`) e CORS limitado às origens conhecidas (a PWA, `tauri.localhost` e `capacitor://localhost`).
- **Entrada e saída:** toda rota valida entrada com Zod, com limite de tamanho do corpo. Erros não devolvem *stack trace*. Os logs escondem `Authorization` e tokens.
- **Banco:** consultas sempre parametrizadas (nunca texto concatenado); o Postgres no Railway fica na rede privada, sem IP público.
- **Tokens de dispositivo:** guardados só como hash, comparados em tempo constante, revogáveis e sem validade eterna silenciosa. O pareamento é gerado por comando no servidor, não por rota aberta.
- **Dependências:** lockfile congelado no CI, idade mínima de versão do pnpm e `pnpm audit` no CI a partir da Etapa 1.

---

## 3. Custos

### 3.1 Anthropic (estimativa; **medir na Etapa 1**)

| Passo | Cálculo aproximado | Por execução |
|---|---|---|
| 2 Termômetro (Haiku 5.5) | ~10 mil tokens de entrada + ~5 mil de saída | US$ 0,004 |
| 3 Apuração (Sonnet 5.5, até 8 buscas) | contexto de 20–40 mil tokens repetido a cada busca + 8 × US$ 0,01 de busca | US$ 0,25 – 0,70 |
| 4 Redação (Sonnet 5.5) | ~22 mil de entrada + ~8 mil de saída (com raciocínio) | US$ 0,10 – 0,15 |
| 6 Tema (Haiku 5.5) | pouquíssimos tokens | < US$ 0,01 |
| **Total** | | **US$ 0,35 – 0,90** (central ≈ 0,50) |

Mensal: 30 briefings diários ≈ **US$ 15** no cenário central. Sobra ≈ US$ 10 para atualizações, ou cerca de 20 execuções completas ou muitas incrementais. O exemplo do seu contrato (`usd: 0.41`) cai dentro da faixa.

### 3.2 Infraestrutura

| Item | Custo | Observação |
|---|---|---|
| Railway (Hobby) | US$ 5/mês, inclui US$ 5 de uso | ✅ doc oficial. Servidor Node + Postgres 24 h costumam consumir US$ 3–10 de uso; contas relatadas na comunidade passaram de US$ 20 por causa de memória. Acompanhar no 1º mês. |
| Firebase (FCM) | grátis | Só na Etapa 4. |
| GitHub Actions | grátis em repositório público | Em privado, 2.000 min/mês no plano gratuito, com Windows contando em dobro. |
| Android Developer Console (distribuição limitada) | sem taxa | Até 20 dispositivos. |
| Certificado de assinatura Windows | **não vou comprar** | Aceito o aviso do SmartScreen. |
| Apple Developer | US$ 99/ano, **fora do MVP** | Só se você quiser o app nativo via TestFlight. |
| Domínio próprio | opcional | O Railway já entrega HTTPS em `*.up.railway.app`, que o Web Push exige. |

**Teto mensal total esperado:** US$ 25 (Anthropic, travado) + US$ 5–10 (Railway) ≈ **US$ 30–35**. Não converti para reais.

### 3.3 Fonte de notícias: API paga, gratuita ou o que já temos

**Onde o dinheiro vai de verdade:** a busca web custa só US$ 0,01 por busca (US$ 0,08 por execução com 8 buscas). O que pesa são os **tokens**: a cada busca o Sonnet relê o contexto acumulado (US$ 0,25 a 0,70 por execução). Reduzir custo, então, significa dar ao modelo menos texto, não trocar de API de busca.

| Opção | Custo | Veredito |
|---|---|---|
| **RSS da lista branca + GDELT + INMET + Open-Meteo** | grátis | **Base de tudo.** Já testados: entregam fonte, URL, data e resumo curto. O modelo recebe esse material pronto, sem precisar buscar. |
| Busca web da Anthropic (a do briefing) | US$ 0,01 por busca, mais tokens | Mantida, mas **só para o que o RSS não cobre**: confirmar a história do dia, checar alertas locais (Simepar e Defesa Civil) e temas vazios. |
| NewsAPI.org, plano grátis | 100 requisições por dia, atraso de 24 h, **proibido em produção** (✅ página de preços; o plano pago custa US$ 449 por mês) | Descartada. |
| GNews, NewsData.io, TheNewsAPI, Currents, planos grátis | 100 a 600 requisições por dia, atraso de 12 h em vários, termos de uso comercial contraditórios entre fontes, cobertura em português não confirmada (⚠️ só fontes secundárias) | Descartadas por ora: o atraso é ruim para briefing e para Plantão, e o RSS já cobre as fontes que você quer. |
| API de busca com crédito mensal grátis (Brave: cerca de US$ 5 por mês, ou ~1.000 consultas; Tavily e Exa: créditos que divergem entre fontes) | grátis até o crédito | **Candidata a substituir** a busca da Anthropic e cortar tokens. Entra no teste A/B da Etapa 1. ⚠️ Os preços divergem entre fontes secundárias; confiro na página oficial antes. |

**Perfis de custo, a escolher com número na mão depois da Etapa 1:**

| Perfil | O que faz | Custo por execução (estimativa) |
|---|---|---|
| Econômico | Primeiro o RSS, até 3 buscas, Sonnet com esforço baixo | US$ 0,15 – 0,30 |
| Padrão | Primeiro o RSS, até 8 buscas | US$ 0,35 – 0,90 |

A Etapa 1 roda os dois nas mesmas manchetes e você compara a qualidade dos briefings. Se o Econômico entregar quase o mesmo por metade do preço, ele vira o padrão. Se quiser investir mais, com o teto de US$ 25 cada US$ 5 a mais compra cerca de 10 execuções completas; só subo o teto depois de ver que a qualidade melhora.

Sobre "notícias legais": o que decide isso é o prompt editorial e a curadoria por pontuação, não a API. A Etapa 1 inclui você avaliar os 3 briefings reais.

---

## 4. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Feeds quebram ou mudam (já aconteceu com 5 URLs) | Alta | Médio | Lista versionada, teste de saúde diário, alerta quando um feed passa de 3 falhas seguidas, nenhum feed é indispensável. |
| R2 | GDELT lento ou fora | **Certa** (spike de 04/11: 12–16 s por chamada, 2 de 3 deram 429 mesmo com mais de 18 s entre elas, a que respondeu trouxe 2 artigos) | Médio | Sinal opcional com disjuntor (desiste após 2 falhas seguidas). A pontuação parcial, só com o RSS, é o caminho normal. |
| R3 | Custo acima do previsto | Média | Alto | Travas por execução e por mês, reserva do briefing diário, atualização incremental, medição na Etapa 1. |
| R4 | Recusa do classificador em notícia sensível | Média | Médio | `fallbacks: "default"` no Sonnet; recusa tratada como falha; Haiku cai em `neutro`. |
| R5 | Link inventado ou não verificável | Média | Alto | Proveniência obrigatória mais checagem HTTP (seção 2.4). |
| R6 | Tema inadequado em tragédia | Baixa | **Muito alto** | Ficha de sinais, prioridade por código, veto lexical, casos de teste repetidos, `luto` sem som e sem animação. |
| R7 | Verificação de desenvolvedor Android bloqueia o APK | Alta (regra já vigente) | Alto | Spike de registro na Etapa 4; chave de assinatura guardada fora do repositório, com cópia de segurança. |
| R8 | SmartScreen e releases privadas atrapalham o Windows | Alta | Médio | Repositório público, aviso documentado, validar atualização automática. |
| R9 | Web Push no iPhone: só app instalado, permissão só após um toque, notificação sem imagem, cada push precisa mostrar algo | Certa | Médio | Tutorial de instalação na Etapa 5; **Declarative Web Push** (iOS 18.4 ou superior, ✅ WebKit) com reserva pelo Push padrão. ⚠️ Preciso saber a versão exata do iOS do seu XR. |
| R10 | **Modo Ouvir**: a voz do sistema (`speechSynthesis`) costuma parar quando a tela apaga, e o uso principal previsto é ouvir no trajeto, com o celular guardado | Alta ⚠️ (comportamento conhecido, não testei hoje) | Alto | Validar em aparelho real na Etapa 2. Opções se falhar: voz nativa no Android (Etapa 4) e, no iPhone, áudio gerado no servidor (custo estimado de centavos por dia, a confirmar). |
| R11 | Deploy ou reinício no Railway perto das 06:00 | Média | Médio | Agendador por reconciliação (D5), vigias às 06:20 e 06:40. |
| R12 | API do INMET (`apiprevmet3`) não documentada muda ou cai | Média | Médio | RSS como reserva; teste de saúde. Alerta vermelho é o único que fura o silêncio, então falha silenciosa aqui pesa. |
| R13 | Briefing longo demais ou curto demais | Média | Baixo | Teto global de notícias, contagem de palavras em código, nova tentativa de redação. |
| R14 | Direitos autorais e termos das fontes | Baixa | Médio | Só RSS (uso previsto pelas fontes), nada de texto integral, verificador de trechos copiados. |
| R15 | Ferramentas faltando na sua máquina | Certa | Baixo | Ver seção 6. |

---

## 5. Etapa 0: o que farei depois do seu ok

**Entregas:**
1. `git init` local (sem commit até você pedir), `.gitignore`, `.editorconfig`, `.nvmrc` (Node 24), `packageManager` com pnpm.
2. `pnpm-workspace.yaml` e os pacotes `core`, `server`, `web`, `desktop`, `mobile`, `themes`. `desktop` e `mobile` só com `package.json` e README, sem instalar Tauri nem Capacitor.
3. `tsconfig.base.json` estrito e Biome configurado.
4. **`core`**, com Zod e testes: contrato do briefing; catálogo fechado dos 15 temas; intensidade 1–3; `notificacao` (≤ 40 e ≤ 110 caracteres); `Noticia`, `Fonte`, `Tempo` e `Alerta`; `meta.json` de tema; `Custo`; resultado de passo do pipeline. Exporta também o JSON Schema usado na saída estruturada. Testes com exemplos válidos e inválidos, incluindo "tema desconhecido → neutro".
5. `.github/workflows/ci.yml`: instalação com lockfile congelado, `typecheck`, `lint`, `test`.
6. [docs/aprendizado.md](docs/aprendizado.md) com a entrada da Etapa 0 (o que foi feito, por que, o que foi descartado).

**Aceite (do briefing):** testes verdes e plano aprovado por você.
**Observação:** o CI só roda depois do primeiro push, e o repositório no GitHub precisa existir. Rodo o mesmo conjunto de comandos localmente para garantir o verde. Preciso que você crie o repositório (ou me autorize a criá-lo) quando chegarmos lá.

**Fora da Etapa 0:** regras de tema (Etapa 1), qualquer chamada de API paga, Postgres.

**Resultado (04/11/2026):** entregas 1 a 6 feitas e publicadas em <https://github.com/urbaneckkk/arauto>. `pnpm verificar` passa na máquina local e **o CI passou no GitHub** (23 s): verificador de segredos, build, typecheck, lint e **65 testes** no `core`, com instalação por lockfile congelado. Falta só o seu teste. Onde o contrato era vago, o código fixou uma interpretação; a tabela está em [docs/aprendizado.md](docs/aprendizado.md). Ajuste em relação ao plano: o Biome ficou na 2.6.4, não na mais recente, por causa da proteção de idade mínima de versão do pnpm 12.

### Etapa 1 (04/11/2026): cérebro, sem interface

**Construído** (pacote `packages/server`): coleta (38 feeds, previsão, alertas do INMET), termômetro (Haiku agrupa, código pontua), apuração (Sonnet com busca web), redação (Sonnet, saída estruturada), verificação de fontes sem IA, tema (Haiku + regras de segurança em código), publicação, livro-caixa de custos com as três travas, repositórios em memória, em arquivo e em Postgres (com migrações), gravar/replay, e os comandos `brief:gerar`, `brief:ver`, `db:migrar` e `tema:testar`. **175 testes no server e 136 no core**, mais 8 do verificador de segredos; o repositório Postgres foi validado contra um Postgres 17 real.

**O que a coleta real (04/11) mudou em relação ao plano:**

| O quê | Mudança |
|---|---|
| Folha | Todos os 216 links passam por `redir.folha.com.br`. A verificação segue o redirecionamento e a lista branca vale para a URL **final** (que é a publicada). |
| Plural Curitiba | Responde 403 ao nosso robô (que se identifica como ArautoBot). **Removido**: o bloqueio é respeitado. |
| g1 Ciência e saúde | Parado desde 2024. Removido. |
| GDELT | Ver R2. O termômetro consulta só os 5 candidatos e desiste após 2 falhas. |
| Previsão do tempo | `minC`, `maxC` e `chuvaPct` do contrato passaram a aceitar nulo: se o Open-Meteo falhar, o briefing sai sem números (nunca inventados) e os alertas continuam. |
| Números do tempo e alertas | **Nunca passam pelo modelo.** Vêm do Open-Meteo e do INMET direto para o briefing; o redator escreve só o resumo em texto. |
| Fontes | O redator cita por **identificador** do material (`i042`, `w03`), nunca por URL. Link inventado é impossível por construção; a verificação confere o resto (lista branca, 36 h, link abre, texto não copiado). |
| Apuração com falha | Não derruba o briefing: o RSS basta, e o aviso fica registrado. |
| Tema com falha | Publica com o tema neutro, mas os vetos por manchetes continuam valendo (tragédia ainda vira luto). |
| Vetos de nuclear e de animal ferido | Novos (seção 2.5): o critério "100%" não pode depender só da ficha que o modelo preenche. |
| Fallback de recusa | Ver seção 2.1: desligado até a primeira execução real. |

**Aceite da Etapa 1: o que já está provado e o que precisa da sua chave**

| Critério | Estado |
|---|---|
| Pipeline completo, `brief:gerar` e `brief:ver` | ✅ Funcionam. Verificado ponta a ponta em replay. |
| Matérias gravadas para testar sem gastar API | ✅ `--gravar` e `--replay`, com teste de que o replay reproduz o mesmo briefing. |
| Casos fictícios de tema (os 8 do briefing) | ✅ Nas regras (determinístico, inclusive todas as combinações de sinais) e no pipeline. ⏳ Contra o **modelo real**: `pnpm tema:testar`. |
| 100% em luto, nuclear e animal ferido | ✅ Garantido por código, com vetos que não dependem do modelo: um modelo hostil que erra de propósito ainda passa (teste). ⏳ Confirmar com o modelo real. |
| 3 execuções reais, links abrindo, datas em 36 h, leitura de 5 a 7 min, custo registrado | ⏳ **Precisa da chave da Anthropic.** `pnpm brief:ver --links` confere links e datas. |

**Como rodar** (a chave vai só no `.env`, que o Git ignora):

```bash
cp .env.example .env            # e preencha ANTHROPIC_API_KEY
pnpm tema:testar                # ~US$ 0,15: casos de tema contra o modelo real
pnpm brief:gerar --sem-banco --gravar real-1   # execução real (até US$ 1), gravando
pnpm brief:ver --sem-banco
pnpm brief:ver --sem-banco --links
pnpm brief:gerar --sem-banco --replay real-1   # repete de graça
```

**Pontos em aberto da Etapa 1:** pesos da pontuação (provisórios), tamanho real do briefing (meta de 5 a 7 min, só se mede com a execução real), custo real contra a estimativa da seção 3, perfil Econômico contra Padrão (seção 3.3) e se o modelo recusa notícias sensíveis. O `tema:testar` não entra no total do mês do livro-caixa (custa centavos).

### Etapa 2, fatia A (05/11/2026): servidor, acesso e travas de custo, sem interface

A Etapa 2 é grande (servidor, web, temas, Web Push), então entra em fatias. A **fatia A** é só o servidor, porque não depende do pacote do Claude Design (Q7) e é onde moram as travas de custo que André mais pediu.

**Construído** (`packages/server`): API Fastify sob `/api`; pareamento por código de uso único e token por aparelho (guardado só como hash); orquestrador com as travas de "Atualizar agora"; agendador por reconciliação (D5); cabeçalhos de segurança, CORS restrito, limite de taxa e arquivos estáticos blindados; comandos `servidor`, `pareamento:gerar` e `dispositivos`. **349 testes no server** (eram 175; 323 sem Postgres), contra memória, arquivo e um Postgres 16 real.

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/saude` | pública | O banco está de pé? (para o Railway) |
| `POST /api/pareamento` | pública, 5 por 10 min por IP | Troca o código por um token |
| `GET /api/briefing/hoje`, `/api/briefing/:data`, `/api/historico` | token | Só leem do banco, com `ETag` (304 sem corpo) |
| `GET /api/estado` | token | Atualizações usadas, gasto do mês, atraso, modo leitura |
| `POST /api/atualizar` | token, 10 por hora por IP | "Atualizar agora" (202 / 200 já em andamento / 429 / 503) |
| `GET /api/execucoes/:id` | token | Situação de uma execução (para acompanhar depois de recarregar) |
| `GET`/`DELETE /api/dispositivo` | token | Quem sou eu / sair deste aparelho |

**Defesa de custo, como ficou (seção 2.8):**

| Item da 2.8 | Como está feito |
|---|---|
| 1 Leitura é grátis | Rotas de leitura só consultam o banco. Teste: 1.000 leituras, zero chamadas ao modelo, zero execuções, gasto zero. |
| 2 Sem token, 401 | Todas as rotas que mostram dados ou gastam exigem token. Teste: 1.000 pedidos sem token ou com token falso, tudo 401, nada executa. |
| 3 Limite global no banco | 3 por dia e 30 min de intervalo, contados em `execucoes`. Teste: 5 aparelhos fazem 3 atualizações, não 15. |
| 4 Uma execução paga por vez | **Índice único parcial no Postgres** (`execucoes_uma_rodando`). Teste: 100 pedidos simultâneos, uma execução. |
| 5 Atualização incremental | **Não feita nesta fatia** (ver abaixo). |
| 6 Limite de taxa HTTP | `@fastify/rate-limit` por IP, **antes** da autenticação (quem só erra o token também é segurado). |
| 7 Interruptor geral | `GASTOS_PAUSADOS=1` recusa atualização com 503; ao bater `MAX_USD_MES` o serviço entra sozinho em modo leitura (`/api/estado`). |
| 8 Trava fora do código | Depende de André (limite no console da Anthropic). |
| 9 Avisos a 50/80/100% | O nível já sai em `/api/estado`; o **envio** depende do Web Push (fatia B). |
| 10 Testes de abuso | Feitos: 100 atualizações, 1.000 leituras, 1.000 sem token, insistir de 31 em 31 minutos o dia inteiro. Rodam **sem** o limite de taxa, para provar que as travas do banco valem sozinhas. |

**Reserva do mês (seção 2.6), ainda mais firme do que o plano:** `reserva = dias restantes × custo médio dos últimos 7 briefings diários` (US$ 0,50 enquanto não há histórico). O orquestrador recusa cedo, com a conta na mensagem, e o próprio `Orcamento` confere de novo **dentro** da execução, a cada chamada ao modelo. O briefing das 06:00 nunca tem reserva.

**Onde saí do plano, e por quê:**

| Plano | Feito | Por quê |
|---|---|---|
| D5: `pg_advisory_lock` + chave única `(data, tipo)` | Índice único parcial "só uma `rodando`" | O banco recusa a segunda execução no `insert`, sem lock preso a uma conexão. `(data, tipo)` não serve: a diária tem até 2 tentativas e há até 3 atualizações por dia. |
| Rotas `GET /briefing/...` | Prefixo `/api` | Separa a API das rotas da interface (`/lab`, `/instalar`) e do fallback de página. |
| Vigias às 06:20 e 06:40 | Uma pergunta só, a cada minuto | "Atrasou" é um **estado** (`briefingAtrasado`, depois das 06:40 sem briefing), não um evento que pode se perder num reinício. |
| Tentativas do briefing do dia | No máximo 2, 10 min entre elas; parada por custo não repete | Cada tentativa pode custar até US$ 1; sem teto, um erro persistente queimaria o mês. |
| Limite de taxa por IP **e** por token | Só por IP | Chave por token deixaria quem inventa tokens ganhar um balde novo a cada pedido. |
| Execução órfã | Vira falha sozinha depois de 30 min, ao criar a próxima e ao ligar o serviço | Um deploy no meio de uma execução não pode prender a trava de "uma por vez". |

**Pendente (fatia B e seguintes):**
- **"Atualizar agora" incremental** (Q5, seção 2.6). Hoje uma atualização refaz o pipeline inteiro, limitada a 3 por dia, uma por vez e dentro da reserva. O incremental de verdade precisa guardar a impressão digital dos acontecimentos, e é melhor medi-la com dados reais do termômetro. Uma heurística de "poucas notícias novas" foi descartada: com 38 feeds ela quase nunca dispararia.
- Web Push (VAPID), política de avisos (1 + 2 por dia, silêncio), aviso de atraso e de gasto.
- Ajustes do usuário (horário, silêncio, modo sóbrio) no servidor.
- Web/PWA, motor de temas, `/lab`, Stories, Lista, Ouvir, `/instalar` (dependem do pacote do Claude Design, Q7).
- Deploy no Railway e **confirmar quantos proxies há na frente** (`CONFIAR_PROXY_SALTOS`). ⚠️ Não verifiquei: se o valor for maior que o real, o cliente forja o IP e foge do limite por IP (as travas do banco continuam valendo); se for menor, todos dividem o IP do proxy.
- O verificador de segredos varrer o `dist` da web e `pnpm audit` no CI.
- O limite de taxa fica na memória do processo: reiniciar zera o contador (as travas do banco não).

**Como rodar:**

```bash
pnpm servidor --sem-banco --codigo   # sobe a API; imprime um código de pareamento (vale 10 min)
pnpm pareamento:gerar                # com Postgres: gera outro código, de outro terminal
pnpm dispositivos listar             # aparelhos pareados (nunca mostra o token)
pnpm dispositivos revogar <id>
```

---

## 6. Roadmap e o que verifico no início de cada etapa

| Etapa | Foco | ⚠️ Verificar na documentação atual antes de depender |
|---|---|---|
| 1 Cérebro | Pipeline, `brief:gerar`, `brief:ver`, gravações, casos de tema | Limites da saída estruturada com Zod (restrições de tamanho de string); medir custo real; teste A/B dos perfis Econômico e Padrão e de uma API de busca com crédito grátis (seção 3.3); spike do GDELT; testar se a busca web devolve Reuters, AP e Simepar. Precisa de chave da API num `.env` local (você coloca; não cole no chat) e de um Postgres (Docker local, se você tiver, senão o do Railway). |
| 2 Web/PWA | Motor de temas, `/lab`, Stories, Lista, Ouvir, Web Push, offline, `/instalar` | VAPID e `web-push`; plugin PWA do Vite; fontes e licenças; Modo Ouvir com tela apagada em aparelho real (R10). |
| 3 Windows | Tauri 2, bandeja, início com o Windows, Ctrl+Shift+A, overlay, instalador, atualização | Versões atuais dos plugins do Tauri (updater, autostart, global-shortcut); janela transparente que não rouba foco (`WS_EX_NOACTIVATE`); detecção de jogo em tela cheia (`SHQueryUserNotificationState`) e de transmissão (lista de processos como OBS, configurável), testada com jogos reais, em tela cheia exclusiva e sem borda; teste de instalação no Windows Sandbox (recurso do Windows 11 Pro). |
| 4 Android | Capacitor, FCM, canais, APK assinado | Spike de registro na conta de distribuição limitada (R7); versões atuais do Capacitor e do plugin de push; canais de notificação são imutáveis depois de criados (som e importância certos já na primeira versão, e `luto` sem som). |
| 5 iPhone XR | PWA em Safari no iOS 18 | Versão exata do iOS; Declarative Web Push; áreas seguras; teste em aparelho real. |
| 6 Jarvis | Explica melhor, Pergunte ao Arauto, resumo semanal, extensão | Fica para depois da Etapa 5, conforme o briefing. |

**Máquina de desenvolvimento (verificado agora):** ✅ Node v24.11.0, ✅ Git 2.53, ✅ Python 3.12. ✅ Docker 29.6.1 (serve de Postgres local na Etapa 1), ✅ GitHub CLI 2.98. ❌ `pnpm` não estava instalado (instalado na Etapa 0). ❌ Rust não está instalado (precisa na Etapa 3, junto com as Build Tools do Visual Studio C++). Android Studio e JDK na Etapa 4.

---

## 7. Direção visual escolhida: "C · Vigia"

Captura em [docs/design/vigia-direcao-c.png](docs/design/vigia-direcao-c.png). Correspondência entre os nomes do design e o catálogo:

| Nome no design | Id do catálogo | Observação |
|---|---|---|
| Sala de Comando | `neutro` | Texto de exemplo: "Dia sem grande assunto no noticiário" |
| Patinhas | `ternura_animal` | Manchete em caixa mista, peso 700 |
| Sala de Situação | `conflito` | Manchete em CAIXA ALTA, peso 800. O texto continua descritivo; só a tipografia do tema muda. |
| Silêncio | `luto` | Spectral 300, sem animação além de fade |
| Olho da Tempestade | `clima_extremo` | |
| Pregão Verde | `mercado_alta` | Falta o gêmeo `mercado_queda` |
| Órbita | `ciencia_espaco` | |
| Safra | `agro_safra` | |
| Plantão | `saude` | Sugestão: renomear para "Pulso" (seção 0.1, item 11) |

**Sem desenho na captura:** `nuclear`, `mercado_queda`, `tecnologia_ia`, `politica`, `esporte`, `cultura`. Enquanto não existirem, o motor de temas cai em `neutro` (já é critério de aceite da Etapa 2). Os 4 temas da Etapa 2 (`neutro`, `ternura_animal`, `conflito`, `luto`) estão todos desenhados.

---

## 8. O que verifiquei e o que não

**Testado hoje na rede (04/11/2026):** feeds RSS da lista branca; GDELT (2 chamadas); estrutura e cobertura de Curitiba nos alertas do INMET; Open-Meteo; Reuters e AP.
**Lido na documentação oficial:** verificação de desenvolvedor Android (fluxo, datas e limite de 20 dispositivos); limites e licença do Open-Meteo; preços e comportamento dos modelos (tabela do skill da API Claude, com cache de 06/10/2026).
**Lido em fontes secundárias, confirmar antes de depender:** regra de 1 requisição a cada 5 s do GDELT (bate com o 429 que recebi); preço da busca web (US$ 10 por 1.000, consistente em várias páginas da Anthropic, mas não abri a tabela oficial); limitações do updater do Tauri com repositório privado (discussão do projeto); elegibilidade do Azure Artifact Signing.
**Não verificado:** página oficial de preços da Anthropic (conferir no console antes da Etapa 1); comportamento do `speechSynthesis` com tela apagada; detecção de jogos em tela cheia; atualização automática sem SmartScreen; Capacitor, Tauri e FCM em versões atuais (cada um na sua etapa).

## 9. Fontes

- Verificação de desenvolvedor Android: <https://developer.android.com/developer-verification/guides>
- Termos do Open-Meteo: <https://open-meteo.com/en/terms>
- Declarative Web Push (WebKit): <https://webkit.org/blog/16535/meet-declarative-web-push/>
- Preços do Railway: <https://docs.railway.com/reference/pricing>
- Updater do Tauri e repositório privado: <https://github.com/tauri-apps/tauri/discussions/7553>
- Opções de assinatura de código no Windows: <https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options>
- INMET (registro da OMM): <https://alertingauthority.wmo.int/authorities.php?recId=22>
- NewsAPI.org, planos e preços: <https://newsapi.org/pricing>
- Comparativos de APIs de notícias e de busca (fontes secundárias, números divergem; confirmar nas páginas oficiais antes de usar): <https://thunderbit.com/blog/best-news-apis-compared>, <https://costbench.com/software/ai-search-apis/brave-search-api/>, <https://costbench.com/compare/exa-vs-tavily/>
