# MeloBux Firebase Marketplace

Marketplace preparado para produção usando Firebase Hosting, Authentication, Firestore, Storage, Cloud Functions, Security Rules, App Check, Analytics e Cloud Messaging.

## Arquitetura

- Frontend: React + Vite publicado no Firebase Hosting.
- Login: Firebase Authentication.
- Conteúdo editável: Firestore (`categories`, `products`, `settings`, `coupons`, `orders` e `reviews` reais).
- Imagens: Firebase Storage, pasta `public/`, com escrita restrita a administradores.
- Servidor: Cloud Functions v2 para bootstrap de admin, seed, mutações do painel, checkout Mercado Pago, webhook, status de pedidos e avaliações pós-entrega.
- Segurança: Firestore/Storage Rules bloqueiam escrita direta; mutações sensíveis passam por Callable Functions com Auth, custom claim `admin` e App Check.
- Pagamento: Mercado Pago Checkout Pro criado somente no backend.
- Notificações: Firebase Cloud Messaging para avisar usuários autenticados quando o pagamento for aprovado ou pedido for entregue.
- Admin: dashboard, pedidos filtráveis, produtos, categorias, cupons, conteúdo da loja e logs.
- SEO/PWA: meta tags, Open Graph, Twitter Cards, favicon, manifest, `robots.txt` e `sitemap.xml`.
- Performance: lazy loading, code splitting, cache para assets e compressão client-side de imagens antes do Storage.

## Funcionalidades implementadas

- Home clean com hero, mascote Melo, botão de compra, botão TikTok e dois cards grandes: `Gamepass` e `Robux na Conta`.
- Página de categoria com banner, informações de entrega e produtos abaixo.
- Página de produto com imagem, quantidade, preço, descrição, prazo, categoria, usuário Roblox, compra, carrinho e cupom.
- Carrinho com checkout recalculado no backend.
- Cupons com valor fixo, porcentagem, uso máximo, expiração, valor mínimo, uso único e limite por usuário.
- Avaliações reais: o cliente só consegue avaliar quando o admin marca o pedido como `delivered`; a avaliação publicada aparece para todos.
- Dashboard admin com vendas por período, lucro estimado, status de pedidos, novos usuários e rankings.
- Logs de ações administrativas com data/hora, usuário, IP quando disponível, ação e entidade.

## Estrutura

```txt
src/                 Aplicação React
src/pages/           Home, categoria, produto, carrinho, pedido e admin
src/services/        Acesso a Firestore, Storage e Functions
functions/src/       Cloud Functions v2
firestore.rules      Regras do Firestore
storage.rules        Regras do Storage
firebase.json        Hosting, rewrites, emuladores e deploy
.env.example         Variáveis públicas do app web
```

## Rodar localmente

1. Instale dependências:

```bash
npm install
npm --prefix functions install
```

No PowerShell do Windows, se `npm` estiver bloqueado pela política de execução, use `npm.cmd`.

2. Crie `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

3. Rode o app:

```bash
npm run dev
```

4. Para emuladores Firebase:

```bash
npm run emulators
```

Use `VITE_USE_FIREBASE_EMULATORS=true` no `.env` durante testes locais.

## Criar projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/).
2. Crie um projeto e ative Google Analytics durante a criação.
3. Adicione um app Web ao projeto.
4. Copie o objeto de configuração Web para `.env`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FUNCTIONS_REGION=southamerica-east1
```

Essas chaves `VITE_` são públicas do app web. Nunca coloque token do Mercado Pago, service account JSON ou segredo privado nelas.

## Conectar projeto

1. Instale e entre no Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

2. Copie `.firebaserc.example` para `.firebaserc` e ajuste o ID do projeto se preferir configurar manualmente.

3. Confirme:

```bash
firebase projects:list
firebase use
```

## Configurar Authentication

