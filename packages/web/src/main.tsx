import "@fontsource/sofia-sans/latin-400.css";
import "@fontsource/sofia-sans/latin-600.css";
import "@fontsource/sofia-sans/latin-700.css";
import "@fontsource/sofia-sans-extra-condensed/latin-700.css";
import "@fontsource/sofia-sans-extra-condensed/latin-800.css";
import "@fontsource/spectral/latin-300.css";
import "@fontsource/spectral/latin-400.css";
import "@fontsource/spectral/latin-400-italic.css";
import "./temas.css";
import "./estilos.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { iniciarCapturaDeInstalacao } from "./instalacao";

iniciarCapturaDeInstalacao();

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("Faltou o elemento #raiz no index.html");
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Offline: registra o service worker (só no site publicado) e, depois que a página carregou,
 * manda para ele a lista de tudo o que foi usado (scripts, estilos, fontes) para guardar.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registro) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter(
            (nome) =>
              new URL(nome).origin === window.location.origin && !nome.includes("/briefing/"),
          );
        registro.active?.postMessage({ tipo: "guardar", urls });
      })
      .catch(() => undefined);
  });
}
