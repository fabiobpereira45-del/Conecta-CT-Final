-- Migration 016: Permitir exclusão de requisições e mensagens para anon e authenticated
-- Necessário para que a exclusão física funcione mesmo utilizando a chave anon/public

create policy "anon delete requisicoes"
  on requisicoes for delete to anon, authenticated using (true);

create policy "anon delete mensagens"
  on requisicao_mensagens for delete to anon, authenticated using (true);
