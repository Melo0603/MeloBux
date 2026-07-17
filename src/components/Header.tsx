import {
  Gamepad2,
  Gem,
  Headphones,
  Home,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Music2,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Sun,
  Ticket,
  UserPlus,
  X,
  type LucideIcon
} from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuthUser } from "../hooks/useAuthUser";
import { useThemeMode } from "../hooks/useThemeMode";
import type { StoreSettings } from "../types";
import { NotificationCenter } from "./NotificationCenter";

interface HeaderProps {
  settings: StoreSettings;
  cartCount: number;
}

interface DrawerItem {
  to: string;
  label: string;
  icon: LucideIcon;
  auth?: boolean;
  external?: boolean;
}

export function Header({ settings, cartCount }: HeaderProps) {
  const { isAuthenticated, logout, user } = useAuthUser();
  const { darkMode, toggleTheme } = useThemeMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const tiktokUrl = settings.tiktokUrl || "https://www.tiktok.com/@carloss0603";
  const userName = user?.displayName || user?.email?.split("@")[0] || "Usuario";
  const userInitial = userName.slice(0, 1).toUpperCase();
  const closeDrawer = () => setDrawerOpen(false);

  const drawerItems: DrawerItem[] = [
    { to: "/", label: "Inicio", icon: Home },
    { to: "/categoria/gamepass", label: "Gamepass", icon: Gamepad2 },
    { to: "/categoria/robux-na-conta", label: "Robux", icon: Gem },
    { to: "/carrinho", label: "Carrinho", icon: ShoppingCart },
    { to: "/compras", label: "Suas compras", icon: Package, auth: true },
    { to: "/suporte", label: "Suporte", icon: Headphones, auth: true },
    { to: "/#cupons", label: "Cupons", icon: Ticket },
    { to: "/#avaliacoes", label: "Avaliacoes", icon: Sparkles },
    { to: tiktokUrl, label: "TikTok Melo", icon: Music2, external: true }
  ];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim().toLowerCase();
    if (!term) return;

    if (term.includes("game")) navigate("/categoria/gamepass");
    else if (term.includes("robux")) navigate("/categoria/robux-na-conta");
    else if (term.includes("cupom")) navigate("/#cupons");
    else if (term.includes("avali")) navigate("/#avaliacoes");
    else if (term.includes("compra") || term.includes("pedido")) navigate(isAuthenticated ? "/compras" : "/login");
    else navigate("/categoria/gamepass");

    setSearch("");
  }

  return (
    <header className="app-header">
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

      <form className="header-search" role="search" onSubmit={submitSearch}>
        <Search size={18} aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar Robux, Gamepass ou pedido"
          aria-label="Buscar na MeloBux"
        />
      </form>

      <nav className="top-nav" aria-label="Acoes">
        <NavLink to="/carrinho" className="icon-link cart-link" title="Carrinho">
          <ShoppingCart size={20} aria-hidden />
          <span>{cartCount}</span>
        </NavLink>
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
            <NavLink to="/compras" className="auth-user-pill" title={user?.email || userName}>
              {user?.photoURL ? <img src={user.photoURL} alt="" /> : <span>{userInitial}</span>}
              <strong>{userName}</strong>
            </NavLink>
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

      {drawerOpen ? <button type="button" className="drawer-backdrop" aria-label="Fechar area do menu" onClick={closeDrawer} /> : null}
      <aside className={drawerOpen ? "side-drawer open" : "side-drawer"} aria-hidden={!drawerOpen}>
        <div className="drawer-header">
          <strong>MeloBux</strong>
          <button type="button" className="icon-button" aria-label="Fechar menu" onClick={closeDrawer}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav aria-label="Menu lateral">
          {drawerItems
            .filter((item) => !item.auth || isAuthenticated)
            .map((item) => {
              const Icon = item.icon;
              return item.external ? (
                <a key={item.label} href={item.to} target="_blank" rel="noreferrer" onClick={closeDrawer}>
                  <Icon size={18} aria-hidden />
                  {item.label}
                </a>
              ) : (
                <Link key={item.label} to={item.to} onClick={closeDrawer}>
                  <Icon size={18} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          <button type="button" onClick={toggleTheme}>
            {darkMode ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            {darkMode ? "Modo claro" : "Modo escuro"}
          </button>
          {!isAuthenticated ? (
            <Link to="/login" onClick={closeDrawer}>
              <LogIn size={18} aria-hidden />
              Entrar
            </Link>
          ) : null}
          {!isAuthenticated ? (
            <Link to="/login?mode=register" onClick={closeDrawer}>
              <UserPlus size={18} aria-hidden />
              Registrar
            </Link>
          ) : null}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                closeDrawer();
                void logout();
              }}
            >
              <LogOut size={18} aria-hidden />
              Sair
            </button>
          ) : null}
        </nav>
      </aside>
    </header>
  );
}
