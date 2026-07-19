type RuntimeEnv = Record<string, string | undefined>;

export type DecodedIdToken = Record<string, unknown> & {
  uid: string;
  sub?: string;
  user_id?: string;
  email?: string;
  name?: string;
  picture?: string;
};

type FirebaseUser = {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
};

type SetOptions = {
  merge?: boolean;
};

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
};

type FirestoreValue =
  | { nullValue: "NULL_VALUE" }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreWrite = {
  update?: {
    name: string;
    fields?: Record<string, FirestoreValue>;
  };
  delete?: string;
  transform?: {
    document: string;
    fieldTransforms: FirestoreFieldTransform[];
  };
  updateMask?: {
    fieldPaths: string[];
  };
  updateTransforms?: FirestoreFieldTransform[];
};

type FirestoreFieldTransform =
  | {
      fieldPath: string;
      setToServerValue: "REQUEST_TIME";
    }
  | {
      fieldPath: string;
      increment: FirestoreValue;
    };

type QueryFilter = {
  field: string;
  operator: "==";
  value: unknown;
};

type ServiceAccountToken = {
  accessToken: string;
  expiresAt: number;
};

type FirebaseJwk = JsonWebKey & {
  kid?: string;
};

let runtimeEnv: RuntimeEnv = {};
let serviceAccountToken: ServiceAccountToken | null = null;
let privateKeyPromise: Promise<CryptoKey> | null = null;
let firebaseJwksCache: { keys: FirebaseJwk[]; expiresAt: number } | null = null;

export function setFirebaseRuntimeEnv(env: RuntimeEnv) {
  runtimeEnv = env;
}

function viteEnv() {
  return (import.meta as unknown as { env?: RuntimeEnv }).env ?? {};
}

export function firebaseEnvValue(name: string) {
  return runtimeEnv[name] || viteEnv()[name];
}

function requiredEnv(name: string) {
  const value = firebaseEnvValue(name);
  if (!value) throw new Error(`${name} nao configurado.`);
  return value;
}

function projectId() {
  const value = firebaseEnvValue("FIREBASE_PROJECT_ID") || firebaseEnvValue("VITE_FIREBASE_PROJECT_ID");
  if (!value) throw new Error("FIREBASE_PROJECT_ID nao configurado.");
  return value;
}

function databaseId() {
  return firebaseEnvValue("FIREBASE_DATABASE_ID") || "(default)";
}

function firebaseWebApiKey() {
  return firebaseEnvValue("FIREBASE_WEB_API_KEY") || firebaseEnvValue("VITE_FIREBASE_API_KEY") || "";
}

function serviceAccountEmail() {
  return requiredEnv("FIREBASE_CLIENT_EMAIL");
}

export function firebasePrivateKeyValue() {
  return requiredEnv("FIREBASE_PRIVATE_KEY");
}

function documentsRootName() {
  return `projects/${projectId()}/databases/${databaseId()}/documents`;
}

