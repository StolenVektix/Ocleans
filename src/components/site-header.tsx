import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentProfile } from "@/server/session";

export async function SiteHeader() {
  const profile = await getCurrentProfile();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-orange-700">Ocleans</Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/repas">Repas</Link>
          {profile?.role === "student" && <Link href="/etudiant/mes-repas">Mes repas</Link>}
          {profile?.role === "student" && profile.verificationStatus !== "verified" && (
            <Link href="/etudiant/verification" className="font-medium text-orange-700">Vérification</Link>
          )}
          {profile?.role === "host" && <Link href="/hote/offres">Mes offres</Link>}
          {profile?.role === "admin" && (
            <>
              <Link href="/admin/verifications">Vérifications</Link>
              <Link href="/admin/signalements">Signalements</Link>
            </>
          )}
          {profile ? (
            <>
              <span className="text-stone-500">{profile.firstName}</span>
              <SignOutButton />
            </>
          ) : (
            <Link href="/connexion" className="font-medium text-orange-700">Connexion</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
