import { Music2, ShieldCheck, ShoppingBag, Sparkles, Ticket, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { CategoryCard } from "../components/CategoryCard";
import { RatingStars } from "../components/RatingStars";
import { useSeo } from "../hooks/useSeo";
import { useCategories, useCoupons, useReviews, useSettings } from "../hooks/useStoreContent";

function couponLabel(type: string, value: number) {
  return type === "percent" ? `${value}% OFF` : `R$ ${value.toFixed(2).replace(".", ",")} OFF`;
}

export function HomePage() {
  const categories = useCategories(false).slice(0, 2);
  const settings = useSettings();
  const reviews = useReviews(false);
  const coupons = useCoupons().filter((coupon) => coupon.status === "active").slice(0, 3);
  const mascotImage = settings.homeBannerImageUrl || settings.ownerAvatarUrl || "/assets/melo-hero-drawing.png";
  const tiktokUrl = settings.tiktokUrl || "https://www.tiktok.com/@carloss0603";

  useSeo({
    title: `${settings.storeName} | Comprar Robux mais barato`,
    description: "Compre Robux e Gamepass com entrega acompanhada, cupom no checkout e avaliacao real apos pedido entregue.",
    image: mascotImage
  });

  return (
    <main className="home-page">
      <section className="hero-banner" aria-label="MeloBux">
        <span className="hero-blob hero-blob-one" aria-hidden />
        <span className="hero-blob hero-blob-two" aria-hidden />
        <div className="hero-copy">
          <p className="eyebrow">MeloBux Store</p>
          <h1>
            Robux com cara de
            <span> plataforma premium</span>
          </h1>
          <p className="hero-subtitle">
            Compre Robux e Gamepass com checkout seguro, entrega acompanhada e avaliacao liberada somente apos a entrega.
          </p>

          <div className="hero-badges" aria-label="Destaques">
            <span>
              <Zap size={18} aria-hidden />
              Entrega rapida
            </span>
            <span>
              <ShieldCheck size={18} aria-hidden />
              Compra segura
            </span>
            <span>
              <Ticket size={18} aria-hidden />
              Cupom no checkout
            </span>
          </div>

          <div className="hero-actions">
            <Link to="/categoria/gamepass" className="primary-button hero-primary">
              <ShoppingBag size={18} aria-hidden />
              Comprar agora
            </Link>
            <a
              href={tiktokUrl}
              target="_blank"
              rel="noreferrer"
              className="secondary-button hero-secondary"
              aria-label="Abrir TikTok @carloss0603"
            >
              <Music2 size={18} aria-hidden />
              TikTok
            </a>
          </div>
        </div>

        <div className="hero-mascot" aria-label="Mascote Melo">
          <span className="mascot-blur" aria-hidden />
          <img src={mascotImage} alt="Melo, mascote Roblox da MeloBux" />
        </div>
      </section>

      <section className="home-section category-section" aria-labelledby="home-categories-title">
        <div className="center-heading">
          <Sparkles size={20} aria-hidden />
          <h2 id="home-categories-title">Escolha seu produto</h2>
          <Sparkles size={20} aria-hidden />
        </div>
        <div className="home-grid">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </section>

      <section className="home-section buying-guide" aria-labelledby="home-guide-title">
        <div className="center-heading">
          <Sparkles size={20} aria-hidden />
          <h2 id="home-guide-title">Como comprar</h2>
          <Sparkles size={20} aria-hidden />
        </div>
        <div className="guide-grid">
          <article>
            <span>01</span>
            <h3>Escolha o item</h3>
            <p>Entre em Gamepass ou Robux na Conta e selecione a quantidade desejada.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Informe seu Roblox</h3>
            <p>Digite o usuario corretamente. A MeloBux nunca pede sua senha.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Acompanhe a entrega</h3>
            <p>Quando o pedido for entregue, a avaliacao real fica disponivel para voce.</p>
          </article>
        </div>
      </section>

      <section id="cupons" className="home-section coupon-band" aria-labelledby="home-coupons-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cupons</p>
            <h2 id="home-coupons-title">Descontos ativos</h2>
          </div>
        </div>
        {coupons.length ? (
          <div className="coupon-grid">
            {coupons.map((coupon) => (
              <article className="coupon-card" key={coupon.id}>
                <strong>{coupon.code}</strong>
                <span>{couponLabel(coupon.type, coupon.value)}</span>
                {coupon.minOrderValue ? <small>Pedido minimo de R$ {coupon.minOrderValue.toFixed(2).replace(".", ",")}</small> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">Nenhum cupom ativo no momento.</p>
        )}
      </section>

      <section id="avaliacoes" className="home-section reviews-band" aria-labelledby="home-reviews-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Avaliacoes</p>
            <h2 id="home-reviews-title">Clientes reais</h2>
          </div>
        </div>
        {reviews.length ? (
          <div className="review-list">
            {reviews.map((review) => (
              <article key={review.id} className="review-card">
                <RatingStars rating={review.rating} />
                <strong>{review.author}</strong>
                <p>{review.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">
            As avaliacoes de clientes aparecerao aqui apos pedidos entregues e avaliados.
          </p>
        )}
      </section>
    </main>
  );
}
