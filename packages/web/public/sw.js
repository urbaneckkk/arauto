/* Service worker do ARAUTO: deixa o app abrir sem internet.
 *  - Arquivos do app: responde do cache e atualiza em segundo plano.
 *  - Briefing (/briefing/*.json): tenta a rede primeiro (5 s) e, se falhar, usa o último guardado.
 *  - A página manda a lista do que já carregou ("guardar"), para o app abrir offline logo na 1ª visita.
 *
 * Detalhe importante: todo cache.match usa ignoreVary. Alguns servidores respondem "Vary: Origin" e
 * o navegador pede scripts de módulo com cabeçalhos diferentes dos de um cache.add(); sem ignoreVary
 * o arquivo está no cache mas não é encontrado, e o app abre em branco sem internet. */
const VERSAO = "arauto-v1";
const BASICOS = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg"];
const ACHAR = { ignoreVary: true };

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(BASICOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

async function redePrimeiro(requisicao) {
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await Promise.race([
      fetch(requisicao, { cache: "no-store" }),
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("tempo esgotado")), 5000)),
    ]);
    if (resposta.ok) await cache.put(requisicao, resposta.clone());
    return resposta;
  } catch {
    const guardada = await cache.match(requisicao, ACHAR);
    if (guardada) return guardada;
    return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  }
}

async function cacheDepoisRede(evento) {
  const requisicao = evento.request;
  const cache = await caches.open(VERSAO);
  const guardada = await cache.match(requisicao, ACHAR);
  const atualizando = fetch(requisicao)
    .then(async (resposta) => {
      if (resposta.ok) await cache.put(requisicao, resposta.clone());
      return resposta;
    })
    .catch(() => null);
  // Mantém o service worker vivo até a cópia nova ser guardada.
  evento.waitUntil(atualizando);
  if (guardada) return guardada;
  const resposta = await atualizando;
  if (resposta) return resposta;
  if (requisicao.mode === "navigate") {
    const inicio = await cache.match("./index.html", ACHAR);
    if (inicio) return inicio;
  }
  return new Response("Sem conexão.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;
  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/briefing/")) {
    evento.respondWith(redePrimeiro(requisicao));
    return;
  }
  evento.respondWith(cacheDepoisRede(evento));
});

/** Guarda o que a página usou e apaga scripts e estilos de versões antigas do app (nomes com hash). */
async function guardar(urls) {
  const cache = await caches.open(VERSAO);
  const mesmaOrigem = urls.filter(
    (u) => new URL(u, self.location.href).origin === self.location.origin,
  );
  await Promise.all(mesmaOrigem.map((u) => cache.add(u).catch(() => undefined)));
  const atuais = new Set(mesmaOrigem.map((u) => new URL(u, self.location.href).pathname));
  for (const chave of await cache.keys()) {
    const caminho = new URL(chave.url).pathname;
    if (/\/assets\/.*\.(js|css)$/.test(caminho) && !atuais.has(caminho)) await cache.delete(chave);
  }
}

self.addEventListener("message", (evento) => {
  const dados = evento.data;
  if (dados?.tipo !== "guardar" || !Array.isArray(dados.urls)) return;
  evento.waitUntil(guardar(dados.urls));
});
