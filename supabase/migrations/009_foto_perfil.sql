-- Foto de perfil do usuário. Guardada como data URL (base64) direto na coluna —
-- simples e sem precisar configurar um bucket de Storage. Por isso o app limita o
-- upload a ~1,5 MB por imagem (ver handleAvatarUpload em index.html).
alter table usuarios add column if not exists foto_url text;
