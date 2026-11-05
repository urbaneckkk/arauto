<!--
Cópia do briefing colado por André em 04/11/2026. É a fonte de requisitos do projeto.
A seção "Meu contexto" foi omitida desta cópia pública, por conter rotina pessoal. O resto é fiel.
Mudanças aprovadas ficam registradas no PLAN.md (seção 0.1), sem reescrever este arquivo.
-->

# ARAUTO: briefing de desenvolvimento

## Missão
Construa o ARAUTO, um "Jarvis da informação" pessoal. Todo dia às 06:30, e a qualquer momento sob demanda, ele entrega ao André um briefing de notícias em português simples. O visual do app muda conforme a notícia mais comentada do mundo.

## Como trabalhar comigo
- Antes de codar, escreva PLAN.md com decisões, riscos e custos, e espere meu ok.
- Trabalhe uma etapa por vez. Só avance quando os critérios de aceite passarem e eu tiver testado.
- Quero aprender construindo. A cada etapa, registre em docs/aprendizado.md o que foi feito, por que essa solução e qual alternativa foi descartada.
- Este briefing é de novembro de 2026. Confirme na documentação atual toda API, limite e preço antes de depender deles, e avise se algo aqui estiver errado.

## Meu contexto
Seção omitida desta cópia pública, por conter rotina pessoal. O que importa para o produto continua nas seções abaixo: as plataformas (Windows, Android e iPhone XR, que para no iOS 18), o horário do briefing (06:30) e a regra de não mostrar overlay sobre jogo em tela cheia nem com software de transmissão aberto.

## Plataformas
| Plataforma | Instalação | Aviso | Animação própria |
|---|---|---|---|
| Web/PWA (Etapa 2) | Link, instalável pelo navegador | Web Push | Dentro do app |
| Windows (Etapa 3) | Instalador .exe | Overlay próprio e notificação do sistema | Total, em janela transparente |
| Android (Etapa 4) | Arquivo .apk | FCM, com imagem do tema | Abertura ao tocar na notificação |
| iPhone XR (Etapa 5) | Safari > Adicionar à Tela de Início | Web Push, em texto | Abertura ao tocar na notificação |

Toda animação vive no código web compartilhado. Cada casca nativa só adiciona o que a web não faz.

## Produto (MVP)
- Briefing diário pronto às 06:30 (America/Sao_Paulo) e botão "Atualizar agora".
- Leitura de cerca de 6 minutos em dois modos: Stories, uma notícia por tela, e Lista.
- Bloco "Em 30 segundos" no topo, com as 3 coisas essenciais do dia.
- Selo "Continua de ontem" em notícias que seguem um assunto já publicado, com uma linha sobre o que mudou.
- Modo Ouvir, para ouvir o briefing no trajeto.
- Histórico de 30 dias e leitura offline do último briefing.
- Tela /lab para testar qualquer tema com dados falsos, sem esperar uma notícia real.
- Ajustes: horário, silêncio, som, "modo sóbrio" (sempre tema neutro) e troca manual de tema.

## Política de avisos
- Um aviso por dia, às 06:30, com o texto do tema.
- Plantão, no máximo 2 por dia: alerta laranja ou vermelho do INMET que cubra Curitiba, ou salto forte na pontuação de uma história.
- Silêncio das 22:00 às 06:30, exceto alerta vermelho do INMET para Curitiba.
- No Windows, não mostre overlay sobre jogo em tela cheia nem com software de transmissão aberto. Guarde o aviso para depois.

## Arquitetura
- Monorepo TypeScript com pnpm: core, server, web, desktop, mobile e themes.
- core: esquemas Zod, tipos e catálogo de temas, usados por todos os pacotes.
- server: Node, Fastify e Postgres no Railway. Um só serviço roda a API, o agendador interno e o pipeline.
- web: React, Vite e PWA. desktop: Tauri 2 sobre o build web. mobile: Capacitor sobre o build web.
- GitHub Actions só para testes e geração de instaladores em GitHub Releases. Não use o cron dele para o briefing, porque pode atrasar ou falhar.
- A chave da API fica só no servidor. Login de usuário único, com passkey ou token de pareamento por dispositivo.
- Limite as rotas que gastam dinheiro. "Atualizar agora": até 3 vezes por dia, com intervalo de 30 minutos.
- Guarde título, URL, data e o texto próprio do briefing. Não guarde o texto integral das matérias.
- O padrão é TypeScript porque o mesmo esquema valida pipeline, API e interface. Se ASP.NET Core for melhor no server, defenda isso no PLAN.md.

