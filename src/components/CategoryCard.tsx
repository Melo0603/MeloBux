import { Link } from "react-router-dom";
import type { Category } from "../types";

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link to={`/categoria/${category.slug}`} className="category-card">
      <img src={category.imageUrl} alt={category.name} />
      <strong>{category.name}</strong>
    </Link>
  );
}
