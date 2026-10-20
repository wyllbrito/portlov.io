# Verificação local

Execute a partir da pasta principal do projeto, com Node.js 22 ou superior:

```powershell
node tests/verify-local.cjs
node tests/browser-check.cjs
node tests/accounts-browser.cjs
node tests/accounts-sql.mjs
```

O teste de navegador usa o Microsoft Edge instalado no Windows, em modo headless, com um perfil temporário isolado. Não acessa os dados pessoais do navegador. Não requer bibliotecas adicionais.

O conjunto `accounts-browser.cjs` testa o novo contrato de contas/colaboração com Supabase simulado. `accounts-sql.mjs` executa a migração e as regras de acesso em PostgreSQL/PGlite local. Consulte [a configuração e o preparo do motor SQL](../supabase/SHARING.md). Os testes antigos `share-invites.cjs` e `share-browser-smoke.cjs` cobrem a integração anterior e foram substituídos por esses conjuntos.

Resultados e capturas são gravados em `.checks/`. A matriz completa inclui três larguras (1280, 768 e 360 px), três temas, dois modos de cor e as três páginas de exemplo. Os fluxos funcionais cobrem onboarding, personalização, arquivos de capa, áudio, calendário, cartas, fotos, slides, listas, organização, criação e remoção de widgets, prévia do aplicativo e navegação.

O contraste dos textos é medido sobre as superfícies renderizadas, com alvos de 4,5:1 para texto comum e 3:1 para texto grande. A capa fotográfica tem análise própria de luminosidade, opção de cor automática, aviso de contraste para a cor manual e controle de brilho. Capturas complementam a medição.

Os testes do sensor usam eventos simulados, incluindo permissão negada, permissão concedida e preferência por movimento reduzido. Os testes de rolagem enviam eventos de toque ao navegador. Áudio é verificado pelo contexto de áudio em execução e pelo agendamento das notas, com o piano ligado e desligado. Essas verificações não substituem avaliação física de giroscópio, alto-falantes ou Safari/iOS.

A tela inicial orienta a criação de um atalho pelo navegador, sem simular uma instalação. Serviços externos de música, compartilhamento e impressão do sistema não são validados como serviços remotos por estes testes.
