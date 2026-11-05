import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  carregarDia,
  carregarIndice,
  carregarUltimo,
  type ItemDoIndice,
  type Registro,
} from "./dados";

export type Carga<T> =
  | { tipo: "carregando" }
  | { tipo: "ok"; valor: T; em: number }
  | { tipo: "erro"; mensagem: string };

const REVALIDAR_DEPOIS_DE_MS = 10 * 60 * 1000;

/** Traduz o erro técnico numa frase que a pessoa entende. */
export function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  if (texto === "HTTP 404") return "Ainda não saiu nenhum briefing por aqui.";
  if (texto.startsWith("HTTP"))
    return "Não consegui falar com o servidor agora. Tente de novo em instantes.";
  if (erro instanceof Error && erro.name === "ZodError") {
    return "O briefing veio num formato que este app não entende. Feche e abra o app para atualizar.";
  }
  return "Sem conexão e sem briefing guardado neste aparelho ainda. Abra o app uma vez com internet.";
}

/** Carrega algo e, se o app voltar ao primeiro plano depois de um tempo, confere se há versão nova. */
function useCarga<T>(
  buscar: (() => Promise<T>) | null,
  chave: string,
): { carga: Carga<T>; recarregar: () => void } {
  const [carga, setCarga] = useState<Carga<T>>({ tipo: "carregando" });
  const ultima = useRef(0);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  const executar = useCallback(async (silencioso: boolean) => {
    const f = buscarRef.current;
    if (!f) return;
    if (!silencioso) setCarga({ tipo: "carregando" });
    try {
      const valor = await f();
      ultima.current = Date.now();
      setCarga({ tipo: "ok", valor, em: ultima.current });
    } catch (erro) {
      // Numa conferência em segundo plano, mantém o que já está na tela.
      if (!silencioso) setCarga({ tipo: "erro", mensagem: mensagemDeErro(erro) });
    }
  }, []);

  // `chave` é o que muda quando a coisa buscada muda (ex.: outro dia): aí carrega de novo.
  useEffect(() => {
    void executar(false);
  }, [chave, executar]);

  useEffect(() => {
    const aoVoltar = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - ultima.current > REVALIDAR_DEPOIS_DE_MS
      ) {
        void executar(true);
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [executar]);

  return { carga, recarregar: () => void executar(false) };
}

export function useUltimo() {
  return useCarga<Registro>(carregarUltimo, "ultimo");
}

export function useDia(data: string | null) {
  return useCarga<Registro>(data ? () => carregarDia(data) : null, `dia:${data ?? ""}`);
}

export function useIndice() {
  return useCarga<ItemDoIndice[]>(carregarIndice, "indice");
}

function assinarRede(aviso: () => void): () => void {
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  return () => {
    window.removeEventListener("online", aviso);
    window.removeEventListener("offline", aviso);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    assinarRede,
    () => navigator.onLine,
    () => true,
  );
}
