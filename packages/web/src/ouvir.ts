import type { Briefing } from "@arauto/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { dataPorExtenso, NOMES_DE_SECAO, todasAsNoticias } from "./util";

export interface Trecho {
  rotulo: string;
  texto: string;
}

/** O briefing em partes para ler em voz alta: abertura, "Em 30 segundos", tempo e cada notícia. */
export function montarTrechos(b: Briefing): Trecho[] {
  const trechos: Trecho[] = [
    {
      rotulo: "Abertura",
      texto: `Briefing de ${dataPorExtenso(b.data)}. ${b.historiaDoDia.titulo}.`,
    },
    { rotulo: "Em 30 segundos", texto: `Em trinta segundos. ${b.emTrintaSegundos.join(" ")}` },
    { rotulo: "Tempo", texto: `Tempo em Curitiba. ${b.tempo.resumo}` },
  ];
  for (const { rotulo, noticia } of todasAsNoticias(b)) {
    trechos.push({
      rotulo: noticia.titulo,
      texto: `${NOMES_DE_SECAO[rotulo]}. ${noticia.titulo}. ${noticia.oQueAconteceu} Por que importa: ${noticia.porQueImporta}`,
    });
  }
  trechos.push({ rotulo: "Fim", texto: "Esse foi o briefing de hoje." });
  return trechos;
}

/**
 * O Chrome interrompe falas longas (cerca de 15 s) e o iPhone se atrapalha com textos grandes:
 * cada trecho vira pedaços de até `maximo` caracteres, quebrados no fim de frase.
 */
export function quebrarEmPedacos(texto: string, maximo = 220): string[] {
  const frases = texto.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [texto];
  const pedacos: string[] = [];
  let atual = "";
  for (const frase of frases) {
    const f = frase.trim();
    if (f === "") continue;
    if (atual !== "" && `${atual} ${f}`.length > maximo) {
      pedacos.push(atual);
      atual = f;
    } else {
      atual = atual === "" ? f : `${atual} ${f}`;
    }
  }
  if (atual !== "") pedacos.push(atual);
  return pedacos.flatMap((p) => {
    if (p.length <= maximo * 1.5) return [p];
    // Frase gigante sem ponto: quebra nas vírgulas ou no espaço mais próximo.
    const partes: string[] = [];
    let resto = p;
    while (resto.length > maximo) {
      const corte = Math.max(resto.lastIndexOf(",", maximo), resto.lastIndexOf(" ", maximo));
      const ponto = corte > maximo / 2 ? corte : maximo;
      partes.push(resto.slice(0, ponto + 1).trim());
      resto = resto.slice(ponto + 1).trim();
    }
    if (resto !== "") partes.push(resto);
    return partes;
  });
}

export const OUVIR_DISPONIVEL = typeof window !== "undefined" && "speechSynthesis" in window;

function escolherVoz(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices();
  return (
    vozes.find(
      (v) => v.lang === "pt-BR" && /natural|neural|google|luciana|francisca/i.test(v.name),
    ) ??
    vozes.find((v) => v.lang === "pt-BR") ??
    vozes.find((v) => v.lang.toLowerCase().startsWith("pt")) ??
    null
  );
}

export interface ControleDeOuvir {
  tocando: boolean;
  /** Trecho que está sendo lido (ou o último lido). */
  indice: number;
  total: number;
  rotulo: string;
  iniciar(): void;
  pausar(): void;
  continuar(): void;
  parar(): void;
  proximo(): void;
  anterior(): void;
}

/** Modo Ouvir: lê o briefing com a voz do sistema. A tela fica acesa enquanto toca, quando o aparelho deixa. */
export function useOuvir(trechos: Trecho[], velocidade: number): ControleDeOuvir {
  const [tocando, setTocando] = useState(false);
  const [indice, setIndice] = useState(0);
  const geracao = useRef(0);
  const trava = useRef<WakeLockSentinel | null>(null);

  const liberarTela = useCallback(() => {
    trava.current?.release().catch(() => undefined);
    trava.current = null;
  }, []);

  const falar = useCallback(
    (de: number) => {
      if (!OUVIR_DISPONIVEL) return;
      const minha = ++geracao.current;
      window.speechSynthesis.cancel();
      const ler = (i: number) => {
        if (minha !== geracao.current) return;
        const trecho = trechos[i];
        if (!trecho) {
          setTocando(false);
          liberarTela();
          return;
        }
        setIndice(i);
        const pedacos = quebrarEmPedacos(trecho.texto);
        const proximoPedaco = (p: number) => {
          if (minha !== geracao.current) return;
          const pedaco = pedacos[p];
          if (pedaco === undefined) return ler(i + 1);
          const fala = new SpeechSynthesisUtterance(pedaco);
          const voz = escolherVoz();
          if (voz) fala.voice = voz;
          fala.lang = voz?.lang ?? "pt-BR";
          fala.rate = velocidade;
          fala.onend = () => proximoPedaco(p + 1);
          fala.onerror = (e) => {
            if (e.error !== "interrupted" && e.error !== "canceled") proximoPedaco(p + 1);
          };
          window.speechSynthesis.speak(fala);
        };
        proximoPedaco(0);
      };
      setTocando(true);
      ler(de);
    },
    [trechos, velocidade, liberarTela],
  );

  const pedirTela = useCallback(async () => {
    try {
      trava.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      trava.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      geracao.current++;
      if (OUVIR_DISPONIVEL) window.speechSynthesis.cancel();
      liberarTela();
    },
    [liberarTela],
  );

  return {
    tocando,
    indice,
    total: trechos.length,
    rotulo: trechos[indice]?.rotulo ?? "",
    iniciar: () => {
      void pedirTela();
      falar(0);
    },
    pausar: () => {
      if (OUVIR_DISPONIVEL) window.speechSynthesis.pause();
      setTocando(false);
    },
    continuar: () => {
      if (!OUVIR_DISPONIVEL) return;
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      else falar(indice);
      setTocando(true);
    },
    parar: () => {
      geracao.current++;
      if (OUVIR_DISPONIVEL) window.speechSynthesis.cancel();
      setTocando(false);
      liberarTela();
    },
    proximo: () => falar(Math.min(indice + 1, trechos.length - 1)),
    anterior: () => falar(Math.max(indice - 1, 0)),
  };
}
