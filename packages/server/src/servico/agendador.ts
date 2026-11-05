import type { Logger } from "../infra/log.js";
import type { RepositorioDoServico } from "../repo/repositorio.js";
import { LIMITE_DE_EXECUCAO_ORFA_MS } from "../repo/repositorio.js";
import { dataEmSaoPaulo, type Relogio } from "../util/tempo.js";
import { MINUTO_DE_INICIO_DO_BRIEFING, minutosDoDiaEmSaoPaulo } from "./calendario.js";
import type { Orquestrador } from "./orquestrador.js";

/** O briefing do dia tem no máximo duas tentativas (a original e uma de recuperação). */
export const MAX_TENTATIVAS_DA_DIARIA = 2;
/** Intervalo mínimo entre duas tentativas do briefing do dia. */
export const ESPERA_ENTRE_TENTATIVAS_MS = 10 * 60_000;
const INTERVALO_DO_LACO_MS = 60_000;

export type AcaoDoAgendador =
  | "antes_da_hora"
  | "em_dia"
  | "em_andamento"
  | "iniciada"
  | "espera_entre_tentativas"
  | "desistiu"
  | "sem_geracao"
  | "erro";

export interface DependenciasDoAgendador {
  orquestrador: Orquestrador;
  repo: RepositorioDoServico;
  relogio: Relogio;
  log: Logger;
}

/**
 * Agendador por reconciliação (PLAN.md, D5). Em vez de "disparar às 06:00" (que se perde se o
 * serviço estiver reiniciando justo ali), a cada minuto ele pergunta: "o que já deveria existir
 * hoje e não existe?". Subir às 09:00 depois de um deploy ruim também recupera o briefing do dia.
 * Os "vigias" de 06:20 e 06:40 são esta mesma pergunta repetida; o atraso é um estado
 * (`briefingAtrasado`), não um evento que possa se perder.
 */
export class Agendador {
  private temporizador: NodeJS.Timeout | null = null;
  private rodando = false;
  private ultimaAcao: AcaoDoAgendador | null = null;

  constructor(private readonly deps: DependenciasDoAgendador) {}

  /** Uma passada. Nunca lança: um erro vira `erro` e a próxima passada tenta de novo. */
  async reconciliar(): Promise<AcaoDoAgendador> {
    const acao = await this.decidir().catch((erro: unknown) => {
      this.deps.log.erro(`Agendador: ${erro instanceof Error ? erro.message : String(erro)}`);
      return "erro" as const;
    });
    // Só registra quando muda, para o log não ganhar uma linha por minuto.
    if (acao !== this.ultimaAcao) {
      if (acao !== "antes_da_hora" && acao !== "em_dia") this.deps.log.info(`Agendador: ${acao}.`);
      this.ultimaAcao = acao;
    }
    return acao;
  }

  private async decidir(): Promise<AcaoDoAgendador> {
    const { orquestrador, repo, relogio } = this.deps;
    const agora = relogio.agora();
    if (minutosDoDiaEmSaoPaulo(agora) < MINUTO_DE_INICIO_DO_BRIEFING) return "antes_da_hora";

    const diarias = (await repo.execucoesDaData(dataEmSaoPaulo(agora))).filter(
      (e) => e.tipo === "diaria",
    );
    if (diarias.some((e) => e.status === "ok")) return "em_dia";
    if (diarias.some((e) => e.status === "rodando")) return "em_andamento";

    const ultima = diarias.at(-1);
    // Parou por trava de custo: tentar de novo só repetiria a recusa (e o registro dela já existe).
    if (ultima?.status === "abortado_por_custo") return "desistiu";
    if (diarias.length >= MAX_TENTATIVAS_DA_DIARIA) return "desistiu";
    if (ultima && agora.getTime() - Date.parse(ultima.criadaEm) < ESPERA_ENTRE_TENTATIVAS_MS) {
      return "espera_entre_tentativas";
    }

    const pedido = await orquestrador.iniciarDiaria();
    if (pedido.situacao === "iniciada") return "iniciada";
    if (pedido.situacao === "em_andamento") return "em_andamento";
    return "sem_geracao";
  }

  /** Liga o laço. A primeira passada é imediata: é ela que recupera o briefing depois de um deploy. */
  async iniciar(intervaloMs = INTERVALO_DO_LACO_MS): Promise<void> {
    if (this.temporizador) return;
    // Execução 'rodando' de um processo que morreu não pode segurar a trava de "uma por vez".
    const limite = new Date(this.deps.relogio.agora().getTime() - LIMITE_DE_EXECUCAO_ORFA_MS);
    const orfas = await this.deps.repo.encerrarOrfas(limite.toISOString());
    if (orfas > 0) this.deps.log.aviso(`${orfas} execução(ões) órfã(s) marcada(s) como falha.`);

    const passada = async () => {
      if (this.rodando) return;
      this.rodando = true;
      try {
        await this.reconciliar();
      } finally {
        this.rodando = false;
      }
    };
    this.temporizador = setInterval(passada, intervaloMs);
    // O laço não segura o processo aberto sozinho: quem manda é o servidor HTTP.
    this.temporizador.unref();
    await passada();
  }

  parar(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }
}
