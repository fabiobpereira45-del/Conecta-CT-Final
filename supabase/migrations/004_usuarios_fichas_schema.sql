-- ── Tabelas que o frontend já usa mas que não estavam versionadas ───────────
-- Idempotente: pode rodar em cima do banco atual sem perder dados.
-- NÃO altera RLS (isso é o 005, só aplicar depois de migrar o login).

create extension if not exists "pgcrypto";

-- Usuários aprovados
create table if not exists usuarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null,
  senha_hash  text,                      -- legado; some após migrar para Supabase Auth
  ct          text,                      -- ex: CTXIII (null para master)
  cargo       text,
  role        text not null default 'conselheiro'
              check (role in ('master','conselheiro','atendente')),
  telefone    text,
  ativo       boolean not null default true,
  auth_id     uuid unique,               -- vínculo com auth.users (preenchido na migração)
  created_at  timestamptz not null default now()
);
-- Garante as colunas novas caso a tabela já existisse
alter table usuarios add column if not exists auth_id uuid unique;
alter table usuarios add column if not exists telefone text;

create unique index if not exists uq_usuarios_email on usuarios (lower(email));
create index if not exists idx_usuarios_ct on usuarios (ct);

-- Pedidos de cadastro
create table if not exists usuarios_pendentes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null,
  senha_hash  text,
  cargo       text,
  ct          text,
  status      text not null default 'pendente'
              check (status in ('pendente','aprovado','rejeitado')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_pendentes_status on usuarios_pendentes (status);

-- Fichas de atendimento
create table if not exists fichas (
  id               uuid primary key default gen_random_uuid(),
  protocolo        text not null,
  nome_crianca     text,
  tipo             text default 'Atendimento',
  enviado_por      text,
  ct_destino       text,
  conselheiro_dest text,
  data_hora        text,
  form_id          integer default 0,
  campos_snapshot  jsonb not null default '{}'::jsonb,
  dados            jsonb not null default '{}'::jsonb,
  lida             boolean not null default false,
  created_at       timestamptz not null default now()
);
alter table fichas add column if not exists conselheiro_dest text;

-- O frontend faz upsert por protocolo (merge-duplicates): precisa ser único.
-- Se falhar aqui, existem protocolos repetidos: resolva antes de continuar.
create unique index if not exists uq_fichas_protocolo on fichas (protocolo);
create index if not exists idx_fichas_ct_created on fichas (ct_destino, created_at desc);
create index if not exists idx_fichas_conselheiro_dest on fichas (conselheiro_dest);
