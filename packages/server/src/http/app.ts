import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { RepositorioDoServico } from "../repo/repositorio.js";
import type { Acesso } from "../servico/acesso.js";
import type { Orquestrador } from "../servico/orquestrador.js";
import type { Relogio } from "../util/tempo.js";
import { registrarRotas } from "./rotas.js";

/** Origens das cascas nativas (Tauri e Capacitor). A própria web é da mesma origem e não precisa de CORS. */
export const ORIGENS_DAS_CASCAS = [
  "https://tauri.localhost",
  "http://tauri.localhost",
  "capacitor://localhost",
  "https://localhost",
];

/** O corpo de qualquer requisição é minúsculo (um código de pareamento). */
export const LIMITE_DO_CORPO_BYTES = 8 * 1024;

export interface ConfigDaApi {
  /** Origens extras aceitas pelo CORS. */
  origensPermitidas: string[];
  /** Quantos proxies confiáveis existem na frente (0 em casa; no Railway, 1). */
  confiarProxySaltos: number;
  /** Pasta do build da web. Se não existir, o servidor serve só a API. */
  webDist?: string | undefined;
  /** Falso só nos testes que provam que as travas do banco funcionam sozinhas. */
  limiteDeTaxa?: boolean;
  /** Falso em desenvolvimento e nos testes: `upgrade-insecure-requests` quebra o http://localhost. */
  producao?: boolean;
  /** `false` apaga o log; um objeto aceita um destino (nos testes, para conferir o que é logado). */
  log?: false | { stream?: NodeJS.WritableStream };
}

export interface DependenciasDaApi {
  repo: RepositorioDoServico;
  acesso: Acesso;
  orquestrador: Orquestrador;
  relogio: Relogio;
  config: ConfigDaApi;
}

const UM_MINUTO = 60_000;
const UMA_HORA = 60 * UM_MINUTO;

/** Não existe cabeçalho que se confie em quem chama: o limite é por IP, como o servidor o vê. */
const chaveDoLimite = (req: { ip: string }) => req.ip;

/**
 * Só um caminho "limpo" cai na página da interface (/lab, /instalar). Qualquer trecho oculto
 * (".env", ".git", ".."), nome de arquivo com ponto ("/app.js") ou caractere estranho é 404 de
 * verdade. O caminho é decodificado antes de julgar, para "%2eenv" valer o mesmo que ".env".
 */
function ehRotaDaInterface(caminhoBruto: string): boolean {
  let caminho: string;
  try {
    caminho = decodeURIComponent(caminhoBruto);
  } catch {
    return false;
  }
  if (caminho.includes("\\") || caminho.includes("\0")) return false;
  const partes = caminho.split("/");
  if (partes.some((parte) => parte.startsWith("."))) return false;
  return !(partes.at(-1) ?? "").includes(".");
}

