import { CardForm } from "@/components/card-form";
import { EmailVerificationPanel } from "@/components/email-verification-panel";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { getVerificationOverview } from "@/server/verification/service";
import { requireProfile } from "@/server/session";

export default async function VerificationPage() {
  const actor = await requireProfile("student");
  const overview = await getVerificationOverview(getDb(), actor);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Vérifier mon statut étudiant</h1>

      {overview.status === "verified" ? (
        <Card className="space-y-3">
          <Badge tone="green">Statut étudiant vérifié</Badge>
          <p>Vous pouvez demander à partager des repas.</p>
          <LinkButton href="/repas">Voir les repas</LinkButton>
        </Card>
      ) : overview.status === "pending" ? (
        <Card className="space-y-2">
          <Badge tone="amber">En cours de vérification</Badge>
          <p className="text-stone-700">Votre carte a bien été reçue. L'équipe Ocleans la vérifie au plus vite.</p>
        </Card>
      ) : (
        <>
          {overview.status === "rejected" && overview.latest?.rejectionReason && (
            <Card className="border-red-200 bg-red-50">
              <p className="text-red-800"><strong>Votre dernière demande a été refusée :</strong> {overview.latest.rejectionReason}</p>
              <p className="text-sm text-red-800">Vous pouvez envoyer une nouvelle demande ci-dessous.</p>
            </Card>
          )}

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Avec mon adresse universitaire</h2>
            {overview.email && overview.university ? (
              <EmailVerificationPanel email={overview.email} alreadyConfirmed={overview.emailVerified} />
            ) : (
              <p className="text-stone-600">
                Votre compte utilise l'adresse {overview.email ?? "inconnue"}, qui n'est pas une adresse étudiante reconnue
                (par exemple <strong>prenom.nom@etu.u-bordeaux.fr</strong>). Créez un compte avec votre adresse universitaire,
                ou utilisez votre carte étudiante ci-dessous.
              </p>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Avec ma carte étudiante</h2>
            <CardForm />
          </Card>
        </>
      )}
    </main>
  );
}
