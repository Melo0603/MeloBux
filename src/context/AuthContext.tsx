import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { AuthContext, type AuthContextValue } from "./AuthContextCore";

function getAuthInstance() {
  if (!auth) {
    throw new Error("Firebase Authentication nao esta configurado.");
  }
  return auth;
}

async function keepSessionLocal() {
  const authInstance = getAuthInstance();
  await setPersistence(authInstance, browserLocalPersistence);
  return authInstance;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);

    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      if (!active) return;
      setUser(currentUser);
      try {
        setClaims(currentUser ? (await currentUser.getIdTokenResult()).claims : {});
      } catch {
        setClaims({});
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    async function loginWithGoogle() {
      const authInstance = await keepSessionLocal();
      const credential = await signInWithPopup(authInstance, googleProvider);
      return credential.user;
    }

    async function loginWithEmail(email: string, password: string) {
      const authInstance = await keepSessionLocal();
      const credential = await signInWithEmailAndPassword(authInstance, email, password);
      return credential.user;
    }

    async function registerWithEmail(email: string, password: string, displayName?: string) {
      const authInstance = await keepSessionLocal();
      const credential = await createUserWithEmailAndPassword(authInstance, email, password);
      const cleanName = displayName?.trim();
      if (cleanName) {
        await updateProfile(credential.user, { displayName: cleanName });
        await credential.user.reload();
        setUser(authInstance.currentUser);
      }
      return credential.user;
    }

    async function logout() {
      await signOut(getAuthInstance());
    }

    const isAuthenticated = Boolean(user && !user.isAnonymous);

    return {
      user,
      claims,
      loading,
      isAuthenticated,
      isAdmin: isAuthenticated && claims.admin === true,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      logout
    };
  }, [claims, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
