import { ReviewButtons } from "@/components/review-buttons";
import { Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { getCardStorage } from "@/services/storage";
import { requireProfile } from "@/server/session";
import { listPendingCards } from "@/server/verification/service";

export default async function AdminVerificationsPage() {
  const actor = await requireProfile("admin");
  const cards = await listPendingCards(getDb(), getCardStorage(), actor);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Cartes étudiantes à vérifier ({cards.length})</h1>
      {cards.length === 0 && <p className="text-stone-600">Aucune carte en attente.</p>}
      {cards.map((card) => (
        <Card key={card.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{card.firstName}</h2>
            <p className="text-sm text-stone-600">
              {card.school} · n° {card.studentNumber} · envoyée {formatMealDate(card.createdAt)}
            </p>
          </div>
          {card.imageUrl ? (
            // URL signée de 5 minutes vers un bucket privé : next/image n'apporte rien ici.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt={`Carte étudiante de ${card.firstName}`} className="max-h-80 w-full rounded-lg border border-stone-200 object-contain" />
          ) : (
            <p className="text-sm text-red-700">Photo introuvable.</p>
          )}
          <ReviewButtons verificationId={card.id} />
        </Card>
      ))}
    </main>
  );
}
