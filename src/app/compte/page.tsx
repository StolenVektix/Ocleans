import Link from "next/link";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { Card } from "@/components/ui";
import { requireProfile } from "@/server/session";

const ROLE_LABELS = { student: "Étudiant·e", host: "Hôte", admin: "Admin" } as const;

export default async function AccountPage() {
  const profile = await requireProfile();
  return (
    <main className="mx-auto max-w-md space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Mon compte</h1>
      <Card className="space-y-1">
        <p><strong>{profile.firstName}</strong> · {ROLE_LABELS[profile.role]}</p>
        {profile.school && <p className="text-sm text-stone-600">{profile.school}</p>}
      </Card>
      <Card className="space-y-3 border-red-200">
        <h2 className="text-lg font-semibold text-red-800">Supprimer mon compte</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>Vos repas et demandes à venir seront annulés, et les personnes concernées prévenues.</li>
          <li>Vos données de vérification et la photo de votre carte seront effacées.</li>
          <li>Vos messages et avis resteront lisibles, signés « Utilisateur supprimé ».</li>
          <li>Cette action est définitive.</li>
        </ul>
        <DeleteAccountForm />
      </Card>
      <p className="text-sm text-stone-500">
        En savoir plus : <Link href="/donnees-personnelles" className="underline">données personnelles</Link>.
      </p>
    </main>
  );
}
