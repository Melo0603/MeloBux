import { ArrowLeft, ChevronDown, MessageCircle, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CustomerChatModal } from "../components/CustomerChatModal";
import { EmptyState } from "../components/LoadingState";
import { RatingStars } from "../components/RatingStars";
import { useSeo } from "../hooks/useSeo";
import { useProducts, useReviews } from "../hooks/useStoreContent";
import { formatCurrency, formatRobux } from "../lib/format";
import { subscribeCategory } from "../services/catalog";
import type { Category, Product } from "../types";

function ProductPicker({ products, onCustom }: { products: Product[]; onCustom: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleProducts = products.filter((product) => {
    const haystack = `${product.name} ${product.quantity} ${product.price}`.toLowerCase();
    return haystack.includes(query.toLowerCase().trim());
  });
  const showCustom = "personalizado".includes(query.toLowerCase().trim());

  return (
    <div className="product-picker">
      <button
        type="button"
        className={open ? "product-picker-trigger open" : "product-picker-trigger"}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>Selecione um item</span>
        <ChevronDown size={18} aria-hidden />
      </button>

      {open ? (
        <div className="product-picker-menu">
          <label className="product-picker-search">
            <span className="sr-only">Buscar item</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar item..."
              autoFocus
            />
            <Search size={18} aria-hidden />
          </label>

          <div className="product-picker-list">
            {visibleProducts.length ? (
              visibleProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/produto/${product.id}`}
                  className="product-picker-option"
                  onClick={() => setOpen(false)}
                >
                  <span>
                    <strong>{formatRobux(product.quantity)} Robux</strong>
                    <small>{product.stock} em estoque</small>
                  </span>
                  <b>{formatCurrency(product.price)}</b>
                </Link>
              ))
            ) : null}
            {showCustom ? (
              <button
                type="button"
                className="product-picker-option custom-picker-option"
                onClick={() => {
                  setOpen(false);
                  onCustom();
                }}
              >
                <span>
                  <strong>Personalizado</strong>
                  <small>Escolha qualquer quantidade</small>
                </span>
                <b>Chat</b>
              </button>
            ) : (
              null
            )}
            {!visibleProducts.length && !showCustom ? <p>Nenhum item encontrado.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryPage() {
  const { slug = "" } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [customQuantity, setCustomQuantity] = useState("");
  const products = useProducts(slug, false);
  const reviews = useReviews(false).filter((review) => review.categorySlug === slug);

  useEffect(() => subscribeCategory(slug, setCategory), [slug]);

  useSeo({
    title: `${category?.name || "Categoria"} | MeloBux`,
    description: category?.description || "Categoria MeloBux com produtos disponíveis.",
    image: category?.bannerUrl || category?.imageUrl
  });

  if (!category) {
    return (
      <main className="content-shell">
        <EmptyState>Categoria não encontrada.</EmptyState>
      </main>
    );
  }

  const customChatText = customQuantity.trim()
    ? `Oi Melo, quero comprar ${customQuantity.trim()} Robux personalizados.`
    : "Oi Melo, quero comprar uma quantidade personalizada de Robux.";

  return (
    <main>
      <section className="category-hero simple-category-hero">
        <img src={category.bannerUrl || category.imageUrl} alt={category.name} />
        <div className="category-hero-content">
          <Link to="/" className="text-link">
            <ArrowLeft size={18} aria-hidden />
            Voltar
          </Link>
          <p className="eyebrow">Categoria</p>
          <h1>{category.name}</h1>
          <p>{category.description}</p>

          <div className="category-facts">
            <span>{category.deliveryTime}</span>
            <span>{category.importantInfo}</span>
            <span>{category.deliveryNotice}</span>
          </div>
        </div>
      </section>

      <section className="content-shell">
        <div className="section-heading">
          <h2>Escolha seu item</h2>
        </div>

        {products.length ? (
          <ProductPicker products={products} onCustom={() => setCustomOpen(true)} />
        ) : (
          <EmptyState>Nenhum produto ativo nesta categoria.</EmptyState>
        )}

        <section className="reviews-band">
          <h2>Avaliações desta categoria</h2>
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
              As avaliações aparecerão depois que pedidos entregues forem avaliados por clientes.
            </p>
          )}
        </section>
      </section>

      {customOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Robux personalizado">
          <section className="custom-robux-modal">
            <header className="modal-title-row">
              <h2>Personalizado</h2>
              <button type="button" className="icon-button" onClick={() => setCustomOpen(false)} aria-label="Fechar">
                <X size={18} aria-hidden />
              </button>
            </header>
            <p>Escolha qualquer quantidade de Robux.</p>
            <label className="field">
              Digite a quantidade desejada.
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={customQuantity}
                onChange={(event) => setCustomQuantity(event.target.value)}
                placeholder="Ex: 1500"
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setCustomOpen(false);
                setChatOpen(true);
              }}
            >
              <MessageCircle size={18} aria-hidden />
              Conversar com Melo
            </button>
          </section>
        </div>
      ) : null}

      <CustomerChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialText={customChatText}
      />
    </main>
  );
}
