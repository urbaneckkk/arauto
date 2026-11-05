import { useSyncExternalStore } from "react";

/** Rotas por "#" (hash): funcionam em qualquer hospedagem estática, sem configurar redirecionamento. */
export type Rota =
  | { nome: "hoje" }
  | { nome: "historico" }
  | { nome: "dia"; data: string }
  | { nome: "ajustes" }
  | { nome: "lab" }
  | { nome: "instalar" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function lerRota(hash: string): Rota {
  const caminho = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  const [primeiro, segundo] = caminho.split("/");
  if (primeiro === "historico") return { nome: "historico" };
  if (primeiro === "dia" && segundo && DATA.test(segundo)) return { nome: "dia", data: segundo };
  if (primeiro === "ajustes") return { nome: "ajustes" };
  if (primeiro === "lab") return { nome: "lab" };
  if (primeiro === "instalar") return { nome: "instalar" };
  return { nome: "hoje" };
}

export function hrefDe(rota: Rota): string {
  switch (rota.nome) {
    case "hoje":
      return "#/";
    case "dia":
      return `#/dia/${rota.data}`;
    default:
      return `#/${rota.nome}`;
  }
}

function assinar(aviso: () => void): () => void {
  window.addEventListener("hashchange", aviso);
  return () => window.removeEventListener("hashchange", aviso);
}

export function useRota(): Rota {
  const hash = useSyncExternalStore(
    assinar,
    () => window.location.hash,
    () => "",
  );
  return lerRota(hash);
}