function documentsRootUrl() {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/databases/${encodeURIComponent(databaseId())}/documents`;
}

function encodeDocumentPath(path: string) {
  return trimPath(path).split("/").map(encodeURIComponent).join("/");
}

function documentName(path: string) {
  return `${documentsRootName()}/${trimPath(path)}`;
}

function documentUrl(path: string) {
  return `${documentsRootUrl()}/${encodeDocumentPath(path)}`;
}

function collectionParentPath(path: string) {
  const parts = trimPath(path).split("/");
  return parts.slice(0, -1).join("/");
}

function collectionId(path: string) {
  const parts = trimPath(path).split("/");
  return parts[parts.length - 1] ?? "";
}

function collectionRunQueryUrl(path: string) {
  const parent = collectionParentPath(path);
  return parent
    ? `${documentsRootUrl()}/${encodeDocumentPath(parent)}:runQuery`
    : `${documentsRootUrl()}:runQuery`;
}

function trimPath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function randomDocumentId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function bytesFromUtf8(value: string) {
  return new TextEncoder().encode(value);
}

function utf8FromBytes(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeJson(value: unknown) {
  return base64UrlEncodeBytes(bytesFromUtf8(JSON.stringify(value)));
}

function base64UrlDecodeBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlDecodeJson(value: string) {
  return JSON.parse(utf8FromBytes(base64UrlDecodeBytes(value))) as Record<string, unknown>;
}

function stripWrappingQuotes(value: string) {
  let output = value.trim();
  while (
    output.length >= 2 &&
    ((output.startsWith("\"") && output.endsWith("\"")) ||
      (output.startsWith("'") && output.endsWith("'")) ||
      (output.startsWith("`") && output.endsWith("`")))
  ) {
    output = output.slice(1, -1).trim();
  }
  return output;
}

function normalizePrivateKeyBase64(pem: string) {
  let value = stripWrappingQuotes(pem.replace(/^\uFEFF/, ""));
  value = value.replace(/^FIREBASE_PRIVATE_KEY\s*=\s*/i, "");
  value = stripWrappingQuotes(value)
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim();

  const headerMatch = value.match(/-----BEGIN ([A-Z0-9 ]+)-----/);
  if (headerMatch && headerMatch[1] !== "PRIVATE KEY") {
    throw new Error(
      `FIREBASE_PRIVATE_KEY malformada: esperado "-----BEGIN PRIVATE KEY-----", recebido "-----BEGIN ${headerMatch[1]}-----". Use o campo private_key do JSON da service account.`
    );
  }

  const base64 = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^-----/.test(line))
    .join("")
    .replace(/\s/g, "");

  if (!base64) {
    throw new Error("FIREBASE_PRIVATE_KEY malformada: conteudo base64 vazio apos remover cabecalho e rodape PEM.");
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || /=/.test(base64.replace(/=+$/, ""))) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY malformada: o conteudo entre BEGIN/END PRIVATE KEY nao e base64 valido. Verifique aspas, quebras de linha e se voce cadastrou apenas o valor private_key."
    );
  }

  if (base64.length % 4 === 1) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY malformada: tamanho base64 invalido. A chave provavelmente foi cortada ou colada com caracteres extras."
    );
  }

  return base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
}

function pemToArrayBuffer(pem: string) {
  const base64 = normalizePrivateKeyBase64(pem);
  let binary = "";
  try {
    binary = atob(base64);
  } catch (error) {
    throw new Error(
      `FIREBASE_PRIVATE_KEY malformada: falha ao decodificar base64 antes de importar a chave. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!binary) {
    throw new Error("FIREBASE_PRIVATE_KEY malformada: chave decodificada vazia.");
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

async function privateKey() {
  privateKeyPromise ??= crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(firebasePrivateKeyValue()),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  return privateKeyPromise;
}

async function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>) {
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await privateKey(),
    bytesFromUtf8(signingInput)
  );
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function serviceAccountAccessToken() {
  if (serviceAccountToken && serviceAccountToken.expiresAt > Date.now() + 60_000) {
    return serviceAccountToken.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccountEmail(),
      scope: [
        "https://www.googleapis.com/auth/datastore",
        "https://www.googleapis.com/auth/identitytoolkit",
        "https://www.googleapis.com/auth/firebase.messaging"
      ].join(" "),
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    }
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Falha ao autenticar service account: ${response.status}`);
  }

  serviceAccountToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
  };
  return serviceAccountToken.accessToken;
}

async function googleFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await serviceAccountAccessToken()}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  return fetch(url, { ...init, headers });
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    if (value instanceof FieldValueTransform) {
      throw new Error("Transformacao Firestore usada em campo aninhado.");
    }
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (nestedValue !== undefined) fields[key] = encodeValue(nestedValue);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return undefined;
}

function decodeFields(fields: Record<string, FirestoreValue>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) output[key] = decodeValue(value);
  return output;
}

class FieldValueTransform {
  constructor(
    readonly kind: "serverTimestamp" | "increment",
    readonly amount = 0
  ) {}
}

export const FieldValue = {
  serverTimestamp() {
    return new FieldValueTransform("serverTimestamp");
  },
  increment(amount: number) {
    return new FieldValueTransform("increment", amount);
  }
};

export const Timestamp = {
  now() {
    return new Date();
  }
};

function buildWrite(ref: DocumentReference, data: Record<string, unknown>, options: SetOptions = {}): FirestoreWrite {
  const fields: Record<string, FirestoreValue> = {};
  const fieldPaths: string[] = [];
  const fieldTransforms: FirestoreFieldTransform[] = [];

  for (const [fieldPath, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof FieldValueTransform) {
      fieldTransforms.push(
        value.kind === "serverTimestamp"
          ? { fieldPath, setToServerValue: "REQUEST_TIME" }
          : { fieldPath, increment: encodeValue(value.amount) }
      );
      continue;
    }
    fields[fieldPath] = encodeValue(value);
    fieldPaths.push(fieldPath);
  }

  if (fieldPaths.length === 0 && fieldTransforms.length > 0) {
    return {
      transform: {
        document: documentName(ref.path),
        fieldTransforms
      }
    };
  }

  const write: FirestoreWrite = {
    update: {
      name: documentName(ref.path),
      fields
    }
  };

  if (options.merge) write.updateMask = { fieldPaths };
  if (fieldTransforms.length > 0) write.updateTransforms = fieldTransforms;
  return write;
}

async function commitWrites(writes: FirestoreWrite[], transaction?: string) {
  if (writes.length === 0) return;
  const response = await googleFetch(`${documentsRootUrl()}:commit`, {
    method: "POST",
    body: JSON.stringify(transaction ? { writes, transaction } : { writes })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore commit failed: ${response.status} ${text.slice(0, 500)}`);
  }
}

