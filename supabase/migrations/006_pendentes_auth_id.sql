-- Cadastro passa a criar a conta no Supabase Auth (signUp) e o pedido guarda o auth_id.
-- A senha não é mais armazenada em usuarios_pendentes. Idempotente.
alter table usuarios_pendentes add column if not exists auth_id uuid;
