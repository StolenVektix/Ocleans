import { MealCard } from "@/components/meal-card";
import { MealFilters } from "@/components/meal-filters";
import { getDb } from "@/db/client";
import { listUpcomingMeals } from "@/server/meals/service";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function MealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = { quartier: first(sp.quartier), regime: first(sp.regime), jour: first(sp.jour) };
  const list = await listUpcomingMeals(getDb(), {
    neighborhood: filters.quartier,
    dietTag: filters.regime,
    day: filters.jour,
  });

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Repas partagés à Bordeaux</h1>
      <MealFilters {...filters} />
      {list.length === 0 ? (
        <p className="text-stone-600">Aucun repas ne correspond pour le moment. Revenez bientôt !</p>
      ) : (
        <div className="space-y-3">
          {list.map((meal) => <MealCard key={meal.id} meal={meal} />)}
        </div>
      )}
    </main>
  );
}
