# Plano de autenticação — Conecta-CT

## Problema hoje
- O login compara `SHA-256(senha)` **no navegador** com `usuarios.senha_hash`, lido com a chave `anon`.
- Qualquer visitante consegue baixar todos os hashes, e o papel (`master`) é só uma variável JS: não há autorização real no servidor.
- Enquanto o RLS estiver aberto para `anon`, qualquer pessoa pode ler, alterar ou apagar usuários e fichas.

## Alvo
Supabase Auth (e-mail + senha) + RLS por papel e por CT. A chave `anon` continua no frontend, mas sozinha não lê nada sensível.

## Arquivos SQL
| Arquivo | O que faz | Quando aplicar |
|---|---|---|
| `003_fichas_conselheiro.sql` | coluna `conselheiro_dest` | já |
| `004_usuarios_fichas_schema.sql` | versiona `usuarios`, `usuarios_pendentes`, `fichas`; índices únicos; coluna `auth_id` | já (idempotente, não muda RLS) |
| `005_auth_rls_APLICAR_DEPOIS.sql` | RLS por papel/CT, fecha o `anon` | **só após a etapa 4** |

## Etapas (nesta ordem)

### 0. Backup e schema — sem risco
1. Exportar `usuarios`, `usuarios_pendentes` e `fichas` (Table Editor → Export CSV).
2. Rodar o `004`. Se falhar em `uq_usuarios_email` ou `uq_fichas_protocolo`, há duplicados: corrija antes.

### 1. Ativar Supabase Auth
- Authentication → Providers → Email ligado. Se os conselheiros não usam e-mail real, desligue "Confirm email".
- URL Configuration: `Site URL` = `https://conecta-ct-final.vercel.app`.
- Senha mínima de 8 caracteres.

### 2. Migrar os usuários existentes (uma vez)
Os hashes SHA-256 **não** são importáveis para o Auth. Duas opções:
- **A (recomendada):** criar cada usuário em Authentication → Users com senha temporária e mandar link de redefinição. Depois vincular:
  `update usuarios u set auth_id = a.id from auth.users a where lower(a.email) = lower(u.email);`
- **B:** migração no primeiro login: uma Edge Function com `service_role` confere o hash antigo, cria o usuário no Auth e preenche `auth_id`. Dá mais trabalho; só vale com muitos usuários.

### 3. Aprovação de cadastros no servidor
Hoje o `approveUser` insere em `usuarios` direto do navegador. Trocar por uma **Edge Function `aprovar-usuario`** (ou rota em `api/`):
1. Valida o JWT do chamador e exige papel `master`.
2. Cria o usuário com `auth.admin.createUser({ email, password, email_confirm: true })`.
3. Insere em `usuarios` com `auth_id`, `role` (mapa cargo → role feito no servidor) e `ct`.
4. Marca o pedido como `aprovado`.

A `service_role` fica **só** na função (variável de ambiente), nunca no HTML.

A senha do solicitante não pode ficar guardada no pedido. Opções: (a) o solicitante cria a conta com `signUp` e o pedido só registra "aguardando"; a conta só é habilitada em `usuarios` (`ativo = true`) quando aprovada; ou (b) o master aprova e o usuário define a senha pelo link de "esqueci a senha". A opção (a) é a mais simples.

### 4. Ajustes no frontend (`index.html`)
- Carregar `@supabase/supabase-js` e criar o client com a chave `anon`.
- `doLogin`: `supabase.auth.signInWithPassword({ email, password })`; depois buscar `usuarios` por `auth_id` para montar `currentUser` (sem `senhaHash`).
- `doLogout`: `supabase.auth.signOut()` e limpar `localStorage` (`cct_fichasEnviadas`, `cct_fichasDB`).
- Sessão persistente: `getSession()` e `onAuthStateChange` na carga, para o F5 não deslogar.
- `_sbHeaders()`: usar `Authorization: Bearer <access_token>` da sessão (o client faz isso sozinho nas chamadas `supabase.from(...)`).
- Trocar `select=*` por colunas explícitas, sem `senha_hash`.
- `doRegister` continua criando pedido em `usuarios_pendentes` como `anon` (a única escrita que o `anon` mantém).
- No fim: `alter table usuarios drop column senha_hash;`.

### 5. Ligar o RLS
1. Testar em staging (branch do Supabase) com um usuário de cada papel.
2. Aplicar o `005`.
3. Checklist:
   - `anon`: `select` em `usuarios` e `fichas` volta vazio ou 401/403; `insert` em `usuarios_pendentes` funciona.
   - Atendente do CT A cria ficha do CT A e **não** vê fichas do CT B.
   - Conselheiro X vê a ficha direcionada a X e as sem destinatário, e **não** vê a direcionada a Y.
   - Master vê tudo e consegue aprovar.
   - Direcionar → o conselheiro vê a ficha em outro aparelho.
4. Restringir as políticas `anon` das tabelas antigas (rodapé do `005`) e fazer as rotas `api/*` validarem o JWT.

## Riscos e observações
- **Ordem importa:** aplicar o `005` antes de o frontend usar sessão derruba o sistema.
- **Cache:** após o deploy, peça Ctrl+F5 (arquivo único de 1,2 MB, sem versionamento).
- **`public/index.html` vs `index.html`:** unifique antes; o `vercel.json` publica `public/`.
- **Chaves:** a `anon` é pública por natureza e não precisa girar. Confirme que a `service_role` nunca entrou no Git (`git log -S service_role`).
- **Login de teste:** mantenha um master de emergência criado direto no painel do Supabase antes de ligar o RLS.
- **LGPD:** as fichas envolvem crianças. Próximo passo: tabela `auditoria` com trigger em `fichas` (quem leu/alterou).
