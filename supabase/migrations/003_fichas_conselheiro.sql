-- Conselheiro para quem a ficha foi direcionada pelo atendente
alter table if exists fichas add column if not exists conselheiro_dest text;
create index if not exists idx_fichas_conselheiro_dest on fichas (conselheiro_dest);
