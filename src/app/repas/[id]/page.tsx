import { notFound } from "next/navigation";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { DietBadges } from "@/components/diet-badges";
import { RequestForm } from "@/components/request-form";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { currentTime } from "@/server/clock";
import { getMealForViewer } from "@/server/meals/service";
import { getCurrentProfile } from "@/server/session";

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentProfile();
  const meal = await getMealForViewer(getDb(), viewer, id);
  if (!meal) notFound();

  const isHost = viewer?.userId === meal.hostId;
  const open = meal.status === "open" && meal.startsAt.getTime() > currentTime();

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">{meal.title}</h1>
          {meal.status === "cancelled" ? <Badge>Annulé</Badge> : meal.seatsLeft === 0 ? <Badge>Complet</Badge> : <Badge tone="orange">{meal.seatsLeft} place(s)</Badge>}
        </div>
        <p className="text-stone-600">{formatMealDate(meal.startsAt)} · {meal.neighborhood} · chez {meal.hostFirstName}</p>
        <p className="whitespace-pre-line">{meal.description}</p>
        <DietBadges tags={meal.dietTags} />
        {meal.allergens && <p className="text-sm text-stone-600">Allergènes : {meal.allergens}</p>}
        {meal.address ? (
          <p className="rounded-lg bg-green-50 p-3 text-green-900"><strong>Adresse :</strong> {meal.address}</p>
        ) : (
          <p className="text-sm text-stone-500">L'adresse exacte est communiquée une fois votre demande acceptée.</p>
        )}
      </Card>

      <Card>
        {isHost ? (
          <div className="space-y-2">
            <p>C'est votre repas.</p>
            <LinkButton href="/hote/offres" variant="secondary">Gérer mes repas</LinkButton>
          </div>
        ) : !viewer ? (
          <div className="space-y-2">
            <p>Vous êtes étudiant·e ? Créez un compte pour demander à partager ce repas.</p>
            <LinkButton href="/inscription">Créer un compte</LinkButton>
          </div>
        ) : viewer.role !== "student" ? (
          <p className="text-stone-600">Seuls les étudiants peuvent demander à partager un repas.</p>
        ) : meal.viewerBooking ? (
          <div className="flex items-center gap-2">
            <span>Votre demande :</span>
            <BookingStatusBadge status={meal.viewerBooking.status} />
          </div>
        ) : !open ? (
          <p className="text-stone-600">Ce repas n'accepte plus de demandes.</p>
        ) : viewer.verificationStatus !== "verified" ? (
          <div className="space-y-2">
            <p className="text-stone-600">
              {viewer.verificationStatus === "pending"
                ? "Votre statut étudiant est en cours de vérification. Vous pourrez demander ce repas dès qu'il sera validé."
                : "Vérifiez votre statut étudiant pour demander à partager ce repas."}
            </p>
            {viewer.verificationStatus !== "pending" && <LinkButton href="/etudiant/verification">Vérifier mon statut</LinkButton>}
          </div>
        ) : meal.seatsLeft === 0 ? (
          <p className="text-stone-600">Ce repas est complet.</p>
        ) : (
          <RequestForm mealId={meal.id} hostFirstName={meal.hostFirstName} />
        )}
      </Card>
    </main>
  );
}
