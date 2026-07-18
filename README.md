# MeloBux

Marketplace MeloBux em React + Vite usando Firebase para Auth, Firestore, Storage, Analytics e App Check nos servicos Firebase. A logica sensivel roda no Cloudflare Workers.

## Arquitetura

- Frontend: React + Vite.
- Hospedagem e API: Cloudflare Workers + Cloudflare Assets.
- Login: Firebase Authentication.
- Dados: Firestore.
- Imagens: Firebase Storage.
- Analytics: Firebase Analytics.
- App Check: mantido para os servicos Firebase no frontend.
- Pagamento: Mercado Pago Checkout Pro criado somente no Worker.

O Access Token do Mercado Pago e a service account do Firebase nunca ficam no frontend.

## Estrutura

```txt
src/                 Frontend React
worker/              Backend Cloudflare Workers
public/              Assets publicos
firestore.rules      Regras Firestore
storage.rules        Regras Storage
firebase.json        Firestore, Storage e Hosting legado
wrangler.jsonc       Configuracao Cloudflare Workers
```

## Rodar Localmente

```bash
npm install
npm run dev
```

Para testar o build no runtime do Cloudflare:

```bash
npm run preview
```

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
VITE_API_BASE_URL=
VITE_USE_FIREBASE_EMULATORS=false
```

`VITE_API_BASE_URL` pode ficar vazio quando o frontend e a API rodam no mesmo Worker. Preencha apenas se a API estiver em outro dominio, por exemplo:

```env
VITE_API_BASE_URL=https://api.seudominio.com
```

## Secrets do Cloudflare Workers

Configure com Wrangler:

```bash
wrangler secret put MERCADO_PAGO_ACCESS_TOKEN
wrangler secret put MERCADO_PAGO_WEBHOOK_SECRET
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY
```

Recomendadas:

```bash
wrangler secret put PUBLIC_SITE_URL
wrangler secret put WORKER_PUBLIC_URL
wrangler secret put ALLOWED_ORIGINS
wrangler secret put AUTH_CODE_SECRET
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
wrangler secret put SMTP_SECURE
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASS
wrangler secret put SMTP_FROM
```

`FIREBASE_PRIVATE_KEY` deve ser a chave privada da service account. Mantenha as quebras de linha como `\n` se colar em uma linha unica.

`AUTH_CODE_SECRET` deve ser uma string longa e privada para assinar os codigos de login por e-mail e redefinicao de senha. As variaveis `SMTP_*` sao usadas para enviar esses codigos por e-mail.

## Endpoints Worker

- `POST /api/checkout`
- `POST /api/admin`
- `POST /api/auth`
- `POST /api/webhook/mercadopago`

O frontend chama esses endpoints com `fetch`. Quando o usuario esta logado, o Firebase ID Token e enviado no header:

```txt
Authorization: Bearer <firebase-id-token>
```

O Worker valida o token com Firebase Admin SDK antes de qualquer acao sensivel.

## Mercado Pago

No Mercado Pago:

1. Copie o Access Token de producao.
2. Configure `MERCADO_PAGO_ACCESS_TOKEN` no Cloudflare Workers.
3. Configure o webhook para:

```txt
https://seu-dominio.com/api/webhook/mercadopago
```

4. Copie a assinatura secreta do webhook.
5. Configure `MERCADO_PAGO_WEBHOOK_SECRET` no Cloudflare Workers.

O checkout recalcula preco e cupom no backend, cria o pedido no Firestore e so entao cria a preferencia Mercado Pago.

## Service Account Firebase

No Firebase Console:

1. Project settings.
2. Service accounts.
3. Generate new private key.
4. Use estes campos como secrets no Cloudflare Workers:

```txt
FIREBASE_PROJECT_ID      project_id
FIREBASE_CLIENT_EMAIL    client_email
FIREBASE_PRIVATE_KEY     private_key
```

Nunca coloque service account, token Mercado Pago ou webhook secret em variaveis `VITE_`.

## App Check

App Check continua valido para proteger os servicos Firebase chamados diretamente pelo frontend, como Firestore e Storage.

O Worker protege a API com:

- Firebase ID Token validado no backend.
- Recalculo de preco no backend.
- Validacao de cupom no backend.
- Webhook Mercado Pago assinado.
- Firestore Rules bloqueando escrita direta.
- Secrets somente no Cloudflare Workers.

## Comandos

```bash
npm run dev
npm run lint
npm run build
npm run preview
npm run deploy
```

## Backup Firestore

Faca backup pelo Google Cloud/Firebase Console ou pela CLI do Google Cloud quando o recurso estiver disponivel no seu projeto:

```bash
gcloud firestore export gs://SEU_BUCKET/backups/firestore
gcloud firestore import gs://SEU_BUCKET/backups/firestore
```

## Checklist de Producao

- Firebase Auth configurado.
- Firestore Rules publicadas.
- Storage Rules publicadas.
- App Check configurado para Firestore/Storage.
- Secrets obrigatorios configurados no Cloudflare Workers.
- Mercado Pago webhook apontando para `/api/webhook/mercadopago`.
- `PUBLIC_SITE_URL` apontando para o dominio final.
- `WORKER_PUBLIC_URL` apontando para o dominio onde a API roda, se diferente do site.