export class DocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;

  constructor(
    readonly ref: DocumentReference,
    private readonly document?: FirestoreDocument
  ) {
    this.id = ref.id;
    this.exists = Boolean(document);
  }

  data() {
    if (!this.document) return undefined;
    return decodeFields(this.document.fields ?? {});
  }
}

export class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}
}

export class DocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FirestoreRest,
    readonly path: string
  ) {
    const parts = trimPath(path).split("/");
    this.id = parts[parts.length - 1] ?? "";
  }

  async get(transaction?: string) {
    const url = transaction ? `${documentUrl(this.path)}?transaction=${encodeURIComponent(transaction)}` : documentUrl(this.path);
    const response = await googleFetch(url);
    if (response.status === 404) return new DocumentSnapshot(this);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firestore get failed: ${response.status} ${text.slice(0, 500)}`);
    }
    return new DocumentSnapshot(this, (await response.json()) as FirestoreDocument);
  }

  async set(data: Record<string, unknown>, options: SetOptions = {}) {
    await this.firestore.commit([buildWrite(this, data, options)]);
  }

  async delete() {
    await this.firestore.commit([{ delete: documentName(this.path) }]);
  }
}

export class CollectionReference {
  constructor(
    private readonly firestore: FirestoreRest,
    readonly path: string
  ) {}

  doc(id = randomDocumentId()) {
    return new DocumentReference(this.firestore, `${trimPath(this.path)}/${id}`);
  }

  async add(data: Record<string, unknown>) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  where(field: string, operator: "==", value: unknown) {
    return new Query(this.firestore, this.path, [{ field, operator, value }]);
  }

  async get() {
    return new Query(this.firestore, this.path, []).get();
  }
}

export class Query {
  constructor(
    private readonly firestore: FirestoreRest,
    private readonly path: string,
    private readonly filters: QueryFilter[]
  ) {}

  where(field: string, operator: "==", value: unknown) {
    return new Query(this.firestore, this.path, [...this.filters, { field, operator, value }]);
  }

  async get() {
    const fieldFilters = this.filters.map((filter) => ({
      fieldFilter: {
        field: { fieldPath: filter.field },
        op: "EQUAL",
        value: encodeValue(filter.value)
      }
    }));
    const where =
      fieldFilters.length === 0
        ? undefined
        : fieldFilters.length === 1
          ? fieldFilters[0]
          : { compositeFilter: { op: "AND", filters: fieldFilters } };

    const response = await googleFetch(collectionRunQueryUrl(this.path), {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collectionId(this.path) }],
          where
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firestore query failed: ${response.status} ${text.slice(0, 500)}`);
    }

    const rows = (await response.json()) as Array<{ document?: FirestoreDocument }>;
    const docs = rows
      .map((row) => row.document)
      .filter((document): document is FirestoreDocument => Boolean(document))
      .map((document) => {
        const path = decodeURIComponent(document.name.split("/documents/")[1] ?? "");
        return new DocumentSnapshot(new DocumentReference(this.firestore, path), document);
      });
    return new QuerySnapshot(docs);
  }
}

export class WriteBatch {
  private writes: FirestoreWrite[] = [];

  constructor(private readonly firestore: FirestoreRest) {}

  set(ref: DocumentReference, data: Record<string, unknown>, options: SetOptions = {}) {
    this.writes.push(buildWrite(ref, data, options));
  }

