import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type EstadoEmMemoria, estadoVazio, RepositorioEmMemoria } from "./memoria.js";

/** Erros do Windows quando antivírus ou indexador seguram o arquivo por um instante. */
const ERROS_PASSAGEIROS = new Set(["EPERM", "EBUSY", "EACCES"]);
const TENTATIVAS_DE_RENOMEAR = 5;

function esperar(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Repositório em um arquivo JSON local: permite rodar o pipeline sem banco (`--sem-banco`) e
 * ainda assim lembrar o gasto do mês, para a trava mensal valer também aqui.
 */
export class RepositorioEmArquivo extends RepositorioEmMemoria {
  constructor(private readonly arquivo: string) {
    super(RepositorioEmArquivo.carregar(arquivo));
  }

  private static carregar(arquivo: string): EstadoEmMemoria {
    if (!existsSync(arquivo)) return estadoVazio();
    // Arquivo gravado por uma versão anterior não tem as listas novas: completa com as vazias.
    return {
      ...estadoVazio(),
      ...(JSON.parse(readFileSync(arquivo, "utf8")) as Partial<EstadoEmMemoria>),
    };
  }

  /**
   * Grava em arquivo temporário e troca (assim um corte no meio nunca deixa o estado pela
   * metade). Se o Windows segurar o arquivo, repete; no último caso grava direto, para não
   * perder o gasto registrado.
   */
  protected override aoMudar(): void {
    mkdirSync(dirname(this.arquivo), { recursive: true });
    const conteudo = JSON.stringify(this.estado, null, 2);
    const temporario = `${this.arquivo}.tmp`;
    writeFileSync(temporario, conteudo, "utf8");
    for (let tentativa = 1; ; tentativa++) {
      try {
        renameSync(temporario, this.arquivo);
        return;
      } catch (erro) {
        const codigo = (erro as NodeJS.ErrnoException).code ?? "";
        if (!ERROS_PASSAGEIROS.has(codigo)) throw erro;
        if (tentativa >= TENTATIVAS_DE_RENOMEAR) {
          writeFileSync(this.arquivo, conteudo, "utf8");
          rmSync(temporario, { force: true });
          return;
        }
        esperar(25 * tentativa);
      }
    }
  }
}
