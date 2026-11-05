import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha1 } from "../util/hash.js";

/** Identificação honesta: quem lê o log do servidor sabe quem é e onde está o código. */
export const USER_AGENT =
  "Mozilla/5.0 (compatible; ArautoBot/0.1; +https://github.com/urbaneckkk/arauto)";

export interface RespostaHttp {
  status: number;
  contentType: string | null;
  corpo: string;
}

export interface OpcoesHttp {
  timeoutMs?: number;
}

export interface ResultadoDaVerificacao {
  /** Código HTTP final, depois dos redirecionamentos. 0 se a rede falhou. */
  status: number;
  /** URL em que a resposta terminou. Igual à pedida se não houve redirecionamento. */
  urlFinal: string;
}

/**
 * Toda saída para a internet passa por aqui. Isso permite gravar uma execução real e
 * repeti-la depois de graça (replay), e testar sem rede.
 */
export interface Transporte {
  /** Lê uma URL. Lança erro se a rede falhar; resposta com erro HTTP não lança. */
  get(url: string, opcoes?: OpcoesHttp): Promise<RespostaHttp>;
  /**
   * Segue os redirecionamentos e devolve o código HTTP e a URL final, sem baixar o corpo.
   * Veículos como a Folha publicam links de redirecionamento: a lista branca vale para a URL final.
   */
  verificar(url: string, opcoes?: OpcoesHttp): Promise<ResultadoDaVerificacao>;
}

const CABECALHOS = {
  "user-agent": USER_AGENT,
  accept: "application/rss+xml, application/xml, application/json, text/html;q=0.8, */*;q=0.5",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.5",
};

export class TransporteReal implements Transporte {
  async get(url: string, { timeoutMs = 20_000 }: OpcoesHttp = {}): Promise<RespostaHttp> {
    const resposta = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: CABECALHOS,
    });
    const corpo = await resposta.text();
    return { status: resposta.status, contentType: resposta.headers.get("content-type"), corpo };
  }

  async verificar(
    url: string,
    { timeoutMs = 12_000 }: OpcoesHttp = {},
  ): Promise<ResultadoDaVerificacao> {
    try {
      const resposta = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: CABECALHOS,
      });
      await resposta.body?.cancel();
      return { status: resposta.status, urlFinal: resposta.url || url };
    } catch {
      return { status: 0, urlFinal: url };
    }
  }
}

interface RegistroGravado {
  tipo: "get" | "verificar";
  url: string;
  resposta?: RespostaHttp;
  verificacao?: ResultadoDaVerificacao;
  erro?: string;
  gravadoEm: string;
}

function arquivoDe(pasta: string, tipo: "get" | "verificar", url: string): string {
  return join(pasta, "http", `${tipo}-${sha1(url)}.json`);
}

/** Faz a chamada de verdade e guarda o resultado em disco. */
export class TransporteGravador implements Transporte {
  constructor(
    private readonly real: Transporte,
    private readonly pasta: string,
  ) {
    mkdirSync(join(pasta, "http"), { recursive: true });
  }

  async get(url: string, opcoes?: OpcoesHttp): Promise<RespostaHttp> {
    const base = { tipo: "get", url, gravadoEm: new Date().toISOString() } as const;
    try {
      const resposta = await this.real.get(url, opcoes);
      this.salvar(arquivoDe(this.pasta, "get", url), { ...base, resposta });
      return resposta;
    } catch (erro) {
      this.salvar(arquivoDe(this.pasta, "get", url), { ...base, erro: String(erro) });
      throw erro;
    }
  }

  async verificar(url: string, opcoes?: OpcoesHttp): Promise<ResultadoDaVerificacao> {
    const verificacao = await this.real.verificar(url, opcoes);
    this.salvar(arquivoDe(this.pasta, "verificar", url), {
      tipo: "verificar",
      url,
      verificacao,
      gravadoEm: new Date().toISOString(),
    });
    return verificacao;
  }

  private salvar(arquivo: string, registro: RegistroGravado): void {
    writeFileSync(arquivo, JSON.stringify(registro), "utf8");
  }
}

/** Repete o que foi gravado. O que não foi gravado falha como se a rede tivesse caído. */
export class TransporteReplay implements Transporte {
  constructor(private readonly pasta: string) {}

  async get(url: string): Promise<RespostaHttp> {
    const arquivo = arquivoDe(this.pasta, "get", url);
    if (!existsSync(arquivo)) throw new Error(`Sem gravação para ${url}`);
    const registro = JSON.parse(readFileSync(arquivo, "utf8")) as RegistroGravado;
    if (registro.erro !== undefined) throw new Error(registro.erro);
    if (!registro.resposta) throw new Error(`Gravação sem resposta para ${url}`);
    return registro.resposta;
  }

  async verificar(url: string): Promise<ResultadoDaVerificacao> {
    const arquivo = arquivoDe(this.pasta, "verificar", url);
    if (!existsSync(arquivo)) return { status: 0, urlFinal: url };
    const registro = JSON.parse(readFileSync(arquivo, "utf8")) as RegistroGravado;
    return registro.verificacao ?? { status: 0, urlFinal: url };
  }
}
