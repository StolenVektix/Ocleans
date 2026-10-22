import type { Rating } from "@/domain/types";

export function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return null;
  return (
    <span className="whitespace-nowrap text-sm text-amber-700" aria-label={`Note moyenne ${rating.average} sur 5, ${rating.count} avis`}>
      ★ {rating.average.toFixed(1).replace(".", ",")} ({rating.count})
    </span>
  );
}
