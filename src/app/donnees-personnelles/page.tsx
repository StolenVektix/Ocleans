import type { Metadata } from "next";

export const metadata: Metadata = { title: "Données personnelles — Ocleans" };

const ROWS = [
  { data: "Email et mot de passe (chiffré)", why: "Vous connecter", how: "Jusqu'à la suppression du compte" },
  { data: "Prénom, rôle, établissement, courte bio", why: "Présenter les hôtes et les étudiants", how: "Jusqu'à la suppression du compte" },
  { data: "Repas proposés, adresse exacte", why: "Organiser les repas ; l'adresse n'est donnée qu'aux étudiants acceptés", how: "Jusqu'à la suppression du compte" },
  { data: "Demandes, messages, avis, signalements", why: "Faire fonctionner les échanges et la modération", how: "Anonymisés à la suppression du compte" },
  { data: "Photo de carte étudiante", why: "Vérifier le statut étudiant", how: "Supprimée dès la décision, au plus tard après 30 jours" },
  { data: "Numéro étudiant et établissement", why: "Garder la preuve de la vérification", how: "Supprimés avec le compte" },
  { data: "Notifications", why: "Vous prévenir des événements qui vous concernent", how: "Supprimées avec le compte" },
];

export default function PersonalDataPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Données personnelles</h1>
      <p className="text-stone-700">
        Ocleans est un prototype de mise en relation entre habitants et étudiants à Bordeaux. Nous ne collectons que ce qui est nécessaire
        pour organiser des repas partagés en confiance. Rien n'est vendu ni utilisé à des fins publicitaires.
      </p>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-700">
            <tr>
              <th className="p-3">Donnée</th>
              <th className="p-3">Pourquoi</th>
              <th className="p-3">Combien de temps</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.data} className="border-t border-stone-100 align-top">
                <td className="p-3 font-medium">{r.data}</td>
                <td className="p-3">{r.why}</td>
                <td className="p-3">{r.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Où sont vos données ?</h2>
        <p className="text-stone-700">
          Base de données et stockage des photos chez Neon (Union européenne, Francfort) ; application hébergée par Vercel.
          Les fonds de carte viennent d'OpenStreetMap, et la carte ne montre que le quartier, jamais l'adresse.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Vos droits</h2>
        <p className="text-stone-700">
          Vous pouvez à tout moment supprimer votre compte depuis la page « Mon compte ». Vos messages et avis restent lisibles par l'autre
          personne, mais signés « Utilisateur supprimé ». Pour toute autre demande (accès, rectification), contactez l'équipe Ocleans.
        </p>
      </section>
    </main>
  );
}
