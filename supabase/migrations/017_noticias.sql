-- Notícias sobre infância e adolescência coletadas automaticamente (RSS) para o portal público.
-- Fluxo: o coletor (api/noticias/coletar) grava aqui; fontes oficiais e notícias de leis/campanhas
-- entram como 'publicada'; notícias de violência e de imprensa geral entram como 'pendente' e só
-- aparecem no portal depois que um conselheiro aprova na tela "Notícias" do sistema.
--
-- Só a API (service_role) acessa esta tabela: RLS ligado e nenhuma policy para anon/authenticated.
create table if not exists noticias (
  id            uuid primary key default gen_random_uuid(),
  chave         text not null unique,          -- hash do título normalizado (evita duplicar a mesma notícia)
  url           text not null,
  titulo        text not null,
  resumo        text,                          -- trecho curto (máx. ~240 caracteres); nunca a matéria inteira
  fonte         text not null,                 -- nome do veículo/órgão
  fonte_tipo    text not null check (fonte_tipo in ('oficial', 'imprensa')),
  categoria     text not null check (categoria in ('legislacao', 'politica', 'campanha', 'violacao', 'geral')),
  status        text not null default 'pendente' check (status in ('publicada', 'pendente', 'rejeitada')),
  motivo        text,                          -- ex.: auto-oficial, auto-legislacao, violacao, imprensa-geral, manual
  publicada_em  timestamptz not null,          -- data da notícia original
  coletada_em   timestamptz not null default now(),
  moderada_por  text,
  moderada_em   timestamptz
);

create index if not exists noticias_status_data_idx on noticias (status, publicada_em desc);
create index if not exists noticias_coletada_idx on noticias (coletada_em desc);

alter table noticias enable row level security;
revoke all on noticias from anon, authenticated;