1. Firebase Console > Authentication > Get started.
2. Ative Email/Senha.
3. Ative Anonymous para permitir checkout seguro sem exigir cadastro completo do comprador.
4. Opcional: ative Google como provedor.
5. Crie ou faça login com o e-mail que será administrador.
6. Configure o e-mail inicial de admin em `functions/.env.<PROJECT_ID>`:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@melobux.com
PUBLIC_SITE_URL=https://melobux.web.app
```

7. Configure App Check antes de usar as Callable Functions em produção.
8. Publique Functions e abra `/admin`.
9. Faça login com esse e-mail e clique em `Ativar admin inicial`.

Depois disso o usuário recebe custom claim `admin`. O token pode precisar ser renovado; sair e entrar novamente resolve.

## Configurar Firestore

1. Firebase Console > Firestore Database > Create database.
2. Use modo produção.
3. Escolha a região do projeto.
4. Publique regras e índices:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

5. No painel `/admin`, clique em `Seed inicial` para gravar categorias, produtos, cupons e configurações padrão. Avaliações começam vazias e são criadas apenas por clientes após pedidos entregues.

## Configurar Storage

1. Firebase Console > Storage > Get started.
2. Use modo produção.
3. Publique regras:

```bash
firebase deploy --only storage
```

4. Imagens enviadas no admin vão para `public/` e ficam públicas para leitura. Escrita exige usuário autenticado com claim `admin`.

## Configurar Cloud Functions

1. Instale dependências das Functions:

```bash
npm --prefix functions install
```

2. Crie `functions/.env.<PROJECT_ID>`:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@melobux.com
PUBLIC_SITE_URL=https://melobux.web.app
```

3. Configure segredos:

```bash
firebase functions:secrets:set MERCADO_PAGO_ACCESS_TOKEN
firebase functions:secrets:set MERCADO_PAGO_WEBHOOK_SECRET
```

4. Publique:

```bash
npm run functions:build
firebase deploy --only functions
```

As Functions usam Admin SDK no ambiente Firebase. Não use arquivo de chave privada no frontend.

## Configurar App Check

### Produção

1. Firebase Console > App Check.
2. Registre o app Web.
3. Use provedor reCAPTCHA Enterprise.
4. Copie a site key de produção para:

```env
VITE_FIREBASE_APP_CHECK_SITE_KEY=
```

5. Em App Check, ative enforcement para Firestore, Storage e Cloud Functions quando os testes estiverem concluídos.

### Desenvolvimento local com Debug Token

O app usa o fluxo oficial do Firebase App Check Debug Provider quando roda com `npm run dev` (`import.meta.env.DEV`). Nesse modo, ele define `self.FIREBASE_APPCHECK_DEBUG_TOKEN` antes de inicializar App Check e não exige reCAPTCHA Enterprise no localhost.

1. Deixe `VITE_FIREBASE_APP_CHECK_SITE_KEY` vazio no `.env` local.
2. Rode o site em localhost:

```bash
npm run dev
```

3. Abra `http://localhost:5173` no navegador.
4. Abra o Console do navegador e procure uma mensagem parecida com:

```text
App Check debug token: "SEU_TOKEN". You will need to add it to your app's App Check settings in the Firebase console for it to work.
```

5. Firebase Console > App Check > Apps > app Web `Melobux`.
6. Abra o menu de três pontos do app Web e clique em `Manage debug tokens`.
7. Registre o token exibido no Console do navegador.
8. Recarregue o localhost e tente o checkout novamente.

Opcionalmente, depois de criar um token fixo no Console, você pode colocá-lo no `.env` local:

```env
VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=SEU_TOKEN_DE_DEBUG
```

Não publique esse token e não use Debug Token em produção. Também não adicione `localhost` aos domínios permitidos do reCAPTCHA; use o Debug Provider para desenvolvimento local.

As Callable Functions deste projeto usam `enforceAppCheck: true`. Sem a site key no `.env`, chamadas como checkout, seed e painel admin serão rejeitadas em produção.

## Configurar Analytics

1. Analytics deve estar ativo no projeto Firebase.
2. Garanta que `VITE_FIREBASE_MEASUREMENT_ID` esteja preenchido.
3. O app inicializa Analytics automaticamente quando o navegador suporta.

