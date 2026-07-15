import { Star } from "lucide-react";

export function RatingStars({ rating, count }: { rating: number; count?: number }) {
  const stars = Array.from({ length: 5 }, (_, index) => index < Math.round(rating));

  return (
    <span className="rating" aria-label={`Avaliação ${rating} de 5`}>
      {stars.map((filled, index) => (
        <Star
          key={index}
          size={17}
          fill={filled ? "currentColor" : "none"}
          aria-hidden
        />
      ))}
      <span>{rating.toFixed(1)}{count ? ` (${count})` : ""}</span>
    </span>
  );
}
