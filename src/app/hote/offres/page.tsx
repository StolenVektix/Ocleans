import Link from "next/link";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { CancelForm } from "@/components/cancel-form";
import { RatingBadge } from "@/components/rating-badge";
import { RecentReviews } from "@/components/recent-reviews";
import { DecisionButtons } from "@/components/decision-buttons";
import { DietBadges } from "@/components/diet-badges";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { currentTime } from "@/server/clock";
import { cancelMealAction } from "@/server/meals/actions";
import { listHostMeals } from "@/server/meals/service";
import { requireProfile } from "@/server/session";

export default async function HostMealsPage() {
  const actor = await requireProfile("host");
  const list = await listHostMeals(getDb(), actor);
  const now = currentTime();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mes repas proposés</h1>
        <LinkButton href="/hote/offres/nouvelle">Proposer un repas</LinkButton>
      </div>

      {list.length === 0 && (
        <Card>
          <p className="text-stone-600">Vous n'avez pas encore proposé de repas. Une portion de plus suffit pour commencer !</p>
        </Card>
      )}

      {list.map((meal) => {
        const upcoming = meal.startsAt.getTime() > now && meal.status === "open";
        return (
          <Card key={meal.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{meal.title}</h2>
                <p className="text-sm text-stone-600">
                  {formatMealDate(meal.startsAt)} · {meal.neighborhood}
                </p>
                <p className="text-sm text-stone-500">{meal.address}</p>
              </div>
              {meal.status === "cancelled" ? (
                <Badge tone="neutral">Annulé</Badge>
              ) : upcoming ? (
                <Badge tone="orange">{meal.seatsLeft} place(s) libre(s) sur {meal.seatsTotal}</Badge>
              ) : (
                <Badge tone="neutral">Passé</Badge>
              )}
            </div>
            <DietBadges tags={meal.dietTags} />
            {upcoming && (
              <div className="flex flex-wrap items-start gap-2">
                <LinkButton href={`/hote/offres/${meal.id}/modifier`} variant="secondary">Modifier</LinkButton>
              </div>
            )}
            {meal.canCancel && (
              <CancelForm action={cancelMealAction.bind(null, meal.id)} buttonLabel="Annuler ce repas" confirmLabel="Confirmer l'annulation du repas" />
            )}
            {meal.status === "cancelled" && <p className="text-sm text-stone-600">Repas annulé.</p>}

            <div className="space-y-2 border-t border-stone-100 pt-3">
              <h3 className="text-sm font-semibold text-stone-700">Demandes ({meal.requests.length})</h3>
              {meal.requests.length === 0 && <p className="text-sm text-stone-500">Aucune demande pour l'instant.</p>}
              {meal.requests.map((r) => (
                <div key={r.id} className="space-y-2 rounded-lg bg-stone-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.studentFirstName}</span>
                    {r.studentSchool && <span className="text-sm text-stone-600">· {r.studentSchool}</span>}
                    {r.studentVerified && <Badge tone="green">Étudiant vérifié</Badge>}
                    <BookingStatusBadge status={r.status} />
                    <RatingBadge rating={r.studentRating} />
                  </div>
                  {r.requestMessage && <p className="text-sm text-stone-700">« {r.requestMessage} »</p>}
                  <RecentReviews reviews={r.studentReviews} title="Avis reçus par cet étudiant" />
                  {r.status === "cancelled" && r.cancelReason && (
                    <p className="text-sm text-stone-600">Annulée : {r.cancelReason}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-sm">
                    {r.actions.messages && <Link href={`/messages/${r.id}`} className="font-medium text-orange-700 underline">Messages</Link>}
                    {r.actions.review && <Link href={`/avis/${r.id}`} className="font-medium text-orange-700 underline">Laisser un avis</Link>}
                    {r.actions.report && <Link href={`/signaler/${r.id}`} className="text-stone-500 underline">Signaler</Link>}
                  </div>
                  {r.status === "pending" && upcoming && <DecisionButtons bookingId={r.id} />}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </main>
  );
}
