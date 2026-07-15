import { Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatRobux } from "../lib/format";
import type { Product } from "../types";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <div>
        <span className="product-quantity">{formatRobux(product.quantity)} Robux</span>
        <strong>{formatCurrency(product.price)}</strong>
      </div>
      <Link to={`/produto/${product.id}`} className="primary-button">
        <Eye size={18} aria-hidden />
        Ver produto
      </Link>
    </article>
  );
}
