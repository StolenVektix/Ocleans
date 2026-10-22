import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-stone-600">Cette page n'existe pas, ou vous n'y avez pas accès.</p>
      <LinkButton href="/">Retour à l'accueil</LinkButton>
    </main>
  );
}
