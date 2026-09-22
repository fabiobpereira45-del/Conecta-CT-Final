-- Papel "coordenador": lê os 24 conselhos, mas só altera/exclui o próprio CT.
-- Aplicar ANTES do 005 (o cadastro já grava role = 'coordenador').

alter table usuarios           drop constraint if exists usuarios_role_check;
alter table usuarios_pendentes drop constraint if exists usuarios_pendentes_role_check;

alter table usuarios add constraint usuarios_role_check
  check (role in ('master','coordenador','conselheiro','atendente'));

-- usuarios_pendentes.role é só um rascunho do pedido; o papel real é definido na aprovação.
alter table usuarios_pendentes add constraint usuarios_pendentes_role_check
  check (role in ('master','coordenador','conselheiro','atendente'));

-- Coordenadores já aprovados como master por engano (cargo "Coordenador(a)"):
-- confira a lista antes de rodar o update.
--   select nome, email, ct, cargo, role from usuarios where role = 'master';
--   update usuarios set role = 'coordenador'
--    where cargo ilike 'coordenador%' and ct is not null and role = 'master';
