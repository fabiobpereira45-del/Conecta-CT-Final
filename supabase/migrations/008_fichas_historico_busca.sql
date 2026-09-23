-- ════════════════════════════════════════════════════════════════════════════
-- 008 — Ficha de Atendimento (formulário 03): complemento do conselheiro,
--        colunas de busca e histórico permanente de ações.
-- Idempotente. Aplicar ANTES de publicar o frontend que usa estas colunas.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Novas colunas em fichas
alter table fichas add column if not exists conselheiro_dest_id uuid;
alter table fichas add column if not exists criado_por_id       uuid;
alter table fichas add column if not exists status              text default 'direcionada';
alter table fichas add column if not exists dados_conselheiro   jsonb not null default '{}'::jsonb;
alter table fichas add column if not exists updated_at          timestamptz default now();

-- Campos de busca (preenchidos pelo frontend a partir da seção do atendente)
alter table fichas add column if not exists nome_mae         text;
alter table fichas add column if not exists nome_pai         text;
alter table fichas add column if not exists nome_responsavel text;
alter table fichas add column if not exists cpf_mae          text;   -- só dígitos
alter table fichas add column if not exists cpf_pai          text;
alter table fichas add column if not exists cpf_responsavel  text;
alter table fichas add column if not exists busca_crianca    text;   -- nome sem acento, minúsculo
alter table fichas add column if not exists busca_genitores  text;   -- mãe | pai | responsável, sem acento
alter table fichas add column if not exists busca_cpfs       text;   -- CPFs só com dígitos, separados por espaço

create index if not exists idx_fichas_created_at    on fichas (created_at desc);
create index if not exists idx_fichas_dest_id       on fichas (conselheiro_dest_id);
create index if not exists idx_fichas_busca_cpfs    on fichas (busca_cpfs);

-- Busca parcial por nome (ilike '%texto%') com índice trigram
create extension if not exists pg_trgm;
create index if not exists idx_fichas_busca_crianca_trgm   on fichas using gin (busca_crianca gin_trgm_ops);
create index if not exists idx_fichas_busca_genitores_trgm on fichas using gin (busca_genitores gin_trgm_ops);

-- 2) Histórico de ações — somente inserção, nunca alteração ou exclusão
create table if not exists fichas_historico (
  id            uuid primary key default gen_random_uuid(),
  protocolo     text not null,
  acao          text not null,          -- criada, direcionada, visualizada, complemento_salvo,
                                        -- remetida, encaminhada, assumida, excluida
  usuario_id    uuid,                   -- id em usuarios (informado pelo app)
  usuario_nome  text,
  usuario_role  text,
  usuario_ct    text,
  usuario_auth  uuid,                   -- preenchido pelo banco (auth.uid()), não pelo app
  detalhes      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_hist_protocolo on fichas_historico (protocolo, created_at);
create index if not exists idx_hist_created   on fichas_historico (created_at desc);

-- Data/hora e usuário autenticado são definidos pelo banco (o app não consegue forjar)
create or replace function public.fichas_historico_before_insert() returns trigger
language plpgsql as $$
begin
  new.created_at   := now();
  new.usuario_auth := auth.uid();
  return new;
end $$;

drop trigger if exists trg_fichas_historico_bi on fichas_historico;
create trigger trg_fichas_historico_bi before insert on fichas_historico
  for each row execute function public.fichas_historico_before_insert();

-- Bloqueia UPDATE e DELETE para todos (inclusive via SQL do app)
create or replace function public.fichas_historico_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'fichas_historico é somente inserção: registros não podem ser alterados nem excluídos';
end $$;

drop trigger if exists trg_fichas_historico_imutavel on fichas_historico;
create trigger trg_fichas_historico_imutavel before update or delete on fichas_historico
  for each row execute function public.fichas_historico_imutavel();

alter table fichas_historico enable row level security;

drop policy if exists hist_select on fichas_historico;
drop policy if exists hist_insert on fichas_historico;
-- Transição: enquanto o 005 não for aplicado, leitura e inserção seguem abertas ao app.
-- Depois do 005, troque "to anon, authenticated" por "to authenticated".
create policy hist_select on fichas_historico for select to anon, authenticated using (true);
create policy hist_insert on fichas_historico for insert to anon, authenticated with check (true);

revoke all on fichas_historico from anon, authenticated;
grant select, insert on fichas_historico to anon, authenticated;

-- 3) Garante acesso às colunas novas de fichas
grant select, insert, update, delete on fichas to anon, authenticated;
