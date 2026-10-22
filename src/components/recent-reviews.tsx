import type { RecentReview } from "@/server/reviews/service";

export function RecentReviews({ reviews, title }: { reviews: RecentReview[]; title?: string }) {
  if (reviews.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {title && <p className="text-sm font-medium text-stone-700">{title}</p>}
      {reviews.map((r, i) => (
        <blockquote key={i} className="border-l-2 border-amber-300 pl-3 text-sm text-stone-700">
          <span className="text-amber-700">{"★".repeat(r.rating)}</span> « {r.comment} »
          <span className="text-stone-500"> — {r.authorFirstName}</span>
        </blockquote>
      ))}
    </div>
  );
}
