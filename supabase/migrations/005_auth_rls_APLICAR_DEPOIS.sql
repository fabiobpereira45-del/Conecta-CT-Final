-- ════════════════════════════════════════════════════════════════════════════
-- ATENÇÃO: só aplicar DEPOIS de o frontend usar Supabase Auth (ver docs/AUTH_PLAN.md).
-- Este script tira o acesso do papel `anon` às tabelas sensíveis; com o login
-- atual (chave anon + senha_hash no cliente) o sistema para de funcionar.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Funções auxiliares (security definer evita recursão de RLS em `usuarios`)
create or replace function public.me_role() returns text
language sql stable security definer set search_path = public as $$
  select role from usuarios where auth_id = auth.uid() and ativo limit 1 $$;

create or replace function public.me_ct() returns text
language sql stable security definer set search_path = public as $$
  select ct from usuarios where auth_id = auth.uid() and ativo limit 1 $$;

create or replace function public.me_nome() returns text
language sql stable security definer set search_path = public as $$
  select nome from usuarios where auth_id = auth.uid() and ativo limit 1 $$;

revoke all on function public.me_role(), public.me_ct(), public.me_nome() from public, anon;
grant execute on function public.me_role(), public.me_ct(), public.me_nome() to authenticated;

-- 2) Ligar RLS e remover qualquer política antiga aberta
alter table usuarios           enable row level security;
alter table usuarios_pendentes enable row level security;
alter table fichas             enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('usuarios','usuarios_pendentes','fichas')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

revoke all on usuarios, usuarios_pendentes, fichas from anon;

-- 3) usuarios: cada um lê o próprio registro; colegas do mesmo CT se enxergam
--    (necessário para a lista "Direcionar"); master lê e altera tudo.
create policy usuarios_select on usuarios for select to authenticated
  using ( auth_id = auth.uid()
          or me_role() = 'master'
          or (ct is not null and ct = me_ct()) );
create policy usuarios_master_write on usuarios for all to authenticated
  using (me_role() = 'master') with check (me_role() = 'master');
-- Obs.: depois da migração, dropar a coluna senha_hash para ela nunca chegar ao cliente.

-- 4) usuarios_pendentes: qualquer visitante pode CRIAR um pedido (status fixo 'pendente');
--    só o master lê/aprova/recusa.
create policy pendentes_insert on usuarios_pendentes for insert to anon, authenticated
  with check (status = 'pendente');
create policy pendentes_master on usuarios_pendentes for all to authenticated
  using (me_role() = 'master') with check (me_role() = 'master');
grant insert on usuarios_pendentes to anon;

-- 5) fichas
--    - atendente: cria/lê/edita fichas do próprio CT
--    - conselheiro: lê/edita fichas do CT direcionadas a ele (ou sem destinatário)
--    - master: tudo
create policy fichas_select on fichas for select to authenticated
  using ( me_role() = 'master'
       or ( ct_destino = me_ct()
            and ( me_role() = 'atendente'
               or conselheiro_dest is null
               or conselheiro_dest = me_nome() ) ) );

create policy fichas_insert on fichas for insert to authenticated
  with check ( me_role() = 'master'
            or (me_role() in ('atendente','conselheiro') and ct_destino = me_ct()) );

create policy fichas_update on fichas for update to authenticated
  using ( me_role() = 'master'
       or ( ct_destino = me_ct()
            and ( me_role() = 'atendente'
               or conselheiro_dest is null
               or conselheiro_dest = me_nome() ) ) )
  with check ( me_role() = 'master' or ct_destino = me_ct() );

create policy fichas_delete on fichas for delete to authenticated
  using ( me_role() = 'master'
       or (ct_destino = me_ct() and conselheiro_dest = me_nome()) );

grant select, insert, update, delete on usuarios, fichas to authenticated;
grant select, update on usuarios_pendentes to authenticated;

-- 6) Tabelas antigas (requisicoes, atendimentos, sequencias, requisicao_mensagens)
--    ainda têm políticas "anon ..." do 001_initial.sql. Quando o frontend usar sessão,
--    troque-as por políticas para `authenticated`, por exemplo:
--      drop policy "anon read requisicoes" on requisicoes;
--      create policy req_auth on requisicoes for all to authenticated using (true) with check (true);
