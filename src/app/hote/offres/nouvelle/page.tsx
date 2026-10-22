import { MealForm } from "@/components/meal-form";
import { createMealAction } from "@/server/meals/actions";
import { requireProfile } from "@/server/session";

export default async function NewMealPage() {
  await requireProfile("host");
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Proposer un repas</h1>
      <MealForm action={createMealAction} submitLabel="Publier le repas" />
    </main>
  );
}
