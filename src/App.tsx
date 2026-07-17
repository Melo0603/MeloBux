import { Link, Outlet } from "react-router-dom";
import { Header } from "./components/Header";
import { PaymentStatusWatcher } from "./components/PaymentStatusWatcher";
import { StorePopupHost } from "./components/StorePopupHost";
import { useCartContext } from "./context/CartContext";
import { useAuthUser } from "./hooks/useAuthUser";
import { useSettings } from "./hooks/useStoreContent";

export function App() {
  const settings = useSettings();
  const cart = useCartContext();
  const { isAuthenticated } = useAuthUser();
  const tiktokUrl = settings.tiktokUrl || "https://www.tiktok.com/@carloss0603";

  return (
    <>
      <Header settings={settings} cartCount={cart.count} />
      <PaymentStatusWatcher />
      <Outlet />
      <StorePopupHost />
      <footer className="app-footer simple-footer">
        <div className="footer-brand">
          {settings.ownerAvatarUrl ? <img src={settings.ownerAvatarUrl} alt="" /> : null}
          <div>
            <strong>{settings.storeName}</strong>
            <span>{settings.notice}</span>
          </div>
        </div>
        <nav aria-label="Rodape">
          <Link to="/">Inicio</Link>
          <Link to="/categoria/gamepass">Gamepass</Link>
          <Link to="/categoria/robux-na-conta">Robux na Conta</Link>
          <Link to="/#cupons">Cupons</Link>
          <Link to="/#avaliacoes">Avaliacoes</Link>
          <Link to="/carrinho">Carrinho</Link>
          {isAuthenticated ? <Link to="/compras">Suas compras</Link> : null}
          {isAuthenticated ? <Link to="/suporte">Suporte</Link> : null}
          <a href={tiktokUrl} target="_blank" rel="noreferrer">
            TikTok
          </a>
        </nav>
        <p>{settings.policy}</p>
      </footer>
    </>
  );
}
