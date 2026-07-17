import { LogIn, LogOut, Menu, Moon, Music2, ShoppingCart, Sun, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import { useThemeMode } from "../hooks/useThemeMode";
import type { StoreSettings } from "../types";
import { NotificationCenter } from "./NotificationCenter";

interface HeaderProps {
  settings: StoreSettings;
  cartCount: number;
}

export function Header({ settings, cartCount }: HeaderProps) {
  const { isAuthenticated, logout, user } = useAuthUser();
  const { darkMode, toggleTheme } = useThemeMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tiktokUrl = settings.tiktokUrl || "https://www.tiktok.com/@carloss0603";
  const userName = user?.displayName || user?.email?.split("@")[0] || "Usuario";
  const userInitial = userName.slice(0, 1).toUpperCase();
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <header className="app-header simple-header">
      <button
        type="button"
        className="icon-button menu-toggle"
        aria-label="Abrir menu"
        onClick={() => setDrawerOpen(true)}
      >
        <Menu size={20} aria-hidden />
      </button>
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
        <button
          type="button"
          className="icon-button theme-toggle"
          onClick={toggleTheme}
          aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
          title={darkMode ? "Modo claro" : "Modo escuro"}
        >
          {darkMode ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </button>
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
      {drawerOpen ? <button type="button" className="drawer-backdrop" aria-label="Fechar menu" onClick={closeDrawer} /> : null}
      <aside className={drawerOpen ? "side-drawer open" : "side-drawer"} aria-hidden={!drawerOpen}>
        <div className="drawer-header">
          <strong>MeloBux</strong>
          <button type="button" className="icon-button" aria-label="Fechar menu" onClick={closeDrawer}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav aria-label="Menu lateral">
          <Link to="/" onClick={closeDrawer}>🏠 Início</Link>
          <Link to="/categoria/gamepass" onClick={closeDrawer}>🎮 Gamepass</Link>
          <Link to="/categoria/robux-na-conta" onClick={closeDrawer}>💎 Robux</Link>
          <Link to="/carrinho" onClick={closeDrawer}>🛒 Carrinho</Link>
          {isAuthenticated ? <Link to="/compras" onClick={closeDrawer}>📦 Suas Compras</Link> : null}
          {isAuthenticated ? <Link to="/suporte" onClick={closeDrawer}>💬 Suporte</Link> : null}
          <a href={tiktokUrl} target="_blank" rel="noreferrer" onClick={closeDrawer}>🎵 TikTok Melo</a>
          <button type="button" onClick={toggleTheme}>🌙 Modo escuro</button>
          {!isAuthenticated ? <Link to="/login" onClick={closeDrawer}>👤 Entrar</Link> : null}
          {!isAuthenticated ? <Link to="/login?mode=register" onClick={closeDrawer}>📝 Registrar</Link> : null}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                void logout();
              }}
            >
              🚪 Sair
            </button>
          ) : null}
        </nav>
      </aside>
    </header>
  );
}
