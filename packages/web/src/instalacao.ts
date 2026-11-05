import { useSyncExternalStore } from "react";

export type Plataforma = "ios" | "android" | "computador";

/** iPadOS 13+ se apresenta como Mac; o que o entrega é a tela de toque. */
export function detectarPlataforma(userAgent: string, pontosDeToque: number): Plataforma {
  if (/iPhone|iPod|iPad/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && pontosDeToque > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "computador";
}

/** "Safari de verdade" no iOS (Chrome, Firefox e Edge no iPhone trazem CriOS/FxiOS/EdgiOS no texto). */
export function ehSafariDoIos(userAgent: string): boolean {
  return /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(userAgent);
}

interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface Estado {
  evento: EventoDeInstalacao | null;
  instalado: boolean;
}

let estado: Estado = { evento: null, instalado: false };
const ouvintes = new Set<() => void>();

function mudar(novo: Estado): void {
  estado = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

export function emModoApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Guarda o convite de instalação do Chrome/Edge/Android para oferecer o botão "Instalar" na hora certa. */
export function iniciarCapturaDeInstalacao(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    mudar({ ...estado, evento: e as EventoDeInstalacao });
  });
  window.addEventListener("appinstalled", () => mudar({ evento: null, instalado: true }));
}

function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso);
  return () => ouvintes.delete(aviso);
}

export function useInstalacao() {
  const atual = useSyncExternalStore(
    assinar,
    () => estado,
    () => estado,
  );
  return {
    podeInstalar: atual.evento !== null,
    instalado: atual.instalado || emModoApp(),
    async instalar(): Promise<void> {
      const evento = estado.evento;
      if (!evento) return;
      await evento.prompt();
      await evento.userChoice;
      mudar({ ...estado, evento: null });
    },
  };
}
