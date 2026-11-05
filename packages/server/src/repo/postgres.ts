import type { Execucao, Passo, ResultadoPasso, StatusExecucao, UsoDeModelo } from "@arauto/core";
import { BriefingSchema, ExecucaoSchema } from "@arauto/core";
import postgres from "postgres";
import { FUSO } from "../util/tempo.js";
import type { NovaExecucao, NovoBriefing, RegistroDeBriefing, Repositorio } from "./repositorio.js";

export type Sql = ReturnType<typeof postgres>;

export function conectar(url: string): Sql {
  // `onnotice` silencia avisos do tipo "tabela já existe, ignorando".
  return postgres(url, { max: 5, onnotice: () => {}, connect_timeout: 15 });
}

type Json = Parameters<Sql["json"]>[0];
const paraJson = (valor: unknown): Json => JSON.parse(JSON.stringify(valor)) as Json;

interface LinhaDeBriefing {
  data: string;
  versao: number;
  execucao_id: string;
  tipo: string;
  criado_em: Date;
  briefing: unknown;
  avisos: string[];
}

function paraRegistro(linha: LinhaDeBriefing): RegistroDeBriefing {
  return {
    data: linha.data,
    versao: linha.versao,
    execucaoId: linha.execucao_id,
    tipo: linha.tipo as RegistroDeBriefing["tipo"],
    criadoEm: linha.criado_em.toISOString(),
    // O que está no banco passa pelo contrato de novo: dado corrompido não chega à interface.
    briefing: BriefingSchema.parse(linha.briefing),
    avisos: linha.avisos,
  };
}

const COLUNAS_DO_BRIEFING = (sql: Sql) => sql`
  to_char(data, 'YYYY-MM-DD') as data, versao, execucao_id, tipo, criado_em, briefing, avisos`;

export class RepositorioPostgres implements Repositorio {
  constructor(private readonly sql: Sql) {}

  async criarExecucao(nova: NovaExecucao): Promise<void> {
    await this.sql`
      insert into execucoes (id, data, tipo, status, criada_em)
      values (${nova.id}, ${nova.data}, ${nova.tipo}, 'rodando', ${nova.criadaEm})`;
  }

  async atualizarStatus(id: string, status: StatusExecucao): Promise<void> {
    const alteradas = await this.sql`
      update execucoes set status = ${status}, atualizada_em = now() where id = ${id}
      returning id`;
    if (alteradas.length === 0) throw new Error(`Execução ${id} não existe`);
  }

  async gravarPasso(execucaoId: string, r: ResultadoPasso): Promise<void> {
    await this.sql`
      insert into passos (execucao_id, passo, status, tentativa, iniciado_em, terminado_em,
                          resumo_entrada, saida, erro, usos)
      values (${execucaoId}, ${r.passo}, ${r.status}, ${r.tentativa}, ${r.iniciadoEm},
              ${r.terminadoEm}, ${r.resumoEntrada},
              ${r.saida === null ? null : this.sql.json(paraJson(r.saida))},
              ${r.erro}, ${this.sql.json(paraJson(r.usos))})`;
  }

  async gravarUso(
    execucaoId: string,
    passo: Passo,
    uso: UsoDeModelo,
    quando: string,
  ): Promise<void> {
    await this.sql`
      insert into uso_modelo (execucao_id, passo, modelo, tokens_entrada, tokens_saida,
                              tokens_cache_leitura, buscas, usd, quando)
      values (${execucaoId}, ${passo}, ${uso.modelo}, ${uso.tokensEntrada}, ${uso.tokensSaida},
              ${uso.tokensCacheLeitura}, ${uso.buscas}, ${uso.usd}, ${quando})`;
  }

  async gastoDoMesUsd(mes: string): Promise<number> {
    // O mês é o de São Paulo, o mesmo usado na trava mensal.
    const [linha] = await this.sql<{ total: string }[]>`
      select coalesce(sum(usd), 0)::text as total from uso_modelo
      where to_char(quando at time zone ${FUSO}, 'YYYY-MM') = ${mes}`;
    return Math.round(Number(linha?.total ?? 0) * 1_000_000) / 1_000_000;
  }

  async gravarBriefing(novo: NovoBriefing): Promise<number> {
    const [linha] = await this.sql<{ versao: number }[]>`
      insert into briefings (data, versao, execucao_id, tipo, criado_em, briefing, avisos)
      select ${novo.data}::date, coalesce(max(versao), 0) + 1, ${novo.execucaoId}, ${novo.tipo},
             ${novo.criadoEm}, ${this.sql.json(paraJson(novo.briefing))}, ${this.sql.json(paraJson(novo.avisos))}
      from briefings where data = ${novo.data}::date
      returning versao`;
    if (!linha) throw new Error("Não foi possível gravar o briefing");
    return linha.versao;
  }

  async ultimoBriefing(): Promise<RegistroDeBriefing | null> {
    const [linha] = await this.sql<LinhaDeBriefing[]>`
      select ${COLUNAS_DO_BRIEFING(this.sql)} from briefings order by data desc, versao desc limit 1`;
    return linha ? paraRegistro(linha) : null;
  }

  async briefingDaData(data: string): Promise<RegistroDeBriefing | null> {
    const [linha] = await this.sql<LinhaDeBriefing[]>`
      select ${COLUNAS_DO_BRIEFING(this.sql)} from briefings
      where data = ${data}::date order by versao desc limit 1`;
    return linha ? paraRegistro(linha) : null;
  }

  async buscarExecucao(id: string): Promise<Execucao | null> {
    const [linha] = await this.sql<{ id: string }[]>`select id from execucoes where id = ${id}`;
    return linha ? this.montarExecucao(linha.id) : null;
  }

  async ultimaExecucao(): Promise<Execucao | null> {
    const [linha] = await this.sql<{ id: string }[]>`
      select id from execucoes order by criada_em desc limit 1`;
    return linha ? this.montarExecucao(linha.id) : null;
  }

  private async montarExecucao(id: string): Promise<Execucao> {
    const [execucao] = await this.sql<
      { id: string; data: string; tipo: string; status: string; criada_em: Date }[]
    >`select id, to_char(data, 'YYYY-MM-DD') as data, tipo, status, criada_em from execucoes where id = ${id}`;
    if (!execucao) throw new Error(`Execução ${id} não existe`);
    const passos = await this.sql<
      {
        passo: string;
        status: string;
        tentativa: number;
        iniciado_em: Date;
        terminado_em: Date;
        resumo_entrada: string;
        saida: unknown;
        erro: string | null;
        usos: unknown;
      }[]
    >`select passo, status, tentativa, iniciado_em, terminado_em, resumo_entrada, saida, erro, usos
      from passos where execucao_id = ${id} order by id`;
    return ExecucaoSchema.parse({
      id: execucao.id,
      data: execucao.data,
      tipo: execucao.tipo,
      status: execucao.status,
      criadaEm: execucao.criada_em.toISOString(),
      passos: passos.map((p) => ({
        passo: p.passo,
        status: p.status,
        tentativa: p.tentativa,
        iniciadoEm: p.iniciado_em.toISOString(),
        terminadoEm: p.terminado_em.toISOString(),
        resumoEntrada: p.resumo_entrada,
        saida: p.saida,
        erro: p.erro,
        usos: p.usos,
      })),
    });
  }
}
