import Link from "next/link";
import { DietBadges } from "@/components/diet-badges";
import { Badge, Card } from "@/components/ui";
import { formatMealDate } from "@/domain/dates";
import type { PublicMeal } from "@/server/meals/service";

export function MealCard({ meal }: { meal: PublicMeal }) {
  return (
    <Link href={`/repas/${meal.id}`} className="block">
      <Card className="space-y-2 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{meal.title}</h2>
          {meal.seatsLeft === 0 ? <Badge tone="neutral">Complet</Badge> : <Badge tone="orange">{meal.seatsLeft} place(s)</Badge>}
        </div>
        <p className="text-sm text-stone-600">
          {formatMealDate(meal.startsAt)} · {meal.neighborhood} · chez {meal.hostFirstName}
        </p>
        <DietBadges tags={meal.dietTags} />
      </Card>
    </Link>
  );
}
