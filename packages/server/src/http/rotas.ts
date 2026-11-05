import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Dispositivo, RegistroDeBriefing, RepositorioDoServico } from "../repo/repositorio.js";
import type { Acesso } from "../servico/acesso.js";
import type { MotivoDeRecusa, Orquestrador } from "../servico/orquestrador.js";
import { dataEmSaoPaulo, type Relogio } from "../util/tempo.js";

declare module "fastify" {
  interface FastifyRequest {
    /** O aparelho autenticado nas rotas protegidas; nulo nas públicas. */
    dispositivo: Dispositivo | null;
  }
}

/** Quantos dias o histórico mostra (briefing: "Histórico de 30 dias"). */
export const DIAS_DE_HISTORICO = 30;

export interface DependenciasDasRotas {
  repo: RepositorioDoServico;
  acesso: Acesso;
  orquestrador: Orquestrador;
  relogio: Relogio;
  /** Configuração de limite de taxa por rota; vazia quando o limitador está desligado (testes). */
  limites: {
    leitura: object;
    escrita: object;
    pareamento: object;
    saude: object;
  };
}

const PareamentoSchema = z
  .object({ codigo: z.string().min(1).max(64), nome: z.string().max(100).optional() })
  .strict();
const DataSchema = z.iso.date();
const IdSchema = z.uuid();

/** 400 genérico: não diz qual campo errou nem devolve o que foi enviado. */
function requisicaoInvalida(reply: FastifyReply) {
  return reply.code(400).send({ erro: "requisicao_invalida" });
}

