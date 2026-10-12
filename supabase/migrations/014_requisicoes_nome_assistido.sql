-- Adiciona o nome do assistido (pessoa a quem a certidão se refere) à requisição,
-- para exibição no modal de visualização de "Minhas Requisições".
alter table requisicoes
  add column if not exists nome_assistido text;