## Pipeline do briefing
O agendador inicia às 06:00, para o briefing ficar pronto às 06:30. Grave o resultado de cada passo no banco, para depuração.
1. Coleta, sem IA: RSS de uma lista branca (Agência Brasil, G1, Folha, Estadão, Valor, BBC, Reuters, AP e fontes locais do Paraná), GDELT DOC 2.0 para o volume global, Open-Meteo para a previsão de Curitiba, feed CAP/RSS do INMET para alertas. Teste se cada feed está ativo.
2. Termômetro do mundo: Claude Haiku 5.5 agrupa as manchetes por acontecimento. O código calcula a pontuação: veículos distintos, países distintos, recência e volume no GDELT. A maior pontuação é a história do dia.
3. Apuração: Claude Sonnet 5.5 com busca web (no máximo 8 buscas, só domínios da lista branca, incluindo Simepar e Defesa Civil do Paraná) e leitura de páginas. Ele confirma a história do dia, checa os alertas locais e preenche os temas vazios.
4. Redação: Claude Sonnet 5.5 gera o JSON do briefing a partir de prompts/editorial.md.
5. Verificação, sem IA: valide com Zod. Cada notícia precisa de URL da lista branca que responda 200 e data dentro de 36 horas. Descarte o que falhar.
6. Tema: Claude Haiku 5.5 escolhe o id no catálogo fechado. O código aplica as regras de segurança abaixo.
7. Publicação e envio dos avisos.

Falhas: tente de novo 2 vezes por passo. Se o briefing falhar, mostre o de ontem com um aviso claro. Nunca preencha lacunas com texto inventado.

Custo: registre tokens e buscas por execução. Use MAX_USD_POR_EXECUCAO=1 e MAX_USD_MES=25 como travas. Ao atingir a trava, pare e me avise.

## prompts/editorial.md
Você é o editor do ARAUTO. Escreva o briefing do dia para o André (Curitiba, America/Sao_Paulo), em português do Brasil, como quem explica para um amigo que não acompanha o noticiário. Use só os fatos do material apurado que você recebeu. O que não estiver no material não entra.

Linguagem
- Sem jargão. Termo técnico inevitável (Selic, PEC, Ibovespa, El Niño) ganha explicação curta na primeira vez que aparece.
- Cada notícia tem: oQueAconteceu, em 2 a 3 frases, e porQueImporta, em 1 frase com o efeito prático no bolso, no trabalho, na segurança ou na rotina.
- Preencha lados quando houver disputa real, atribuindo cada posição a quem a defende.
- Separe fato confirmado de alegação. Use "segundo X" quando for só alguém afirmando.
- Escreva com suas palavras, sem copiar trechos das matérias.
- Tom neutro e factual. Em política, fatos equilibrados, sem opinião e sem adjetivo de valor.
- Sem sensacionalismo. O título descreve o fato. O tema visual cuida da emoção; o texto não.
- Em continuaDeOntem, diga em uma frase o que mudou desde o último briefing, quando houver.
- Total de cerca de 1.300 palavras, para 6 minutos de leitura.

Blocos
1. Tempo em Curitiba: mínima e máxima em °C, chance de chuva e como fica o dia. Alertas do INMET, Simepar e Defesa Civil do Paraná, com tipo, nível e horário. Sem alerta, escreva "Sem alertas para Curitiba hoje". Eventos extremos em outras regiões só se forem relevantes.
2. Brasil: política e governo (decisões que mudam a vida das pessoas); dinheiro e economia (dólar, preços, juros, impostos); agro e máquinas agrícolas (safra, soja, milho, crédito rural, vendas de máquinas); tecnologia e IA (lançamentos, regras, golpes e dicas de segurança); segurança e saúde (só o que for importante).
3. Paraná e Curitiba: trânsito, obras, serviços públicos e governo estadual. Omita se não houver nada importante.
4. Mundo: os 3 a 5 fatos mais importantes, com contexto breve para quem não acompanhou o assunto.
5. Curiosidade: uma notícia leve de ciência, cultura, esporte ou descoberta, para terminar bem.

Formato: 2 a 4 notícias por tema. Omita o tema sem novidade, em vez de preenchê-lo com notícia fraca. Toda notícia leva suas fontes.

## Contrato do briefing
    {
      "data": "2026-11-04",
      "historiaDoDia": { "titulo": "...", "resumo": "...", "veiculos": 42, "paises": 17, "pontuacao": 0.87 },
      "tema": {
        "id": "ternura_animal",
        "intensidade": 2,
        "confianca": 0.92,
        "motivo": "...",
        "notificacao": { "titulo": "até 40 caracteres", "corpo": "até 110 caracteres" }
      },
      "emTrintaSegundos": ["...", "...", "..."],
      "tempo": { "minC": 16, "maxC": 27, "chuvaPct": 40, "resumo": "...", "alertas": [] },
      "secoes": [{ "id": "politica", "noticias": [{
        "titulo": "...", "oQueAconteceu": "...", "porQueImporta": "...",
        "lados": [], "continuaDeOntem": null,
        "fontes": [{ "titulo": "...", "url": "...", "publicadoEm": "..." }]
      }]}],
      "curiosidade": {},
      "custo": { "usd": 0.41, "buscas": 7 }
    }

