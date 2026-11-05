-- Esquema inicial do ARAUTO (Etapa 1). Cada passo do pipeline fica gravado para depuração.
-- Nada aqui guarda o texto integral de matérias (briefing, "Arquitetura"): só títulos, URLs,
-- datas e os textos próprios do briefing.

create table execucoes (
  id uuid primary key,
  data date not null,
  tipo text not null check (tipo in ('diaria', 'atualizacao', 'plantao')),
  status text not null check (status in ('pendente', 'rodando', 'ok', 'falhou', 'abortado_por_custo')),
  criada_em timestamptz not null,
  atualizada_em timestamptz not null default now()
);
create index execucoes_data_idx on execucoes (data, criada_em desc);

create table passos (
  id bigserial primary key,
  execucao_id uuid not null references execucoes (id) on delete cascade,
  passo text not null,
  status text not null check (status in ('ok', 'falha', 'ignorado')),
  tentativa integer not null check (tentativa between 1 and 3),
  iniciado_em timestamptz not null,
  terminado_em timestamptz not null,
  resumo_entrada text not null,
  saida jsonb,
  erro text,
  usos jsonb not null default '[]'::jsonb
);
create index passos_execucao_idx on passos (execucao_id, id);

-- Livro-caixa: uma linha por chamada ao modelo. É daqui que sai o total do mês (MAX_USD_MES).
create table uso_modelo (
  id bigserial primary key,
  execucao_id uuid not null references execucoes (id) on delete cascade,
  passo text not null,
  modelo text not null,
  tokens_entrada integer not null,
  tokens_saida integer not null,
  tokens_cache_leitura integer not null,
  buscas integer not null,
  usd numeric(12, 6) not null check (usd >= 0),
  quando timestamptz not null
);
create index uso_modelo_quando_idx on uso_modelo (quando);

create table briefings (
  data date not null,
  versao integer not null check (versao >= 1),
  execucao_id uuid not null references execucoes (id),
  tipo text not null,
  criado_em timestamptz not null,
  briefing jsonb not null,
  avisos jsonb not null default '[]'::jsonb,
  primary key (data, versao)
);