/** ETags podem vir com aspas, com prefixo W/ e em lista. */
function etagConfere(cabecalho: string | undefined, etag: string): boolean {
  if (!cabecalho) return false;
  return cabecalho
    .split(",")
    .map((parte) => parte.trim().replace(/^W\//, ""))
    .some((parte) => parte === "*" || parte === etag);
}

const STATUS_DA_RECUSA: Record<MotivoDeRecusa, number> = {
  limite_diario: 429,
  intervalo: 429,
  pausado: 503,
  teto_mensal: 503,
  reserva: 503,
  sem_chave: 503,
};

export function registrarRotas(app: FastifyInstance, deps: DependenciasDasRotas): void {
  const { repo, acesso, orquestrador, relogio, limites } = deps;

  app.decorateRequest("dispositivo", null);

  // --- Públicas ---

  app.get("/api/saude", { config: { rateLimit: limites.saude } }, async (_req, reply) => {
    try {
      await repo.execucaoEmAndamento(); // uma consulta barata: o banco está de pé?
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.post("/api/pareamento", { config: { rateLimit: limites.pareamento } }, async (req, reply) => {
    const corpo = PareamentoSchema.safeParse(req.body);
    if (!corpo.success) return requisicaoInvalida(reply);
    const resultado = await acesso.parear(corpo.data.codigo, corpo.data.nome ?? "");
    if (!resultado.ok) {
      // Igual para código errado, expirado, já usado ou queimado: não ensina nada a quem tenta.
      return reply
        .code(401)
        .send({ erro: "codigo_invalido", mensagem: "Código inválido ou expirado." });
    }
    return {
      token: resultado.token,
      dispositivo: { id: resultado.dispositivo.id, nome: resultado.dispositivo.nome },
    };
  });

  // --- Protegidas: tudo que mostra dados ou gasta dinheiro exige um aparelho pareado ---

  app.register(async (protegidas) => {
    // preHandler (e não onRequest): o limitador de taxa roda antes e também segura quem só erra o token.
    protegidas.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      const cabecalho = req.headers.authorization;
      const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7).trim() : undefined;
      const resultado = await acesso.autenticar(token);
      if (!resultado.ok) {
        return reply
          .code(401)
          .header("WWW-Authenticate", "Bearer")
          .send({ erro: "nao_autorizado" });
      }
      req.dispositivo = resultado.dispositivo;
    });

    const responderBriefing = (
      req: FastifyRequest,
      reply: FastifyReply,
      registro: RegistroDeBriefing | null,
    ) => {
      if (!registro) return reply.code(404).send({ erro: "nao_encontrado" });
      const doDia = registro.data === dataEmSaoPaulo(relogio.agora());
      // Muda quando entra uma versão nova ou quando o "de hoje" vira "de ontem".
      const etag = `"${registro.data}.v${registro.versao}.${doDia ? "hoje" : "antigo"}"`;
      reply.header("ETag", etag).header("Cache-Control", "private, no-cache");
      if (etagConfere(req.headers["if-none-match"], etag)) return reply.code(304).send();
      return reply.send({
        data: registro.data,
        versao: registro.versao,
        criadoEm: registro.criadoEm,
        tipo: registro.tipo,
        avisos: registro.avisos,
        doDia,
        briefing: registro.briefing,
      });
    };

    // O mais recente. Se o de hoje não saiu, vem o de ontem com `doDia: false` (PLAN.md, Q6).
    protegidas.get("/api/briefing/hoje", { config: { rateLimit: limites.leitura } }, (req, reply) =>
      repo.ultimoBriefing().then((registro) => responderBriefing(req, reply, registro)),
    );

    protegidas.get(
      "/api/briefing/:data",
      { config: { rateLimit: limites.leitura } },
      async (req, reply) => {
        const data = DataSchema.safeParse((req.params as { data?: string }).data);
        if (!data.success) return requisicaoInvalida(reply);
        return responderBriefing(req, reply, await repo.briefingDaData(data.data));
      },
    );

    protegidas.get("/api/historico", { config: { rateLimit: limites.leitura } }, async () => {
      const registros = await repo.historico(DIAS_DE_HISTORICO);
      return {
        dias: registros.map((r) => ({
          data: r.data,
          versao: r.versao,
          criadoEm: r.criadoEm,
          titulo: r.briefing.historiaDoDia.titulo,
          tema: r.briefing.tema.id,
        })),
      };
    });

    protegidas.get("/api/estado", { config: { rateLimit: limites.leitura } }, () =>
      orquestrador.estado(),
    );

    // O botão "Atualizar agora". As travas de verdade moram no orquestrador e no banco; o limite
    // de taxa HTTP é só a primeira cerca.
    protegidas.post(
      "/api/atualizar",
      { config: { rateLimit: limites.escrita } },
      async (_req, reply) => {
        const pedido = await orquestrador.pedirAtualizacao();
        if (pedido.situacao === "iniciada") {
          return reply.code(202).send({ situacao: "iniciada", execucaoId: pedido.execucaoId });
        }
        if (pedido.situacao === "em_andamento") {
          return reply.code(200).send({ situacao: "em_andamento", execucaoId: pedido.execucaoId });
        }
        if (pedido.tentarEm) {
          const segundos = Math.max(
            1,
            Math.ceil((Date.parse(pedido.tentarEm) - relogio.agora().getTime()) / 1000),
          );
          reply.header("Retry-After", String(segundos));
        }
        return reply.code(STATUS_DA_RECUSA[pedido.motivo]).send({
          erro: pedido.motivo,
          mensagem: pedido.mensagem,
          tentarEm: pedido.tentarEm,
        });
      },
    );

    protegidas.get(
      "/api/execucoes/:id",
      { config: { rateLimit: limites.leitura } },
      async (req, reply) => {
        const id = IdSchema.safeParse((req.params as { id?: string }).id);
        if (!id.success) return requisicaoInvalida(reply);
        const execucao = await repo.buscarExecucao(id.data);
        if (!execucao) return reply.code(404).send({ erro: "nao_encontrado" });
        const falhou = execucao.status === "falhou" || execucao.status === "abortado_por_custo";
        const comErro = [...execucao.passos].reverse().find((p) => p.erro !== null);
        return {
          id: execucao.id,
          data: execucao.data,
          tipo: execucao.tipo,
          status: execucao.status,
          criadaEm: execucao.criadaEm,
          passoAtual: execucao.passos.at(-1)?.passo ?? null,
          erro: falhou ? (comErro?.erro?.slice(0, 300) ?? null) : null,
          gastoUsd:
            Math.round(
              execucao.passos.flatMap((p) => p.usos).reduce((soma, uso) => soma + uso.usd, 0) *
                1_000_000,
            ) / 1_000_000,
        };
      },
    );

    protegidas.get("/api/dispositivo", { config: { rateLimit: limites.leitura } }, (req) => ({
      id: req.dispositivo?.id,
      nome: req.dispositivo?.nome,
    }));

    // "Sair deste aparelho": revoga o próprio token.
    protegidas.delete(
      "/api/dispositivo",
      { config: { rateLimit: limites.escrita } },
      async (req, reply) => {
        if (req.dispositivo) await acesso.revogar(req.dispositivo.id);
        return reply.code(204).send();
      },
    );
  });
}
