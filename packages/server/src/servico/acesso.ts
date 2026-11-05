import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Dispositivo, RepositorioDoServico } from "../repo/repositorio.js";
import { type Relogio, UMA_HORA_MS } from "../util/tempo.js";

/** Sem 0, O, 1, I e L, que se confundem quando o código é digitado a partir de uma tela. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO_DO_CODIGO = 8;
/** Maior múltiplo do alfabeto que cabe num byte: acima disso o sorteio seria enviesado. */
const LIMITE_DO_SORTEIO = 256 - (256 % ALFABETO.length);

const PREFIXO_DO_TOKEN = "ar1_";
/** Um token de verdade tem 4 + 43 caracteres; nada maior que isto chega ao banco. */
const TAMANHO_MAXIMO_DO_TOKEN = 80;

export const VALIDADE_DO_CODIGO_MS = 10 * 60_000;
/** O último uso é gravado no máximo uma vez por hora: ler o briefing não vira escrita no banco. */
const INTERVALO_DE_REGISTRO_DE_USO_MS = UMA_HORA_MS;
const NOME_MAXIMO = 60;

const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

/** "abcd-efgh" → "ABCDEFGH". Quem digita não deve errar por causa de hífen, espaço ou caixa. */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const hashDoCodigo = (normalizado: string) => sha256(`codigo:${normalizado}`);
const hashDoToken = (token: string) => sha256(`token:${token}`);

export function sortearCodigo(): string {
  let letras = "";
  while (letras.length < TAMANHO_DO_CODIGO) {
    for (const byte of randomBytes(16)) {
      if (byte < LIMITE_DO_SORTEIO && letras.length < TAMANHO_DO_CODIGO) {
        letras += ALFABETO[byte % ALFABETO.length];
      }
    }
  }
  return `${letras.slice(0, 4)}-${letras.slice(4)}`;
}

/** 256 bits aleatórios, em texto seguro para cabeçalho HTTP. */
export function sortearToken(): string {
  return `${PREFIXO_DO_TOKEN}${randomBytes(32).toString("base64url")}`;
}

export type ResultadoDoPareamento =
  | { ok: true; token: string; dispositivo: Dispositivo }
  | { ok: false };

export type ResultadoDaAutenticacao =
  | { ok: true; dispositivo: Dispositivo }
  | { ok: false; motivo: "ausente" | "invalido" | "revogado" | "inativo" };

export interface ConfigDoAcesso {
  repo: RepositorioDoServico;
  relogio: Relogio;
  /** Dias sem uso até o aparelho precisar parear de novo. */
  inatividadeDias: number;
  gerarId?: () => string;
}

/** Pareamento e autenticação por dispositivo (PLAN.md, D6 e seção 2.9). */
export class Acesso {
  constructor(private readonly config: ConfigDoAcesso) {}

  /** Cria um código de uso único. Quem pode chamar isto é o dono, no servidor (um comando), nunca uma rota. */
  async gerarCodigo(): Promise<{ codigo: string; expiraEm: string }> {
    const agora = this.config.relogio.agora();
    const codigo = sortearCodigo();
    const expiraEm = new Date(agora.getTime() + VALIDADE_DO_CODIGO_MS).toISOString();
    await this.config.repo.guardarCodigo({
      codigoHash: hashDoCodigo(normalizarCodigo(codigo)),
      criadoEm: agora.toISOString(),
      expiraEm,
    });
    return { codigo, expiraEm };
  }

  /**
   * Troca o código por um token. Toda recusa é igual por fora (não diz se o código expirou, errou
   * ou já foi usado), e cada erro queima uma das 5 tentativas dos códigos ainda válidos.
   */
  async parear(codigoDigitado: string, nomeDigitado: string): Promise<ResultadoDoPareamento> {
    const agora = this.config.relogio.agora().toISOString();
    const normalizado = normalizarCodigo(codigoDigitado);
    const formatoValido = normalizado.length === TAMANHO_DO_CODIGO;
    const consumido =
      formatoValido && (await this.config.repo.consumirCodigo(hashDoCodigo(normalizado), agora));
    if (!consumido) {
      await this.config.repo.registrarFalhaDePareamento(agora);
      return { ok: false };
    }

    const token = sortearToken();
    const dispositivo = {
      id: (this.config.gerarId ?? randomUUID)(),
      nome: nomeDigitado.trim().slice(0, NOME_MAXIMO) || "Dispositivo",
      criadoEm: agora,
    };
    await this.config.repo.criarDispositivo({ ...dispositivo, tokenHash: hashDoToken(token) });
    return {
      ok: true,
      token,
      dispositivo: { ...dispositivo, ultimoUsoEm: null, revogadoEm: null },
    };
  }

  async autenticar(token: string | undefined): Promise<ResultadoDaAutenticacao> {
    if (!token) return { ok: false, motivo: "ausente" };
    // Formato errado nem chega ao banco.
    if (
      token.length > TAMANHO_MAXIMO_DO_TOKEN ||
      !token.startsWith(PREFIXO_DO_TOKEN) ||
      !/^[A-Za-z0-9_-]+$/.test(token)
    ) {
      return { ok: false, motivo: "invalido" };
    }

    const hash = hashDoToken(token);
    const achado = await this.config.repo.buscarDispositivoPorToken(hash);
    // Comparação em tempo constante, mesmo o banco já tendo achado pelo hash.
    if (
      !achado ||
      achado.tokenHash.length !== hash.length ||
      !timingSafeEqual(Buffer.from(achado.tokenHash), Buffer.from(hash))
    ) {
      return { ok: false, motivo: "invalido" };
    }
    if (achado.revogadoEm !== null) return { ok: false, motivo: "revogado" };

    const agora = this.config.relogio.agora();
    const referencia = Date.parse(achado.ultimoUsoEm ?? achado.criadoEm);
    if (agora.getTime() - referencia > this.config.inatividadeDias * 24 * UMA_HORA_MS) {
      return { ok: false, motivo: "inativo" };
    }

    if (
      achado.ultimoUsoEm === null ||
      agora.getTime() - Date.parse(achado.ultimoUsoEm) > INTERVALO_DE_REGISTRO_DE_USO_MS
    ) {
      await this.config.repo.registrarUsoDoDispositivo(achado.id, agora.toISOString());
    }
    const { tokenHash: _tokenHash, ...dispositivo } = achado;
    return { ok: true, dispositivo };
  }

  listar(): Promise<Dispositivo[]> {
    return this.config.repo.listarDispositivos();
  }

  revogar(id: string): Promise<boolean> {
    return this.config.repo.revogarDispositivo(id, this.config.relogio.agora().toISOString());
  }
}
