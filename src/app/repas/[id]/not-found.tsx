import { LinkButton } from "@/components/ui";

export default function MealNotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Repas introuvable</h1>
      <p className="text-stone-600">Ce repas n'existe pas ou n'est plus disponible.</p>
      <LinkButton href="/repas">Voir les repas</LinkButton>
    </main>
  );
}
