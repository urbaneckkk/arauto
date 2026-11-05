# @arauto/themes

Um pacote por tema, em `packages/themes/<id>/`, onde `<id>` é um dos 15 ids do catálogo (veja `TEMA_IDS` em `@arauto/core`).

```
meta.json        id, nome, intensidades, som, emoji, duracaoAberturaMs   (validado por ThemeMetaSchema)
tokens.css       --fundo --superficie --texto --texto-suave --destaque --alerta --fonte-titulo --fonte-corpo
nucleo.svg       forma do Núcleo neste tema
abertura.html    tela cheia, de 1,5 a 2,5 s, pulável
ambiente.html    fundo em loop, leve
toast.html       aviso de 420 x 140 px para o overlay do Windows
notificacao.png  imagem 2:1 para o Android
```

**Ainda vazio.** Os pacotes chegam do Claude Design antes da Etapa 2. Os 4 primeiros são `neutro`, `ternura_animal`, `conflito` e `luto`.

Enquanto um tema não existir aqui, o motor de temas usa `neutro`.

## Direção visual: "C · Vigia"

Captura em [docs/design/vigia-direcao-c.png](../../docs/design/vigia-direcao-c.png). Nomes do design e ids do catálogo:

| Nome no design | Id |
|---|---|
| Sala de Comando | `neutro` |
| Patinhas | `ternura_animal` |
| Sala de Situação | `conflito` |
| Silêncio | `luto` |
| Olho da Tempestade | `clima_extremo` |
| Pregão Verde | `mercado_alta` |
| Órbita | `ciencia_espaco` |
| Safra | `agro_safra` |
| Plantão (sugestão: renomear para "Pulso") | `saude` |

Sem desenho ainda: `nuclear`, `mercado_queda`, `tecnologia_ia`, `politica`, `esporte`, `cultura`.
