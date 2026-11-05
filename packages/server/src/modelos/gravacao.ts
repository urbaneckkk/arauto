import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Passo } from "@arauto/core";
import type { ChamadaDeModelo, ClienteDeModelo, RespostaDoModelo } from "./cliente.js";

interface Cassete {
  passo: Passo;
  ordem: number;
  gravadoEm: string;
  modelo: string;
  /** Guardado só para conferência humana; o replay usa apenas a resposta. */
  pedido: { sistema: string; usuario: string };
  resposta: RespostaDoModelo;
}

const arquivoDe = (pasta: string, passo: Passo, ordem: number) =>
  join(pasta, "modelo", `${passo}-${ordem}.json`);

/** Chama o modelo de verdade e guarda cada resposta em disco, na ordem em que aconteceram. */
export class ClienteGravador implements ClienteDeModelo {
  private readonly contagem = new Map<Passo, number>();

  constructor(
    private readonly real: ClienteDeModelo,
    private readonly pasta: string,
  ) {
    mkdirSync(join(pasta, "modelo"), { recursive: true });
  }

  async chamar(chamada: ChamadaDeModelo): Promise<RespostaDoModelo> {
    const resposta = await this.real.chamar(chamada);
    const ordem = (this.contagem.get(chamada.passo) ?? 0) + 1;
    this.contagem.set(chamada.passo, ordem);
    const cassete: Cassete = {
      passo: chamada.passo,
      ordem,
      gravadoEm: new Date().toISOString(),
      modelo: chamada.modelo,
      pedido: { sistema: chamada.sistema, usuario: chamada.usuario },
      resposta,
    };
    writeFileSync(
      arquivoDe(this.pasta, chamada.passo, ordem),
      JSON.stringify(cassete, null, 2),
      "utf8",
    );
    return resposta;
  }
}

/**
 * Repete as respostas gravadas, passo a passo e na mesma ordem: a 1ª chamada do passo "redacao"
 * recebe a 1ª resposta gravada, e assim por diante (incluindo as que deram erro e foram repetidas).
 * Não gasta nada.
 */
export class ClienteReplay implements ClienteDeModelo {
  private readonly contagem = new Map<Passo, number>();

  constructor(private readonly pasta: string) {}

  async chamar(chamada: ChamadaDeModelo): Promise<RespostaDoModelo> {
    const ordem = (this.contagem.get(chamada.passo) ?? 0) + 1;
    this.contagem.set(chamada.passo, ordem);
    const arquivo = arquivoDe(this.pasta, chamada.passo, ordem);
    if (!existsSync(arquivo)) {
      throw new Error(
        `Sem gravação do modelo para o passo "${chamada.passo}" (chamada ${ordem}) em ${this.pasta}`,
      );
    }
    return (JSON.parse(readFileSync(arquivo, "utf8")) as Cassete).resposta;
  }
}
