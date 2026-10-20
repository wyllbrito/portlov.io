# Contas, convites e colaboração

## O que configurar no Supabase

1. No **SQL Editor**, execute **todo** o arquivo [002-accounts-collaboration.sql](002-accounts-collaboration.sql). A transação desfaz as alterações se detectar incompatibilidade. A migração pode ser repetida e aproveita `projects(id UUID, owner_id UUID)` e sua tabela `profiles(id UUID, email TEXT NOT NULL, role TEXT)`. Ela ainda não foi executada no banco remoto.
2. Em **Authentication → Sign In / Providers → Email**, habilite cadastro e entrada por e-mail/senha. Se **Confirm email** estiver ligado, a pessoa precisa confirmar o e-mail antes de participar do espaço. Configure o envio de e-mail/SMTP para produção.
3. Em **Authentication → URL Configuration**, configure **Site URL** e **Redirect URLs** com o endereço publicado e o caminho real da página. Aceite também o parâmetro dos convites nos redirecionamentos de confirmação, por exemplo `https://seu-dominio/index.html.html**` (substitua domínio/caminho e limite a regra ao app). Adicione os endereços de desenvolvimento usados. Confira um e-mail de confirmação com convite real antes de liberar o acesso.
4. Publique `index.html.html` junto da pasta `assets/` e abra por HTTP/HTTPS. Links `file://` não são compartilháveis. URL e chave pública permanecem no HTML; nunca coloque a chave `service_role` no navegador.
5. Entre e escolha **Guardar na minha conta**, ou abra um projeto existente em **Meus espaços**. Projetos sem documento pedem **Publicar este conteúdo**: o app não substitui conteúdo remoto automaticamente pelo conteúdo daquele navegador. Depois use **Compartilhar** ou **Coeditor**.

**Não execute `page-shares-policy.sql` depois desta migração.** Ele pertence à integração anterior. Esta versão usa RPCs autorizadas no servidor e remove acesso direto de `anon` e `authenticated` às tabelas envolvidas. Isso evita enumeração de perfis, e-mails e tokens. Caso outro app seu consulte essas mesmas tabelas diretamente, adapte-o antes de aplicar o SQL.

A migração verifica tipos e colunas obrigatórias. Se indicar coluna sem default ou esquema incompatível, corrija essa diferença antes de prosseguir. Não desabilite RLS nem libere as tabelas publicamente para contornar erros. Triggers personalizados existentes também precisam ser conferidos no ambiente real.

Documentação oficial: [cadastro e confirmação](https://supabase.com/docs/reference/javascript/auth-signup), [redirecionamentos](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [funções e permissões](https://supabase.com/docs/guides/database/functions).

## Funcionamento

- **Cadastrar / Entrar:** cadastro começa pelo nome de usuário (3–24 letras sem acentos, números ou `_`). Nomes são normalizados para minúsculas e protegidos por índice único e trigger no banco, inclusive em pedidos simultâneos. Contas existentes recebem `pessoa_...`, alterável no menu. `email` e `role` são preservados; `profiles.role` não concede autoridade sobre projetos.
- **Menu da conta:** nome clicável, Gerenciar conta, Meus espaços, Gerenciar acessos (autor) e Sair. Trocar senha exige confirmar a senha atual. Os vínculos usam UUID; renomear não perde projetos.
- **Convites:** 32 bytes de `crypto.getRandomValues`, em 64 caracteres hexadecimais. A RPC valida o autor e insere em `page_shares` os campos `project_id`, `token`, `permission_type`, `is_active: true` e `created_by`. O resultado é a URL da página com `?token=...`, em campo somente leitura com botão Copiar. Um erro de gravação não exibe um link como válido.
- **Pessoas:** sem conta, qualquer convite permite apenas visualizar. Ao cadastrar/entrar pelo convite, a pessoa se torna coautora com a permissão dele. A faixa mostra autor, coautores e presença recente nos dois lados; não mostra e-mails. Atualiza a cada 8 segundos, com janela de presença de 90 segundos.
- **Acessos:** somente o autor promove/rebaixa/remove membros e desativa links. Um convite antigo de editor não contorna rebaixamento. Membros removidos não recuperam acesso por esse convite; o autor pode restabelecê-lo explicitamente. Desativar o link bloqueia novas entradas; membros já aceitos mantêm sua permissão até serem removidos.
- **Exclusão:** autor e coautores editores podem excluir após digitar `EXCLUIR`. Visualizadores não podem. O projeto é removido para todos; contas e projetos alheios são preservados. Cópias exportadas continuam existindo. Se alguma tabela personalizada impedir a exclusão por chave estrangeira, a transação falha inteira e preserva o projeto.
- **Conteúdo:** recortes, configurações e fotos comprimidas, inclusive capa, ficam em `portlov_documents`, com autorização por projeto. O conteúdo local anterior fica separado. Limite de documento: 40 MB. As imagens ficam no JSON; não é necessário configurar Storage nesta versão.
- **Edição simultânea:** salvamento automático em projetos publicados, com controle de revisão. Se outra pessoa salvar primeiro, o rascunho fica preservado na sessão e o app oferece baixar uma cópia ou carregar a versão atual. Não há mesclagem de texto simultâneo. Mudanças remotas são carregadas fora da edição e de formulários abertos. Não feche a aba com mudanças não salvas: rascunhos remotos não são persistidos em armazenamento local compartilhado entre contas.

## Testes

Com Node 22+ e Microsoft Edge instalado:

```powershell
node tests/accounts-browser.cjs
node tests/accounts-sql.mjs
```

O navegador usa Supabase simulado, sem gravações em produção. Verifica conta, senhas, publicação, convites, cópia, permissões, conflito de edição, coautoria, exclusão, sons, temas e telas de 360/1100 px. Relatórios/capturas: `.checks/accounts/`.

O teste SQL usa PostgreSQL/PGlite local. Para preparar o motor (apenas para testes, sem dependência no app):

```powershell
New-Item -ItemType Directory -Force .checks/sql-engine
$packageInfo = Invoke-RestMethod 'https://registry.npmjs.org/@electric-sql/pglite/latest'
Invoke-WebRequest $packageInfo.dist.tarball -OutFile .checks/sql-engine/pglite.tgz
node tests/install-sql-engine.cjs
node tests/accounts-sql.mjs
```

O SQL verifica a estrutura de `profiles` informada, migração repetida, nomes únicos, autorização de todos os papéis, revogação, revisões e exclusão atômica. Resultado: `.checks/accounts-sql-results.json`.

Os testes antigos `share-invites.cjs` e `share-browser-smoke.cjs` foram substituídos pelos testes de contas, pois dependiam do contrato anterior de acesso direto a tabelas.

A validação local não substitui conferir cadastro, e-mails e permissões no seu Supabase após aplicar o SQL. Não houve acesso autenticado ao banco de produção nesta alteração.
