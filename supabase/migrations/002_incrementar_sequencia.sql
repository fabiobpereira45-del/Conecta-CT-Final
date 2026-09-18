-- Função para incrementar sequência de forma atômica
create or replace function incrementar_sequencia(p_chave text)
returns integer
language plpgsql
security definer
as $$
declare
  v_novo integer;
begin
  update sequencias
     set valor = valor + 1
   where chave = p_chave
  returning valor into v_novo;

  if v_novo is null then
    raise exception 'Sequência "%" não encontrada.', p_chave;
  end if;

  return v_novo;
end;
$$;

-- Permissão para anon chamar a função
grant execute on function incrementar_sequencia(text) to anon;
grant execute on function incrementar_sequencia(text) to service_role;
