import { LogIn, Mail, UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import { isFirebaseConfigured } from "../lib/firebase";

type LoginMode = "login" | "register";

function getAuthErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  if (code.includes("auth/invalid-credential")) return "E-mail ou senha invalidos.";
  if (code.includes("auth/email-already-in-use")) return "Este e-mail ja esta cadastrado.";
  if (code.includes("auth/weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
  if (code.includes("auth/popup-closed-by-user")) return "Login cancelado antes de concluir.";
  if (code.includes("auth/unauthorized-domain")) return "Dominio nao autorizado no Firebase Authentication.";

  return error instanceof Error ? error.message : "Nao foi possivel autenticar.";
}

export function LoginPage() {
  const { isAuthenticated, loading, loginWithEmail, loginWithGoogle, registerWithEmail } = useAuthUser();
  const [mode, setMode] = useState<LoginMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const redirectTo = useMemo(() => {
    const state = location.state as {
      from?: { pathname?: string; search?: string; hash?: string };
    } | null;
    const from = state?.from;
    const path = `${from?.pathname || "/"}${from?.search || ""}${from?.hash || ""}`;
    return path === "/login" ? "/" : path;
  }, [location.state]);

  if (!loading && isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      if (mode === "register") {
        await registerWithEmail(email.trim(), password, displayName);
      } else {
        await loginWithEmail(email.trim(), password);
      }
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function googleLogin() {
    setSubmitting(true);
    setMessage("");
    try {
      await loginWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-heading">
          <span className="login-icon" aria-hidden>
            {mode === "login" ? <LogIn size={22} /> : <UserPlus size={22} />}
          </span>
          <div>
            <p>MeloBux</p>
            <h1 id="login-title">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <p className="form-message">
            Configure o Firebase Authentication no arquivo .env para habilitar login.
          </p>
        ) : null}

        <form onSubmit={submit} className="login-form">
          {mode === "register" ? (
            <label className="field">
              Nome
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                disabled={submitting}
              />
            </label>
          ) : null}

          <label className="field">
            E-mail
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
              disabled={submitting}
            />
          </label>

          <label className="field">
            Senha
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={6}
              required
              disabled={submitting}
            />
          </label>

          <button type="submit" className="primary-button" disabled={submitting}>
            {mode === "login" ? <LogIn size={18} aria-hidden /> : <UserPlus size={18} aria-hidden />}
            {mode === "login" ? "Entrar" : "Cadastrar"}
          </button>
        </form>

        <button
          type="button"
          className="secondary-button google-login-button"
          onClick={googleLogin}
          disabled={submitting}
        >
          <Mail size={18} aria-hidden />
          Entrar com Google
        </button>

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "Criar conta por e-mail" : "Ja tenho conta"}
        </button>

        {message ? <p className="form-message">{message}</p> : null}

        <Link to="/" className="login-back-link">
          Voltar para loja
        </Link>
      </section>
    </main>
  );
}
