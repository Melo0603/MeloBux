import { Star } from "lucide-react";
import { memo, useMemo } from "react";

export const RatingStars = memo(function RatingStars({ rating, count }: { rating: number; count?: number }) {
  const stars = useMemo(() => Array.from({ length: 5 }, (_, index) => index < Math.round(rating)), [rating]);

  return (
    <span className="rating" aria-label={`Avaliacao ${rating} de 5`}>
      {stars.map((filled, index) => (
        <Star key={index} size={17} fill={filled ? "currentColor" : "none"} aria-hidden />
      ))}
      <span>
        {rating.toFixed(1)}
        {count ? ` (${count})` : ""}
      </span>
    </span>
  );
});
