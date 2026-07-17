import { LogIn, LogOut, Music2, ShoppingCart } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import type { StoreSettings } from "../types";
import { NotificationCenter } from "./NotificationCenter";

interface HeaderProps {
  settings: StoreSettings;
  cartCount: number;
}

export function Header({ settings, cartCount }: HeaderProps) {
  const { isAuthenticated, logout, user } = useAuthUser();
  const tiktokUrl = settings.tiktokUrl || "https://www.tiktok.com/@carloss0603";
  const userName = user?.displayName || user?.email?.split("@")[0] || "Usuario";
  const userInitial = userName.slice(0, 1).toUpperCase();

  return (
    <header className="app-header simple-header">
      <Link to="/" className="brand" aria-label="Ir para pagina inicial">
        <span className="brand-mark" aria-hidden>
          {settings.ownerAvatarUrl ? <img src={settings.ownerAvatarUrl} alt="" /> : null}
        </span>
        <span>
          Melo<span>Bux</span>
        </span>
      </Link>

      <nav className="site-nav" aria-label="Navegacao principal">
        <NavLink to="/">Inicio</NavLink>
        <NavLink to="/categoria/gamepass">Gamepass</NavLink>
        <NavLink to="/categoria/robux-na-conta">Robux</NavLink>
        <Link to="/#cupons">Cupons</Link>
        <Link to="/#avaliacoes">Avaliacoes</Link>
        {isAuthenticated ? <NavLink to="/compras">Suas compras</NavLink> : null}
      </nav>

      <nav className="top-nav" aria-label="Acoes">
        <NavLink to="/carrinho" className="icon-link cart-link" title="Carrinho">
          <ShoppingCart size={20} aria-hidden />
          <span>{cartCount}</span>
        </NavLink>
        <a
          className="icon-link"
          href={tiktokUrl}
          target="_blank"
          rel="noreferrer"
          title="TikTok @carloss0603"
        >
          <Music2 size={20} aria-hidden />
        </a>
        {isAuthenticated ? <NotificationCenter /> : null}
        {isAuthenticated ? (
          <div className="auth-user-menu">
            <span className="auth-user-pill" title={user?.email || userName}>
              {user?.photoURL ? <img src={user.photoURL} alt="" /> : <span>{userInitial}</span>}
              <strong>{userName}</strong>
            </span>
            <button type="button" className="icon-button" onClick={() => void logout()} aria-label="Sair">
              <LogOut size={18} aria-hidden />
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="login-button" title="Entrar">
            <LogIn size={18} aria-hidden />
            Entrar
          </NavLink>
        )}
      </nav>
    </header>
  );
}
