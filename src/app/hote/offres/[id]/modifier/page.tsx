import { notFound } from "next/navigation";
import { MealForm } from "@/components/meal-form";
import { getDb } from "@/db/client";
import { dateToParisLocal } from "@/domain/dates";
import { updateMealAction } from "@/server/meals/actions";
import { getHostMeal } from "@/server/meals/service";
import { requireProfile } from "@/server/session";

export default async function EditMealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile("host");
  const meal = await getHostMeal(getDb(), actor, id);
  if (!meal) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Modifier le repas</h1>
      <MealForm
        action={updateMealAction.bind(null, meal.id)}
        submitLabel="Enregistrer"
        defaults={{
          title: meal.title,
          description: meal.description,
          startsAtLocal: dateToParisLocal(meal.startsAt),
          neighborhood: meal.neighborhood,
          address: meal.address,
          seatsTotal: meal.seatsTotal,
          dietTags: meal.dietTags,
          allergens: meal.allergens,
        }}
      />
    </main>
  );
}