## Configurar Cloud Messaging

1. Firebase Console > Project settings > Cloud Messaging.
2. Gere uma Web Push certificate key.
3. Copie a key para:

```env
VITE_FIREBASE_VAPID_KEY=
```

4. Usuários autenticados podem ativar notificações no botão de sino.
5. A Function `mercadoPagoWebhook` envia FCM quando o pagamento vira `paid`.

## Configurar Mercado Pago

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview).
2. Crie uma aplicação em Suas integrações.
3. Copie o Access Token de produção para o segredo `MERCADO_PAGO_ACCESS_TOKEN`.
4. Em Webhooks, configure:

```txt
https://seu-dominio.com/api/mercadopago/webhook
```

5. Ative pelo menos o evento `payment`.
6. Copie a assinatura secreta do Webhook para `MERCADO_PAGO_WEBHOOK_SECRET`.
7. Faça testes com credenciais e contas de teste antes de trocar para produção.

O webhook valida `x-signature`, `x-request-id` e `data.id`, responde `200` rapidamente e processa o pagamento no backend.

## Configurar domínio personalizado

1. Firebase Console > Hosting > Add custom domain.
2. Informe o domínio ou subdomínio.
3. Crie os registros DNS solicitados.
4. Aguarde validação e emissão de SSL.
5. Atualize:

```env
PUBLIC_SITE_URL=https://seu-dominio.com
```

6. Refaça deploy das Functions para atualizar URLs de retorno e webhook.

## Publicar no Firebase Hosting

1. Build completo:

```bash
npm run build
npm run functions:build
```

2. Deploy completo:

```bash
firebase deploy
```

Ou por partes:

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Atualizar o site no futuro

- Conteúdo, preços, estoque, cupons, TikTok, avisos e política: altere em `/admin`, sem editar código. Avaliações são geradas somente pelo fluxo de pedido entregue.
- Código ou regras: altere os arquivos, rode `npm run build`, `npm run functions:build` e depois `firebase deploy`.
- Segredos: use `firebase functions:secrets:set NOME_DO_SEGREDO` e publique Functions novamente.

## Backup do Firestore

Opção recomendada para produção:

1. Crie um bucket do Cloud Storage para backups, por exemplo `gs://seu-projeto-firestore-backups`.
2. Exporte:

```bash
gcloud firestore export gs://seu-projeto-firestore-backups/backup-2026-07-13
```

3. Guarde o caminho gerado e automatize por Cloud Scheduler se necessário.

Também avalie backups gerenciados do Firestore no console se estiverem disponíveis no seu plano/região.

## Restaurar backup

1. Escolha o caminho do export:

```txt
gs://seu-projeto-firestore-backups/backup-2026-07-13
```

2. Importe:

```bash
gcloud firestore import gs://seu-projeto-firestore-backups/backup-2026-07-13
```

3. Valide dados no Firebase Console e rode testes de compra antes de liberar tráfego.

## Checklist de produção

- Projeto no plano Blaze para Functions externas e Mercado Pago.
- Authentication com provedores necessários.
- Firestore e Storage em modo produção.
- Regras publicadas.
- App Check testado e com enforcement ativado.
- Segredos do Mercado Pago configurados no Secret Manager via Firebase CLI.
- `PUBLIC_SITE_URL` apontando para domínio final.
- Webhook Mercado Pago usando HTTPS final.
- Admin inicial com custom claim.
- Seed inicial executado ou conteúdo cadastrado manualmente.
- Backup configurado antes do lançamento.

## Referências oficiais

- [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart)
- [Firebase App Check Web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)
- [Cloud Functions environment configuration](https://firebase.google.com/docs/functions/config-env)
- [Firestore export/import](https://firebase.google.com/docs/firestore/manage-data/export-import)
- [Firestore backups](https://firebase.google.com/docs/firestore/backups)
- [Mercado Pago Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview)
- [Mercado Pago Webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
