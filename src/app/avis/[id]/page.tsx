import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/review-form";
import { Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { getReviewPrompt } from "@/server/reviews/service";
import { requireProfile } from "@/server/session";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const prompt = await getReviewPrompt(getDb(), actor, id);
  if (!prompt) notFound();
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Votre avis sur « {prompt.mealTitle} »</h1>
      <Card>
        {prompt.allowed ? (
          <ReviewForm bookingId={prompt.bookingId} otherFirstName={prompt.otherFirstName} />
        ) : prompt.alreadyReviewed ? (
          <p className="rounded-lg bg-green-50 p-3 text-green-800">Merci, votre avis sur {prompt.otherFirstName} est enregistré.</p>
        ) : (
          <p className="text-stone-600">{prompt.reason}</p>
        )}
      </Card>
    </main>
  );
}
