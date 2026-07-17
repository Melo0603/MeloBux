# MeloBux

Marketplace MeloBux em React + Vite usando Firebase Spark para frontend, Auth, Firestore, Storage, Analytics e App Check nos servicos Firebase. Toda logica sensivel foi migrada para Netlify Functions Free.

## Arquitetura

- Frontend: React + Vite.
- Hospedagem atual: Firebase Hosting.
- Backend sensivel: Netlify Functions em `netlify/functions`.
- Login: Firebase Authentication.
- Dados: Firestore.
- Imagens: Firebase Storage.
- Analytics: Firebase Analytics.
- App Check: mantido para os servicos Firebase no frontend.
- Pagamento: Mercado Pago Checkout Pro criado somente no backend Netlify.

O Access Token do Mercado Pago e a service account do Firebase nunca ficam no frontend.

## Estrutura

```txt
src/                 Frontend React
public/              Assets publicos
netlify/functions/   Backend serverless Netlify
firestore.rules      Regras Firestore
storage.rules        Regras Storage
firebase.json        Hosting, Firestore e Storage
netlify.toml         Build e Netlify Functions
```

## Rodar Localmente

```bash
npm install
npm run dev
```

Para testar as Netlify Functions localmente, use Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

O `netlify dev` simula `/.netlify/functions/*` e roda o Vite junto com as functions.

## Variaveis do Frontend

Crie `.env` com:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_APP_CHECK_SITE_KEY=
VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN=
VITE_FIREBASE_VAPID_KEY=
VITE_NETLIFY_FUNCTIONS_BASE_URL=
VITE_USE_FIREBASE_EMULATORS=false
```

`VITE_NETLIFY_FUNCTIONS_BASE_URL` deve ficar vazio quando o site roda na propria Netlify ou em `netlify dev`. Se o frontend continuar no Firebase Hosting, preencha com a URL do site Netlify que hospeda as functions, por exemplo:

```env
VITE_NETLIFY_FUNCTIONS_BASE_URL=https://melobux-backend.netlify.app
```

## Variaveis da Netlify

Configure no painel da Netlify em:

Site settings > Environment variables

Obrigatorias:

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Recomendadas:

```env
PUBLIC_SITE_URL=https://melobux.web.app
NETLIFY_FUNCTIONS_BASE_URL=https://seu-site.netlify.app
ALLOWED_ORIGINS=https://melobux.web.app,https://melobux.firebaseapp.com,http://localhost:5173,http://localhost:8888
AUTH_CODE_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

`FIREBASE_PRIVATE_KEY` deve ser a chave privada da service account. Na Netlify, mantenha as quebras de linha como `\n` se colar em uma linha unica.

`AUTH_CODE_SECRET` deve ser uma string longa e privada para assinar os codigos de login por e-mail e redefinicao de senha. As variaveis `SMTP_*` sao usadas para enviar esses codigos por e-mail. Sem SMTP configurado, o login Google e e-mail/senha continuam funcionando, mas a opcao "Entrar com codigo" nao consegue entregar o codigo.

## Firebase

Continue usando Firebase no plano Spark para:

- Authentication
- Firestore
- Storage
- Hosting
- Analytics
- App Check

Deploy do Firebase agora publica somente Hosting, Firestore e Storage:

```bash
npm run build
firebase deploy --only hosting,firestore,storage
```

O script `npm run deploy` ja usa esse alvo.

## Netlify Functions

Endpoints criados:

- `/.netlify/functions/checkout`
- `/.netlify/functions/webhook`
- `/.netlify/functions/admin`
- `/.netlify/functions/auth`

O frontend chama esses endpoints com `fetch`. Quando o usuario esta logado, o Firebase ID Token e enviado no header:

```txt
Authorization: Bearer <firebase-id-token>
```

As Netlify Functions validam o token com Firebase Admin SDK antes de qualquer acao sensivel.

O painel administrativo e exclusivo para `carlosmelo0603n2@gmail.com`. Mesmo que outro usuario tente acessar `/admin`, o frontend bloqueia a tela e o backend tambem valida o e-mail antes de permitir qualquer acao administrativa.

## Mercado Pago

No Mercado Pago:

1. Copie o Access Token de producao.
2. Configure `MERCADO_PAGO_ACCESS_TOKEN` na Netlify.
3. Configure o webhook para:

```txt
https://seu-site.netlify.app/.netlify/functions/webhook
```

4. Copie a assinatura secreta do webhook.
5. Configure `MERCADO_PAGO_WEBHOOK_SECRET` na Netlify.

O checkout recalcula preco e cupom no backend, cria o pedido no Firestore e so entao cria a preferencia Mercado Pago.

## Service Account Firebase

No Firebase Console:

1. Project settings.
2. Service accounts.
3. Generate new private key.
4. Use estes campos no painel da Netlify:

```txt
FIREBASE_PROJECT_ID      project_id
FIREBASE_CLIENT_EMAIL    client_email
FIREBASE_PRIVATE_KEY     private_key
```

Nunca coloque service account, token Mercado Pago ou webhook secret em variaveis `VITE_`.

## App Check

App Check continua valido para proteger os servicos Firebase chamados diretamente pelo frontend, como Firestore e Storage.

As Netlify Functions nao usam `enforceAppCheck`, porque isso era especifico de Firebase Cloud Functions. A protecao das functions agora vem de:

- Firebase ID Token validado no backend.
- Recalculo de preco no backend.
- Validacao de cupom no backend.
- Webhook Mercado Pago assinado.
- Firestore Rules bloqueando escrita direta.
- Secrets somente na Netlify.

## Comandos

```bash
npm run dev
npm run lint
npm run build
npm run deploy
```

## Backup Firestore

Sem Cloud Functions, faca backup pelo Google Cloud/Firebase Console ou pela CLI do Google Cloud quando o recurso estiver disponivel no seu projeto:

```bash
gcloud firestore export gs://SEU_BUCKET/backups/firestore
gcloud firestore import gs://SEU_BUCKET/backups/firestore
```

## Checklist de Producao

- Firebase Auth configurado.
- Firestore Rules publicadas.
- Storage Rules publicadas.
- App Check configurado para Firestore/Storage.
- Netlify Functions com variaveis obrigatorias.
- Mercado Pago webhook apontando para Netlify.
- `PUBLIC_SITE_URL` apontando para o dominio final.
- `VITE_NETLIFY_FUNCTIONS_BASE_URL` preenchido se o frontend estiver no Firebase Hosting.
