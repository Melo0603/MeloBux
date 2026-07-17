import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onIdTokenChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { syncUserProfile } from "../services/catalog";
import { AuthContext, type AuthContextValue, type UserRole } from "./AuthContextCore";

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
  const [role, setRole] = useState<UserRole>("customer");
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.info("[MeloBux Auth] Google redirect completed", {
            uid: result.user.uid,
            email: result.user.email
          });
        }
      })
      .catch((error: unknown) => {
        console.error("[MeloBux Auth] Google redirect failed", error);
      });

    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      if (!active) return;
      console.info("[MeloBux Auth] ID token changed", {
        uid: currentUser?.uid ?? null,
        email: currentUser?.email ?? null
      });
      setUser(currentUser);
      try {
        if (!currentUser) {
          setClaims({});
          setRole("customer");
          return;
        }

        setClaims((await currentUser.getIdTokenResult()).claims);
        const response = await syncUserProfile();
        if (active) setRole(response.data.role);
      } catch {
        setClaims({});
        setRole("customer");
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
      console.info("[MeloBux Auth] Google popup start", {
        currentUser: authInstance.currentUser?.uid ?? null
      });
      try {
        const credential = await signInWithPopup(authInstance, googleProvider);
        console.info("[MeloBux Auth] Google popup success", {
          uid: credential.user.uid,
          email: credential.user.email
        });
        return credential.user;
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        console.error("[MeloBux Auth] Google popup failed", error);
        if (
          code.includes("auth/popup-closed-by-user") ||
          code.includes("auth/popup-blocked") ||
          code.includes("auth/cancelled-popup-request")
        ) {
          console.info("[MeloBux Auth] Falling back to Google redirect");
          await signInWithRedirect(authInstance, googleProvider);
          return null;
        }
        throw error;
      }
    }

    async function loginWithEmail(email: string, password: string) {
      const authInstance = await keepSessionLocal();
      const credential = await signInWithEmailAndPassword(authInstance, email, password);
      return credential.user;
    }

    async function loginWithCustomToken(token: string) {
      const authInstance = await keepSessionLocal();
      const credential = await signInWithCustomToken(authInstance, token);
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
    const canAccessAdmin = role === "admin" || role === "staff";

    return {
      user,
      claims,
      role,
      loading,
      isAuthenticated,
      isAdmin: isAuthenticated && canAccessAdmin,
      loginWithGoogle,
      loginWithEmail,
      loginWithCustomToken,
      registerWithEmail,
      logout
    };
  }, [claims, loading, role, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