  delete(ref: DocumentReference) {
    this.writes.push({ delete: documentName(ref.path) });
  }

  async commit() {
    await this.firestore.commit(this.writes);
  }
}

class Transaction {
  private writes: FirestoreWrite[] = [];

  constructor(
    private readonly firestore: FirestoreRest,
    private readonly transactionId: string
  ) {}

  get(ref: DocumentReference) {
    return ref.get(this.transactionId);
  }

  set(ref: DocumentReference, data: Record<string, unknown>, options: SetOptions = {}) {
    this.writes.push(buildWrite(ref, data, options));
  }

  async commit() {
    await this.firestore.commit(this.writes, this.transactionId);
  }
}

export class FirestoreRest {
  doc(path: string) {
    return new DocumentReference(this, trimPath(path));
  }

  collection(path: string) {
    return new CollectionReference(this, trimPath(path));
  }

  batch() {
    return new WriteBatch(this);
  }

  commit(writes: FirestoreWrite[], transaction?: string) {
    return commitWrites(writes, transaction);
  }

  async runTransaction<T>(callback: (transaction: Transaction) => Promise<T>) {
    const begin = await googleFetch(`${documentsRootUrl()}:beginTransaction`, {
      method: "POST",
      body: JSON.stringify({})
    });
    if (!begin.ok) {
      const text = await begin.text();
      throw new Error(`Firestore transaction failed: ${begin.status} ${text.slice(0, 500)}`);
    }
    const { transaction } = (await begin.json()) as { transaction: string };
    const runner = new Transaction(this, transaction);
    const result = await callback(runner);
    await runner.commit();
    return result;
  }
}

function authUserFromPayload(payload: Record<string, unknown>): FirebaseUser {
  return {
    uid: String(payload.localId ?? payload.uid ?? ""),
    email: typeof payload.email === "string" ? payload.email : undefined,
    displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
    photoURL:
      typeof payload.photoUrl === "string"
        ? payload.photoUrl
        : typeof payload.photoURL === "string"
          ? payload.photoURL
          : undefined
  };
}

async function identityToolkitLookup(body: Record<string, unknown>) {
  const response = await googleFetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/accounts:lookup`,
    {
      method: "POST",
      body: JSON.stringify(body)
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase Auth lookup failed: ${response.status} ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as { users?: Record<string, unknown>[] };
  const user = data.users?.[0];
  if (!user) throw new Error("Firebase Auth user not found.");
  return authUserFromPayload(user);
}

async function exchangeCustomTokenForIdToken(customToken: string) {
  const apiKey = firebaseWebApiKey();
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY nao configurado.");

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token: customToken,
      returnSecureToken: true
    })
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof data.idToken !== "string") {
    throw new Error(`Falha ao trocar custom token: ${response.status}`);
  }
  return data.idToken;
}

async function fallbackUserByEmail(email: string) {
  const snapshot = await db.collection("users").where("email", "==", email).get();
  const first = snapshot.docs[0];
  if (!first) throw new Error("Firebase Auth user not found.");
  const data = first.data() ?? {};
  return {
    uid: first.id,
    email,
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    photoURL: typeof data.photoUrl === "string" ? data.photoUrl : undefined
  };
}

async function deterministicUidFromEmail(email: string) {
  return `email_${(await sha256Hex(email)).slice(0, 28)}`;
}

class AuthRest {
  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new Error("Invalid Firebase ID token.");

    const header = base64UrlDecodeJson(parts[0]);
    const payload = base64UrlDecodeJson(parts[1]);
    const kid = typeof header.kid === "string" ? header.kid : "";
    const alg = typeof header.alg === "string" ? header.alg : "";
    if (alg !== "RS256" || !kid) throw new Error("Invalid Firebase ID token header.");

    const jwks = await firebaseJwks();
    const jwk = jwks.find((key) => key.kid === kid);
    if (!jwk) throw new Error("Firebase ID token key not found.");

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      base64UrlDecodeBytes(parts[2]),
      bytesFromUtf8(`${parts[0]}.${parts[1]}`)
    );
    if (!verified) throw new Error("Invalid Firebase ID token signature.");

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId()) throw new Error("Invalid Firebase ID token audience.");
    if (payload.iss !== `https://securetoken.google.com/${projectId()}`) {
      throw new Error("Invalid Firebase ID token issuer.");
    }
    if (typeof payload.exp !== "number" || payload.exp <= now) throw new Error("Expired Firebase ID token.");
    const uid = typeof payload.user_id === "string" ? payload.user_id : typeof payload.sub === "string" ? payload.sub : "";
    if (!uid) throw new Error("Invalid Firebase ID token subject.");
    return { ...payload, uid } as DecodedIdToken;
  }

  async getUser(uid: string) {
    try {
      return await identityToolkitLookup({ localId: [uid] });
    } catch {
      const snapshot = await db.doc(`users/${uid}`).get();
      const data = snapshot.data() ?? {};
      return {
        uid,
        email: typeof data.email === "string" ? data.email : undefined,
        displayName: typeof data.displayName === "string" ? data.displayName : undefined,
        photoURL: typeof data.photoUrl === "string" ? data.photoUrl : undefined
      };
    }
  }

  async getUserByEmail(email: string) {
    try {
      return await identityToolkitLookup({ email: [email] });
    } catch {
      return fallbackUserByEmail(email);
    }
  }

  async createUser(input: { email: string; emailVerified?: boolean; displayName?: string }) {
    return {
      uid: await deterministicUidFromEmail(input.email),
      email: input.email,
      displayName: input.displayName,
      photoURL: ""
    };
  }

  async updateUser(uid: string, input: { password?: string }) {
    if (input.password) {
      const customToken = await this.createCustomToken(uid);
      const idToken = await exchangeCustomTokenForIdToken(customToken);
      const apiKey = firebaseWebApiKey();
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idToken,
          password: input.password,
          returnSecureToken: true
        })
      });
      if (!response.ok) {
        throw new Error(`Firebase Auth password update failed: ${response.status}`);
      }
    }
    return this.getUser(uid);
  }

  async createCustomToken(uid: string) {
    const now = Math.floor(Date.now() / 1000);
    return signJwt(
      { alg: "RS256", typ: "JWT" },
      {
        iss: serviceAccountEmail(),
        sub: serviceAccountEmail(),
        aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
        iat: now,
        exp: now + 3600,
        uid
      }
    );
  }
}

