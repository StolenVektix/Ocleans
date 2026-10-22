import Link from "next/link";
import { MealCard } from "@/components/meal-card";
import { MealFilters } from "@/components/meal-filters";
import { MealsMap } from "@/components/meals-map";
import { groupMealsByNeighborhood } from "@/config/neighborhood-coordinates";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
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
  const view = first(sp.vue) === "carte" ? "carte" : "liste";
  const params = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1])));
  const hrefFor = (v: "liste" | "carte") => {
    const p = new URLSearchParams(params);
    if (v === "carte") p.set("vue", "carte");
    const qs = p.toString();
    return qs ? `/repas?${qs}` : "/repas";
  };
  const points = groupMealsByNeighborhood(
    list.map((m) => ({ id: m.id, title: m.title, neighborhood: m.neighborhood, when: formatMealDate(m.startsAt), seatsLeft: m.seatsLeft })),
  );

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Repas partagés à Bordeaux</h1>
      <MealFilters {...filters} vue={view} />
      <div className="flex gap-2 text-sm" role="tablist" aria-label="Affichage">
        {(["liste", "carte"] as const).map((v) => (
          <Link
            key={v}
            href={hrefFor(v)}
            role="tab"
            aria-selected={view === v}
            className={view === v ? "rounded-full bg-orange-600 px-3 py-1 font-medium text-white" : "rounded-full border border-stone-300 bg-white px-3 py-1"}
          >
            {v === "liste" ? "Liste" : "Carte"}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-stone-600">Aucun repas ne correspond pour le moment. Revenez bientôt !</p>
      ) : view === "carte" ? (
        <>
          <MealsMap points={points} />
          <p className="text-xs text-stone-500">Chaque cercle représente un quartier. L'adresse exacte n'est donnée qu'après acceptation.</p>
        </>
      ) : (
        <div className="space-y-3">
          {list.map((meal) => <MealCard key={meal.id} meal={meal} />)}
        </div>
      )}
    </main>
  );
}
