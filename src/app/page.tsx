import { Card, LinkButton } from "@/components/ui";

const STEPS = [
  { title: "Une portion de plus", text: "Un habitant cuisine un peu plus que prévu et propose une place à sa table." },
  { title: "Une demande", text: "Un étudiant vérifié choisit un repas près de chez lui et se présente en quelques mots." },
  { title: "Un moment partagé", text: "L'hôte accepte, l'adresse est communiquée, et on se retrouve autour de la table." },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4 pt-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold leading-tight">Un repas partagé, un lien qui se crée.</h1>
        <p className="text-lg text-stone-700">
          À Bordeaux, des habitants cuisinent une portion de plus pour accueillir un étudiant à leur table.
          Gratuit, simple et chaleureux.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/repas" className="sm:flex-1">Je suis étudiant·e</LinkButton>
          <LinkButton href="/inscription" variant="secondary" className="sm:flex-1">Je propose un repas</LinkButton>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="space-y-1">
            <p className="text-sm font-semibold text-orange-700">{i + 1}.</p>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="text-sm text-stone-600">{s.text}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
