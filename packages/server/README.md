# @arauto/server

Serviço único no Railway: API (Fastify), agendador interno e pipeline do briefing, com Postgres.

- **Etapa 1:** pipeline e comandos `brief:gerar`, `brief:ver`, `tema:testar`, `db:migrar`.
- **Etapa 2, fatia A:** API sob `/api`, pareamento por aparelho, travas de custo, agendador por reconciliação e arquivos estáticos da web. Comandos `servidor`, `pareamento:gerar` e `dispositivos`.

| Pasta | O que tem |
|---|---|
| `src/pipeline`, `src/passos`, `src/coleta` | O briefing, passos 1 a 7 |
| `src/custo` | Preços e `Orcamento` (travas por execução, por mês, reserva e interruptor) |
| `src/servico` | `Acesso` (pareamento e tokens), `Orquestrador` (quem pode gastar) e `Agendador` |
| `src/http` | Fastify: segurança, rotas e arquivos estáticos |
| `src/repo` | Memória, arquivo e Postgres, sob o mesmo contrato de testes; `migrations/` |

Decisões e o que ficou para depois: [PLAN.md](../../PLAN.md), seções 2.8, 2.9 e "Etapa 2, fatia A".
