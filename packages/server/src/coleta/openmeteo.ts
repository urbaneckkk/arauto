import { z } from "zod";
import type { Transporte } from "../infra/transporte.js";
import type { DadosDoTempo } from "./tipos.js";

/** Curitiba. Open-Meteo é gratuito para uso não comercial e exige atribuição CC-BY 4.0. */
const LATITUDE = -25.4284;
const LONGITUDE = -49.2733;

export const URL_OPEN_METEO =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code" +
  "&timezone=America%2FSao_Paulo&forecast_days=1";

const RespostaSchema = z.object({
  daily: z.object({
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
    precipitation_probability_max: z.array(z.number().nullable()).min(1),
    precipitation_sum: z.array(z.number().nullable()).min(1),
    weather_code: z.array(z.number()).min(1),
  }),
});

/** Códigos WMO usados pelo Open-Meteo, em português. */
export function descricaoDoCodigoWmo(codigo: number): string {
  if (codigo === 0) return "céu limpo";
  if (codigo === 1) return "predomínio de sol";
  if (codigo === 2) return "parcialmente nublado";
  if (codigo === 3) return "nublado";
  if (codigo === 45 || codigo === 48) return "neblina";
  if (codigo >= 51 && codigo <= 57) return "garoa";
  if (codigo >= 61 && codigo <= 67) return "chuva";
  if (codigo >= 71 && codigo <= 77) return "neve";
  if (codigo >= 80 && codigo <= 82) return "pancadas de chuva";
  if (codigo === 85 || codigo === 86) return "pancadas de neve";
  if (codigo === 95) return "trovoadas";
  if (codigo === 96 || codigo === 99) return "trovoadas com granizo";
  return "tempo variável";
}

export async function lerTempo(transporte: Transporte): Promise<DadosDoTempo> {
  const resposta = await transporte.get(URL_OPEN_METEO);
  if (resposta.status !== 200) throw new Error(`Open-Meteo respondeu ${resposta.status}`);
  const { daily } = RespostaSchema.parse(JSON.parse(resposta.corpo));
  const codigo = daily.weather_code[0] ?? 0;
  return {
    minC: daily.temperature_2m_min[0] ?? 0,
    maxC: daily.temperature_2m_max[0] ?? 0,
    chuvaPct: Math.round(daily.precipitation_probability_max[0] ?? 0),
    chuvaMm: daily.precipitation_sum[0] ?? 0,
    codigoDoTempo: codigo,
    descricaoDoTempo: descricaoDoCodigoWmo(codigo),
  };
}
