-- Escopo das notícias: 'bahia' (tudo sobre infância e adolescência no estado) ou
-- 'brasil' (só ECA, Conanda e novas leis). Usado para identificar a origem no portal e na moderação.
alter table noticias add column if not exists escopo text not null default 'bahia'
  check (escopo in ('bahia', 'brasil'));
