import { CreditCard, PackageCheck, ShoppingCart, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/LoadingState";
import { RatingStars } from "../components/RatingStars";
import { useCartContext } from "../context/CartContext";
import { useSeo } from "../hooks/useSeo";
import { useReviews } from "../hooks/useStoreContent";
import { rememberPendingCheckoutOrder } from "../lib/checkoutSession";
import { formatCurrency, formatRobux } from "../lib/format";
import { createCheckoutPreference, subscribeCategory, subscribeProduct, trackProductView } from "../services/catalog";
import type { Category, Product } from "../types";

function validRobloxUsername(value: string) {
  return /^[A-Za-z0-9_]{3,20}$/.test(value);
}

export function ProductPage() {
  const { productId = "" } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [robloxUsername, setRobloxUsername] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { addItem } = useCartContext();
  const reviews = useReviews(false).filter((review) => review.productId === productId);

  useEffect(() => subscribeProduct(productId, setProduct), [productId]);

  useEffect(() => {
    if (productId) trackProductView(productId);
  }, [productId]);

  useEffect(() => {
    if (!product?.categorySlug) return undefined;
    return subscribeCategory(product.categorySlug, setCategory);
  }, [product?.categorySlug]);

  const seoImage = product?.imageUrl || category?.imageUrl || category?.bannerUrl;

  useSeo({
    title: `${product?.name || "Produto"} | MeloBux`,
    description: product?.description || "Produto MeloBux com entrega acompanhada.",
    image: seoImage
  });

  if (!product) {
    return (
      <main className="content-shell">
        <EmptyState>Produto não encontrado.</EmptyState>
      </main>
    );
  }

  const currentProduct = product;
  const productImage = currentProduct.imageUrl || category?.imageUrl || category?.bannerUrl;

  function assertUsername() {
    if (!validRobloxUsername(robloxUsername)) {
      setMessage("Informe um usuário Roblox válido com 3 a 20 caracteres.");
      return false;
    }

    return true;
  }

  async function handleBuy() {
    if (!assertUsername()) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await createCheckoutPreference({
        productId: currentProduct.id,
        robloxUsername,
        couponCode
      });
      const initPoint = response.data.initPoint;

      if (!initPoint) throw new Error("Checkout não retornou URL de pagamento.");

      rememberPendingCheckoutOrder(response.data.orderId);
      window.location.href = initPoint;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível iniciar a compra.");
      setBusy(false);
    }
  }

  function handleAddCart() {
    if (!assertUsername()) return;
    addItem(currentProduct, robloxUsername);
    setMessage("Produto adicionado ao carrinho.");
  }

  return (
    <main className="content-shell product-page">
      <section className="product-detail">
        <div className="product-media">
          {productImage ? <img src={productImage} alt={currentProduct.name} /> : null}
        </div>

        <div className="product-info">
          <Link to={`/categoria/${currentProduct.categorySlug}`} className="text-link">
            {category?.name || currentProduct.categorySlug}
          </Link>
          <h1>{currentProduct.name}</h1>
          <div className="price-line">
            <strong>{formatCurrency(currentProduct.price)}</strong>
            <span>{formatRobux(currentProduct.quantity)} Robux</span>
          </div>
          <p>{currentProduct.description}</p>

          <div className="info-list">
            <span>
              <PackageCheck size={18} aria-hidden />
              {currentProduct.deliveryTime}
            </span>
          </div>

          <label className="field">
            Usuário do Roblox
            <input
              value={robloxUsername}
              onChange={(event) => setRobloxUsername(event.target.value.trim())}
              placeholder="carloss0603"
              autoComplete="off"
            />
          </label>

          <label className="field coupon-field">
            Cupom
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase().trim())}
              placeholder="MELO10"
              autoComplete="off"
            />
          </label>

          <div className="action-row">
            <button type="button" className="primary-button" disabled={busy} onClick={handleBuy}>
              <CreditCard size={18} aria-hidden />
              Comprar
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={handleAddCart}
            >
              <ShoppingCart size={18} aria-hidden />
              Adicionar ao carrinho
            </button>
          </div>

          {message ? <p className="form-message">{message}</p> : null}
        </div>
      </section>

      <section className="detail-grid simple-detail-grid">
        <article>
          <h2>Entrega</h2>
          <p>{category?.deliveryNotice || "A entrega começa após a confirmação do pagamento."}</p>
        </article>
        <article>
          <h2>Compra segura</h2>
          <p>A MeloBux nunca pede senha da sua conta Roblox. Todos os valores são recalculados no backend.</p>
        </article>
        <article>
          <h2>Cupom</h2>
          <p>
            <Ticket size={16} aria-hidden />
            Digite o cupom antes de comprar para aplicar o desconto disponível.
          </p>
        </article>
        <article>
          <h2>Avaliações</h2>
          {reviews.length ? (
            reviews.map((review) => (
              <div key={review.id} className="compact-item">
                <RatingStars rating={review.rating} />
                <strong>{review.author}</strong>
                <p>{review.text}</p>
              </div>
            ))
          ) : (
            <p>Este produto ainda não tem avaliações de clientes.</p>
          )}
        </article>
      </section>
    </main>
  );
}