export async function criarApp(deps: DependenciasDaApi): Promise<FastifyInstance> {
  const { config } = deps;
  const producao = config.producao ?? false;

  const opcoes: FastifyServerOptions = {
    logger:
      config.log === false
        ? false
        : {
            level: "info",
            // O token nunca pode ir para o log, nem por engano.
            redact: { paths: ["req.headers.authorization", "req.headers.cookie"], remove: true },
            ...(config.log?.stream ? { stream: config.log.stream } : {}),
          },
    // Confia só nos N proxies mais próximos (o do Railway). Mais que isso deixa o cliente forjar o IP.
    trustProxy:
      config.confiarProxySaltos > 0
        ? (_endereco, salto) => salto < config.confiarProxySaltos
        : false,
    bodyLimit: LIMITE_DO_CORPO_BYTES,
  };
  const app = Fastify(opcoes);

  // --- Cabeçalhos de segurança ---
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        // Os temas rodam em iframe com sandbox (PLAN.md, D9).
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: producao ? [] : null,
      },
    },
  });

  // --- CORS: só a web, as cascas e o que o dono liberar. O acesso é por token no cabeçalho
  // (nunca cookie), então CORS não é a defesa; é só higiene. ---
  const origens = new Set([...ORIGENS_DAS_CASCAS, ...config.origensPermitidas]);
  await app.register(cors, {
    origin: (origem, retorno) => retorno(null, origem === undefined || origens.has(origem)),
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "If-None-Match"],
    exposedHeaders: ["ETag", "Retry-After"],
    maxAge: 600,
  });

  // --- Limite de taxa por IP, só nas rotas /api (os arquivos da web não entram na conta) ---
  const limiteLigado = config.limiteDeTaxa ?? true;
  if (limiteLigado) {
    await app.register(rateLimit, {
      global: false,
      keyGenerator: chaveDoLimite,
      errorResponseBuilder: (_req, contexto) => ({
        statusCode: 429,
        erro: "muitas_requisicoes",
        mensagem: "Muitas requisições. Espere um pouco e tente de novo.",
        tentarEmSegundos: Math.max(1, Math.ceil(contexto.ttl / 1000)),
      }),
    });
  }
  const limite = (max: number, janelaMs: number) =>
    limiteLigado ? { max, timeWindow: janelaMs, keyGenerator: chaveDoLimite } : {};

  // --- Erros: nunca devolvem mensagem interna, pilha de chamadas nem o que foi enviado ---
  app.setErrorHandler((erro: FastifyError | (Error & { statusCode?: number }), req, reply) => {
    const status = typeof erro.statusCode === "number" ? erro.statusCode : 500;
    if (status === 429) {
      const corpo = erro as unknown as { tentarEmSegundos?: number };
      return reply.code(429).send({
        erro: "muitas_requisicoes",
        mensagem: "Muitas requisições. Espere um pouco e tente de novo.",
        tentarEmSegundos: corpo.tentarEmSegundos ?? null,
      });
    }
    if (status === 413) return reply.code(413).send({ erro: "corpo_grande_demais" });
    if (status === 415) return reply.code(415).send({ erro: "tipo_de_conteudo_nao_suportado" });
    if (status >= 400 && status < 500) return reply.code(400).send({ erro: "requisicao_invalida" });
    req.log.error({ codigo: (erro as FastifyError).code, mensagem: erro.message }, "erro interno");
    return reply.code(500).send({ erro: "erro_interno" });
  });

  // Resposta da API que mostra estado ou gasta dinheiro nunca é guardada por navegador ou proxy.
  app.addHook("onSend", async (req, reply, carga) => {
    if (req.url.startsWith("/api/") && !reply.hasHeader("cache-control")) {
      reply.header("Cache-Control", "no-store");
    }
    return carga;
  });

  registrarRotas(app, {
    repo: deps.repo,
    acesso: deps.acesso,
    orquestrador: deps.orquestrador,
    relogio: deps.relogio,
    limites: {
      leitura: limite(120, UM_MINUTO),
      escrita: limite(10, UMA_HORA),
      // 5 tentativas por 10 minutos por IP, além das 5 por código (PLAN.md, seção 2.8, item 2).
      pareamento: limite(5, 10 * UM_MINUTO),
      saude: limite(60, UM_MINUTO),
    },
  });

  // --- Arquivos da web: só de dentro de `webDist`, sem arquivos ocultos nem listagem ---
  const raiz = config.webDist ? resolve(config.webDist) : null;
  const temWeb = raiz !== null && existsSync(join(raiz, "index.html"));
  if (temWeb && raiz) {
    await app.register(fastifyStatic, {
      root: raiz,
      prefix: "/",
      index: ["index.html"],
      list: false,
      dotfiles: "ignore", // arquivo oculto responde 404, como se não existisse
      cacheControl: false,
      etag: true,
      // Segunda cerca: nenhum trecho do caminho pode começar com ponto (".env", ".git", "..").
      allowedPath: (caminho) => !caminho.split("/").some((parte) => parte.startsWith(".")),
      setHeaders: (reply, caminho) => {
        const nome = caminho.split(/[\\/]/).pop() ?? "";
        if (["index.html", "sw.js", "manifest.webmanifest"].includes(nome)) {
          reply.header("Cache-Control", "no-cache"); // sempre revalida: é como a web se atualiza
        } else if (/[\\/]assets[\\/]/.test(caminho)) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable"); // nome com hash
        } else {
          reply.header("Cache-Control", "public, max-age=3600");
        }
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const caminho = req.url.split("?")[0] ?? "";
    const ehApi = caminho === "/api" || caminho.startsWith("/api/");
    // Rota da interface (/lab, /instalar): devolve a página. Arquivo que não existe: 404 de verdade.
    if (temWeb && req.method === "GET" && !ehApi && ehRotaDaInterface(caminho)) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ erro: "nao_encontrado" });
  });

  return app;
}
