-- Etapa 2: acesso por dispositivo e garantia de "uma execução paga por vez" (PLAN.md, seções 2.8 e 2.9).

-- Execução órfã de uma versão anterior (processo morto no meio) não pode impedir o índice abaixo.
update execucoes set status = 'falhou', atualizada_em = now() where status = 'rodando';

-- No máximo UMA execução 'rodando' em todo o banco. É o banco, e não a memória do processo, que
-- impede duas execuções pagas ao mesmo tempo (dois cliques, dois aparelhos, deploy sobreposto).
create unique index execucoes_uma_rodando on execucoes ((true)) where status = 'rodando';

-- Cada aparelho pareado. O token em si NUNCA é guardado, só o hash SHA-256 (o token tem 256 bits
-- aleatórios, então um hash rápido basta).
create table dispositivos (
  id uuid primary key,
  nome text not null check (char_length(nome) between 1 and 60),
  token_hash text not null unique,
  criado_em timestamptz not null,
  ultimo_uso_em timestamptz,
  revogado_em timestamptz
);

-- Códigos de pareamento de uso único. Também só o hash.
create table codigos_pareamento (
  codigo_hash text primary key,
  criado_em timestamptz not null,
  expira_em timestamptz not null,
  tentativas integer not null default 0 check (tentativas >= 0),
  usado_em timestamptz
);
