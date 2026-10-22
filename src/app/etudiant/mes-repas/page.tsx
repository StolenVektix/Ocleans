import Link from "next/link";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { CancelForm } from "@/components/cancel-form";
import { Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { cancelBookingAction } from "@/server/bookings/actions";
import { listStudentBookings } from "@/server/bookings/service";
import { currentTime } from "@/server/clock";
import { requireProfile } from "@/server/session";

export default async function StudentMealsPage() {
  const actor = await requireProfile("student");
  const list = await listStudentBookings(getDb(), actor);
  const now = currentTime();
  const upcoming = list.filter((b) => b.meal.startsAt.getTime() > now);
  const past = list.filter((b) => b.meal.startsAt.getTime() <= now);

  const section = (title: string, items: typeof list) => (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-sm text-stone-500">Rien pour l'instant.</p>}
      {items.map((b) => (
        <Card key={b.id} className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/repas/${b.meal.id}`} className="font-semibold underline-offset-2 hover:underline">{b.meal.title}</Link>
            <BookingStatusBadge status={b.status} />
          </div>
          <p className="text-sm text-stone-600">{formatMealDate(b.meal.startsAt)} · {b.meal.neighborhood} · chez {b.meal.hostFirstName}</p>
          {b.meal.address && <p className="text-sm text-green-900"><strong>Adresse :</strong> {b.meal.address}</p>}
          {b.status === "cancelled" && b.cancelReason && (
            <p className="text-sm text-stone-600">Annulée : {b.cancelReason}</p>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            {b.actions.messages && <Link href={`/messages/${b.id}`} className="font-medium text-orange-700 underline">Messages</Link>}
            {b.actions.review && <Link href={`/avis/${b.id}`} className="font-medium text-orange-700 underline">Laisser un avis</Link>}
            {b.actions.report && <Link href={`/signaler/${b.id}`} className="text-stone-500 underline">Signaler</Link>}
          </div>
          {b.actions.cancel && (
            <CancelForm action={cancelBookingAction.bind(null, b.id)} buttonLabel="Annuler ma venue" confirmLabel="Confirmer l'annulation" />
          )}
        </Card>
      ))}
    </section>
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mes repas</h1>
        <LinkButton href="/repas" variant="secondary">Trouver un repas</LinkButton>
      </div>
      {section("À venir", upcoming)}
      {section("Passés", past)}
    </main>
  );
}
