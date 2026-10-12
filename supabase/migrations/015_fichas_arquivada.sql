-- Permite arquivar fichas na caixa "Fichas Recebidas" sem excluí-las,
-- podendo ser desarquivadas depois.
alter table fichas
  add column if not exists arquivada boolean not null default false;
