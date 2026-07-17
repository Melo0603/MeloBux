import { KeyRound, LogIn, Mail, RotateCcw, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import { isFirebaseConfigured } from "../lib/firebase";
import { requestAuthCode, resetPasswordWithCode, verifyAuthCode } from "../services/catalog";

type LoginMode = "login" | "register" | "code" | "forgot";

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
  const {
    isAuthenticated,
    loading,
    loginWithCustomToken,
    loginWithEmail,
    loginWithGoogle,
    registerWithEmail
  } = useAuthUser();
  const [mode, setMode] = useState<LoginMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "register") {
      setMode("register");
      setMessage("");
      setCode("");
      setCodeSent(false);
    }
  }, [location.search]);

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
      } else if (mode === "code") {
        if (!codeSent) {
          await requestAuthCode({ email: email.trim(), purpose: "login" });
          setCodeSent(true);
          setMessage("Enviamos um codigo para seu e-mail.");
          return;
        }
        const response = await verifyAuthCode({ email: email.trim(), code: code.trim() });
        await loginWithCustomToken(response.data.customToken);
      } else if (mode === "forgot") {
        if (!codeSent) {
          await requestAuthCode({ email: email.trim(), purpose: "password_reset" });
          setCodeSent(true);
          setMessage("Se este e-mail existir, enviamos um codigo de recuperacao.");
          return;
        }
        const response = await resetPasswordWithCode({
          email: email.trim(),
          code: code.trim(),
          password
        });
        await loginWithCustomToken(response.data.customToken);
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
      const loggedUser = await loginWithGoogle();
      if (loggedUser) navigate(redirectTo, { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setMessage("");
    setCode("");
    setCodeSent(false);
  }

  const title =
    mode === "register"
      ? "Criar conta"
      : mode === "code"
        ? "Entrar com codigo"
        : mode === "forgot"
          ? "Recuperar senha"
          : "Entrar";
  const Icon = mode === "register" ? UserPlus : mode === "code" ? KeyRound : mode === "forgot" ? RotateCcw : LogIn;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-heading">
          <span className="login-icon" aria-hidden>
            <Icon size={22} />
          </span>
          <div>
            <p>MeloBux</p>
            <h1 id="login-title">{title}</h1>
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

          {mode === "code" || mode === "forgot" ? (
            codeSent ? (
              <label className="field">
                Codigo recebido
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  minLength={6}
                  maxLength={6}
                  required
                  disabled={submitting}
                />
              </label>
            ) : null
          ) : null}

          {mode !== "code" ? (
            <label className="field">
              {mode === "forgot" ? "Nova senha" : "Senha"}
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={mode === "register" || mode === "forgot" ? "new-password" : "current-password"}
                minLength={6}
                required
                disabled={submitting || (mode === "forgot" && !codeSent)}
              />
            </label>
          ) : null}

          <button type="submit" className="primary-button" disabled={submitting}>
            <Icon size={18} aria-hidden />
            {mode === "code" && !codeSent
              ? "Enviar codigo"
              : mode === "forgot" && !codeSent
                ? "Enviar codigo"
                : mode === "register"
                  ? "Cadastrar"
                  : mode === "forgot"
                    ? "Alterar senha"
                    : "Entrar"}
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
            switchMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Criar conta por e-mail" : "Ja tenho conta"}
        </button>

        {mode !== "code" ? (
          <button type="button" className="text-button" onClick={() => switchMode("code")}>
            Entrar com codigo
          </button>
        ) : null}

        {mode !== "forgot" ? (
          <button type="button" className="text-button" onClick={() => switchMode("forgot")}>
            Esqueci minha senha
          </button>
        ) : null}

        {message ? <p className="form-message">{message}</p> : null}

        <Link to="/" className="login-back-link">
          Voltar para loja
        </Link>
      </section>
    </main>
  );
}
