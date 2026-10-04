-- Configuração da Escala de Plantões (nomes por conselho, sábado de referência e grupo).
-- Uma única linha (id = 'plantao'). Só o master edita pela tela; a leitura é liberada para
-- o app, como em conselhos_overrides.
create table if not exists escala_config (
  id         text primary key,
  dados      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table escala_config enable row level security;

drop policy if exists escala_config_rw on escala_config;
create policy escala_config_rw on escala_config for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on escala_config to anon, authenticated;
