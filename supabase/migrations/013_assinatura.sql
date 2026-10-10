-- Assinatura do conselheiro (PNG tratado no navegador, guardado como data URL),
-- usada nos formulários gerados. Cada usuário já pode atualizar o próprio registro (011).
alter table usuarios add column if not exists assinatura_url text;
