-- Conselhos e Bairros hoje é uma lista fixa no código (CONSELHOS_BAIRROS). Esta tabela
-- guarda as edições feitas pelo master (criar, editar, excluir), que passam a valer por
-- cima da lista original a cada carregamento da página.
create table if not exists conselhos_overrides (
  num        text primary key,          -- ex.: 'XIII' (mesmo "num" usado em CONSELHOS_BAIRROS)
  dados      jsonb,                     -- objeto completo do conselho, ou null se só excluído
  excluido   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.conselhos_overrides_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_conselhos_overrides_touch on conselhos_overrides;
create trigger trg_conselhos_overrides_touch before update on conselhos_overrides
  for each row execute function public.conselhos_overrides_touch();

alter table conselhos_overrides enable row level security;

drop policy if exists conselhos_overrides_rw on conselhos_overrides;
-- Transição: enquanto o 005 não for aplicado, acesso segue aberto ao app (o botão de
-- editar já só aparece para o master na tela). Depois do 005, troque para "to authenticated"
-- e adicione "and me_role() = 'master'" no check.
create policy conselhos_overrides_rw on conselhos_overrides for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on conselhos_overrides to anon, authenticated;
