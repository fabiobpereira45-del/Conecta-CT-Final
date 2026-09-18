-- ── Conecta-CT: schema inicial ──────────────────────────────────────────────

-- Extensão para UUID
create extension if not exists "pgcrypto";

-- ── REQUISIÇÕES DE CERTIDÃO ─────────────────────────────────────────────────
create table if not exists requisicoes (
  id            uuid primary key default gen_random_uuid(),
  protocolo     text unique not null,          -- Ex: REQ-2026/09-001
  data          timestamptz not null default now(),
  solicitante   text not null,
  solicitante_ct text not null,               -- Ex: CT01
  cartorio      text not null,
  subdistrito   text,
  email_destino text not null,
  tipo          text not null,                -- Nascimento | Casamento | Óbito
  status        text not null default 'Enviada'
                check (status in ('Enviada','Em andamento','Concluída','Cancelada','Respondida')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── MENSAGENS / HISTÓRICO POR REQUISIÇÃO ────────────────────────────────────
create table if not exists requisicao_mensagens (
  id              uuid primary key default gen_random_uuid(),
  requisicao_id   uuid not null references requisicoes(id) on delete cascade,
  origem          text not null check (origem in ('sistema','cartorio','conselheiro')),
  assunto         text,
  corpo           text,
  email_remetente text,
  lida            boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── PROTOCOLOS DE ATENDIMENTO ────────────────────────────────────────────────
create table if not exists atendimentos (
  id          uuid primary key default gen_random_uuid(),
  protocolo   text unique not null,           -- Ex: 2026/09/001
  data        timestamptz not null default now(),
  conselheiro text not null,
  ct          text not null,
  created_at  timestamptz not null default now()
);

-- ── CONTADOR DE SEQUÊNCIA ────────────────────────────────────────────────────
create table if not exists sequencias (
  chave   text primary key,
  valor   integer not null default 0
);

insert into sequencias (chave, valor) values
  ('requisicao', 0),
  ('atendimento', 0)
on conflict (chave) do nothing;

-- ── TRIGGERS: atualizar updated_at ──────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_requisicoes_updated
  before update on requisicoes
  for each row execute function set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table requisicoes enable row level security;
alter table requisicao_mensagens enable row level security;
alter table atendimentos enable row level security;
alter table sequencias enable row level security;

-- Política: service_role tem acesso total (usado pelo backend/polling)
create policy "service_role full access requisicoes"
  on requisicoes for all to service_role using (true) with check (true);

create policy "service_role full access mensagens"
  on requisicao_mensagens for all to service_role using (true) with check (true);

create policy "service_role full access atendimentos"
  on atendimentos for all to service_role using (true) with check (true);

create policy "service_role full access sequencias"
  on sequencias for all to service_role using (true) with check (true);

-- Política: anon pode ler e inserir (frontend sem auth por enquanto)
create policy "anon read requisicoes"
  on requisicoes for select to anon using (true);

create policy "anon insert requisicoes"
  on requisicoes for insert to anon with check (true);

create policy "anon update status requisicoes"
  on requisicoes for update to anon using (true) with check (true);

create policy "anon read mensagens"
  on requisicao_mensagens for select to anon using (true);

create policy "anon insert mensagens"
  on requisicao_mensagens for insert to anon with check (true);

create policy "anon insert atendimentos"
  on atendimentos for insert to anon with check (true);

create policy "anon read atendimentos"
  on atendimentos for select to anon using (true);

create policy "anon read sequencias"
  on sequencias for select to anon using (true);

create policy "anon update sequencias"
  on sequencias for update to anon using (true) with check (true);
