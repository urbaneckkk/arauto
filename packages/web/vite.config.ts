import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * O site fica em https://<usuário>.github.io/arauto/, então o caminho base é /arauto/.
 * Sem mapa de código (sourcemap) em produção, como manda o PLAN.md (seção 2.9).
 */
export default defineConfig({
  base: process.env.VITE_BASE ?? "/arauto/",
  plugins: [react()],
  build: { target: "es2022", sourcemap: false },
});
