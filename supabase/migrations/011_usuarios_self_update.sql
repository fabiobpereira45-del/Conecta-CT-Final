-- Bug: a política 005 só permite escrita em `usuarios` para o role master.
-- Conselheiros/coordenadores conseguem SELECT no próprio registro mas nenhuma
-- policy de UPDATE os cobre, então o PATCH em "Meu Perfil" afeta 0 linhas e
-- o Supabase responde 200 OK mesmo assim (o front mostra "salvo com sucesso"
-- só que nada persiste — ao recarregar, os dados antigos voltam).
--
-- Corrige permitindo que cada usuário atualize o próprio registro (auth_id =
-- auth.uid()), mas com um trigger que impede escalar privilégio: só o master
-- pode alterar role/ct/ativo de alguém.
create or replace function public.usuarios_bloqueia_autoescalada()
returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if public.me_role() <> 'master' then
    if new.role  is distinct from old.role
    or new.ct    is distinct from old.ct
    or new.ativo is distinct from old.ativo then
      raise exception 'Apenas o master pode alterar role, ct ou ativo.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_usuarios_bloqueia_autoescalada on usuarios;
create trigger trg_usuarios_bloqueia_autoescalada
  before update on usuarios
  for each row execute function public.usuarios_bloqueia_autoescalada();

drop policy if exists usuarios_self_update on usuarios;
create policy usuarios_self_update on usuarios for update to authenticated
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());
