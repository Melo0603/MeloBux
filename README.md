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

## Configuracao do Cloudflare Workers

O Worker nao usa Firebase Admin SDK. Ele acessa Firebase por APIs HTTP compativeis com Cloudflare Workers:

- Firestore REST API.
- Firebase Auth por JWT/JWKS e Identity Toolkit REST.
- Firebase Cloud Messaging HTTP v1.
- Mercado Pago por HTTPS.

### Vars nao sensiveis

Estas variaveis ficam em `wrangler.jsonc` dentro de `vars`. Troque os valores de exemplo antes do deploy final.

| Variavel | Obrigatoria | Exemplo | Usada em | Motivo |
| --- | --- | --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Sim | `melobux-exemplo` | `worker/firebaseRest.ts` | Identifica o projeto Firebase para Firestore, Auth e FCM. |
| `FIREBASE_DATABASE_ID` | Opcional | `(default)` | `worker/firebaseRest.ts` | Banco Firestore. Se vazio, usa `(default)`. |
| `FIREBASE_WEB_API_KEY` | Sim para redefinir senha | `AIzaSyEXEMPLO_PUBLICO` | `worker/firebaseRest.ts` | Identity Toolkit REST ao trocar custom token por ID token. Pode ser a mesma `VITE_FIREBASE_API_KEY`. |
| `PUBLIC_SITE_URL` | Sim em producao | `https://seu-dominio.com` | `worker/utils.ts` | Links de retorno do Mercado Pago e notificacoes. |
| `WORKER_PUBLIC_URL` | Opcional | `https://seu-dominio.com` | `worker/utils.ts` | Origem publica da API quando diferente do site. |
| `ALLOWED_ORIGINS` | Opcional | `http://localhost:5173,https://seu-dominio.com` | `worker/utils.ts` | CORS quando frontend e API rodam em dominios diferentes. |
| `EMAIL_FROM` | Condicional | `MeloBux <noreply@seudominio.com>` | `worker/utils.ts` | Remetente dos codigos por e-mail. Necessaria com Resend ou endpoint HTTP. |
| `EMAIL_HTTP_ENDPOINT` | Condicional | `https://api.seuprovedor.com/send` | `worker/utils.ts` | Endpoint HTTP alternativo para envio de e-mail. |

### Secrets obrigatorios

Configure estes valores no Cloudflare, nunca em variaveis `VITE_`.

| Secret | Obrigatorio | Exemplo sem dados reais | Usado em | Motivo |
| --- | --- | --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | Sim | `APP_USR-xxxxxxxxxxxxxxxx` | `worker/utils.ts` | Criar preferencia de checkout e consultar pagamento no webhook. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Sim | `assinatura-secreta-do-webhook` | `worker/utils.ts` | Validar assinatura HMAC dos webhooks de pagamento. |
| `FIREBASE_CLIENT_EMAIL` | Sim | `firebase-adminsdk-xxxxx@melobux-exemplo.iam.gserviceaccount.com` | `worker/firebaseRest.ts` | Assinar JWT da service account para APIs Google. |
| `FIREBASE_PRIVATE_KEY` | Sim | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` | `worker/firebaseRest.ts` | Assinar JWT da service account e custom tokens. |

### Secrets opcionais ou condicionais

| Secret | Obrigatorio | Exemplo sem dados reais | Usado em | Motivo |
| --- | --- | --- | --- | --- |
| `AUTH_CODE_SECRET` | Recomendado | `string-longa-aleatoria` | `worker/utils.ts` | Assinar hashes dos codigos de login por e-mail. Se ausente, usa a chave privada Firebase como fallback. |
| `RESEND_API_KEY` | Condicional | `re_xxxxxxxxxxxxx` | `worker/utils.ts` | Enviar codigos por e-mail via Resend. Necessaria se usar Resend. |
| `EMAIL_HTTP_BEARER_TOKEN` | Opcional | `token-do-provedor-http` | `worker/utils.ts` | Autorizacao do endpoint HTTP alternativo de e-mail. |

Para o login por codigo funcionar em producao, configure uma destas opcoes:

- `RESEND_API_KEY` + `EMAIL_FROM`
- `EMAIL_HTTP_ENDPOINT` + `EMAIL_FROM` e, se o provedor exigir, `EMAIL_HTTP_BEARER_TOKEN`

Cloudflare Workers nao envia SMTP direto.

### Comandos CMD para cadastrar secrets

Execute um por vez no CMD, dentro da pasta do projeto:

```cmd
npx wrangler secret put MERCADO_PAGO_ACCESS_TOKEN
npx wrangler secret put MERCADO_PAGO_WEBHOOK_SECRET
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put AUTH_CODE_SECRET
```

Se for usar Resend:

```cmd
npx wrangler secret put RESEND_API_KEY
```

Se for usar um provedor HTTP proprio para e-mail:

```cmd
npx wrangler secret put EMAIL_HTTP_BEARER_TOKEN
```

`FIREBASE_PRIVATE_KEY` deve ser a chave privada da service account. Mantenha as quebras de linha como `\n` se colar em uma linha unica.

## Endpoints Worker

- `POST /api/checkout`
- `POST /api/admin`
- `POST /api/auth`
- `POST /api/webhook/mercadopago`

O frontend chama esses endpoints com `fetch`. Quando o usuario esta logado, o Firebase ID Token e enviado no header:

```txt
Authorization: Bearer <firebase-id-token>
```

O Worker valida o token Firebase por assinatura JWT/JWKS, sem SDK administrativo do Firebase, antes de qualquer acao sensivel.

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
4. Use estes campos no Cloudflare Workers:

```txt
FIREBASE_PROJECT_ID      project_id    -> var nao sensivel em wrangler.jsonc
FIREBASE_CLIENT_EMAIL    client_email  -> secret
FIREBASE_PRIVATE_KEY     private_key   -> secret
```

Nunca coloque service account, token Mercado Pago ou webhook secret em variaveis `VITE_`.

## App Check

App Check continua valido para proteger os servicos Firebase chamados diretamente pelo frontend, como Firestore e Storage.

O Worker protege a API com:

- Firebase ID Token validado no backend por JWT/JWKS.
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
- Vars e secrets obrigatorios configurados no Cloudflare Workers.
- Mercado Pago webhook apontando para `/api/webhook/mercadopago`.
- `PUBLIC_SITE_URL` apontando para o dominio final.
- `WORKER_PUBLIC_URL` apontando para o dominio onde a API roda, se diferente do site.