## Contrato de temas
Catálogo fechado: neutro, ternura_animal, conflito, nuclear, clima_extremo, mercado_alta, mercado_queda, ciencia_espaco, tecnologia_ia, agro_safra, politica, saude, esporte, cultura, luto.

Intensidade: 1 discreta, 2 normal, 3 forte.

Cada pacote fica em themes/<id>/:
    meta.json        id, nome, intensidades, som, emoji, duracaoAberturaMs
    tokens.css       --fundo --superficie --texto --texto-suave --destaque --alerta --fonte-titulo --fonte-corpo
    nucleo.svg       forma do Núcleo neste tema
    abertura.html    tela cheia, de 1,5 a 2,5 s, pulável
    ambiente.html    fundo em loop, leve
    toast.html       aviso de 420 x 140 px para o overlay do Windows
    notificacao.png  imagem 2:1 para o Android

Regras de segurança, aplicadas por código depois do modelo:
- Id fora do catálogo ou confiança abaixo de 0,7: use neutro.
- O fato central é a perda de vidas (massacre, atentado, desastre com muitas vítimas): use luto, mesmo durante uma guerra.
- A história é escalada, decisão militar ou risco de guerra, sem elemento nuclear: use conflito.
- Use nuclear só se a própria história envolver arma, instalação ou ameaça nuclear concreta.
- Animal ferido ou em sofrimento nunca usa ternura_animal.
- luto nunca tem som nem animação além de um fade.
- O modelo só escolhe id, intensidade e texto do aviso. Ele nunca gera cor, código ou animação.

## Etapas

### Etapa 0: fundação
Entrega: PLAN.md, monorepo, TypeScript estrito, esquemas do core e CI.
Aceite: testes verdes e plano aprovado por mim.

### Etapa 1: cérebro, sem interface
Entrega: pipeline completo, comandos brief:gerar e brief:ver, matérias gravadas para testar sem gastar API.
Teste de tema com casos fictícios: resgate de filhote vira ternura_animal; escalada militar vira conflito; teste de míssil nuclear vira nuclear; queda de avião com vítimas vira luto; bombardeio com centenas de civis mortos vira luto; animal ferido não vira ternura_animal; bolsas despencando vira mercado_queda; sonda pousando em Marte vira ciencia_espaco.
Aceite: 3 execuções reais com todos os links abrindo, datas dentro de 36 horas, leitura de 5 a 7 minutos, custo registrado e 100% nos casos de luto, nuclear e animal ferido.

### Etapa 2: web e PWA
Entrega: app no Railway, motor de temas, /lab, Stories, Lista, Modo Ouvir com a voz do sistema, Web Push, modo offline e página /instalar que detecta o aparelho. Comece com neutro, ternura_animal, conflito e luto, usando o pacote do Claude Design.
Aceite: instala e recebe aviso no Chrome do Windows, abre no iPhone XR e no Android, e tema desconhecido cai em neutro sem erro.

### Etapa 3: Windows
Entrega: Tauri 2 com ícone na bandeja, início com o Windows, atalho global Ctrl+Shift+A configurável, overlay transparente sempre no topo, consulta ao servidor a cada 15 minutos, instalador .exe no GitHub Releases e atualização automática.
Aceite: instala em 2 cliques em um Windows limpo, o overlay não rouba o foco e a regra de jogo e transmissão funciona.

### Etapa 4: Android
Entrega: Capacitor, FCM com imagem do tema, canal de notificação por tema, .apk assinado pelo GitHub Actions e registro do app em conta de distribuição limitada.
Aceite: instala tocando no .apk, recebe aviso com o app fechado e o toque abre a Abertura do tema certo.

### Etapa 5: iPhone XR
Entrega: PWA ajustado para Safari no iOS 18: áreas seguras, ícones, tela de abertura, tutorial ilustrado de Adicionar à Tela de Início e pedido de permissão só após um toque.
Aceite: em um XR real, recebe Web Push com o app fechado, anima sem engasgo perceptível e abre offline.
Opcional, fora do MVP: app nativo via TestFlight, só se eu entrar no programa pago de desenvolvedor da Apple.

### Etapa 6: modo Jarvis
Só depois da Etapa 5.
- "Explica melhor" em cada notícia, ancorado na notícia e nas fontes.
- "Pergunte ao Arauto", com voz quando disponível, respondendo só com base nos briefings e citando a fonte.
- Resumo semanal aos domingos.
- Extensão de navegador opcional, que transforma a nova aba no briefing.

## Fora do escopo
Multiusuário, login social, App Store, Play Store, anúncios, imagens geradas por IA e qualquer tema fora do catálogo.
