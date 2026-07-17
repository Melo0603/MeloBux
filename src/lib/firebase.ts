import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  type Auth
} from "firebase/auth";
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck
} from "firebase/app-check";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage
} from "firebase/storage";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.appId
];

export const isFirebaseConfigured = requiredConfig.every(Boolean);

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;
let analyticsPromise: Promise<Analytics | null> = Promise.resolve(null);
let messagingPromise: Promise<Messaging | null> = Promise.resolve(null);

export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let storage: FirebaseStorage | null = null;

type AppCheckDebugGlobal = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
};

function appCheckDebugToken() {
  const token = import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
  return token || true;
}

function debugAppCheckProvider() {
  return new CustomProvider({
    getToken: async () => {
      throw new Error("Firebase App Check debug mode should exchange the debug token before this provider is used.");
    }
  });
}

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
  if (import.meta.env.DEV) {
    const debugGlobal = globalThis as AppCheckDebugGlobal;
    if (debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN === undefined) {
      debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken();
    }

    appCheck = initializeAppCheck(app, {
      provider: debugAppCheckProvider(),
      isTokenAutoRefreshEnabled: true
    });
  } else if (appCheckSiteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  }

  analyticsPromise = isSupported().then((supported) =>
    supported && app ? getAnalytics(app) : null
  );

  messagingPromise = isMessagingSupported().then((supported) =>
    supported && app ? getMessaging(app) : null
  );

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
    const emulatorState = window as Window & { __FIREBASE_EMULATORS_CONNECTED__?: boolean };

    if (!emulatorState.__FIREBASE_EMULATORS_CONNECTED__) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      emulatorState.__FIREBASE_EMULATORS_CONNECTED__ = true;
    }
  }
}

export const googleProvider = new GoogleAuthProvider();
export { app, appCheck, analyticsPromise, messagingPromise };