async function firebaseJwks() {
  if (firebaseJwksCache && firebaseJwksCache.expiresAt > Date.now()) return firebaseJwksCache.keys;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error(`Firebase JWKS fetch failed: ${response.status}`);
  const data = (await response.json()) as { keys?: FirebaseJwk[] };
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 3600);
  firebaseJwksCache = {
    keys: data.keys ?? [],
    expiresAt: Date.now() + maxAge * 1000
  };
  return firebaseJwksCache.keys;
}

class MessagingRest {
  async send(message: Record<string, unknown>) {
    await sendFcmMessage(message);
  }

  async sendEachForMulticast(payload: {
    tokens: string[];
    notification?: Record<string, string>;
    data?: Record<string, string>;
    webpush?: Record<string, unknown>;
  }) {
    await Promise.all(
      payload.tokens.map((token) =>
        sendFcmMessage({
          token,
          notification: payload.notification,
          data: payload.data,
          webpush: payload.webpush
        }).catch((error) => console.error("[notifications] FCM token send failed", error))
      )
    );
  }

  async subscribeToTopic(tokens: string[], topic: string) {
    if (tokens.length === 0) return;
    const response = await googleFetch("https://iid.googleapis.com/iid/v1:batchAdd", {
      method: "POST",
      body: JSON.stringify({
        to: `/topics/${topic}`,
        registration_tokens: tokens
      })
    });
    if (!response.ok) {
      console.error("[notifications] FCM topic subscription failed", {
        status: response.status,
        body: await response.text().catch(() => "")
      });
    }
  }
}

async function sendFcmMessage(message: Record<string, unknown>) {
  const response = await googleFetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/messages:send`, {
    method: "POST",
    body: JSON.stringify({ message })
  });
  if (!response.ok) {
    throw new Error(`FCM send failed: ${response.status}`);
  }
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", bytesFromUtf8(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytesFromUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, bytesFromUtf8(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(value: string, expected: string) {
  if (value.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < value.length; index += 1) {
    diff |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

export function randomSixDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

export function decodeBase64Utf8(value: string) {
  return utf8FromBytes(base64UrlDecodeBytes(value.replace(/\+/g, "-").replace(/\//g, "_")));
}

export const db = new FirestoreRest();
export const auth = new AuthRest();
export const messaging = new MessagingRest();
