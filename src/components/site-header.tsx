import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getDb } from "@/db/client";
import { scheduleEmailDelivery } from "@/server/notifications/delivery";
import { countUnread, ensureReminders } from "@/server/notifications/service";
import { getCurrentProfile } from "@/server/session";

export async function SiteHeader() {
  const profile = await getCurrentProfile();
  let unread = 0;
  if (profile && !profile.suspended) {
    const db = getDb();
    // Rappels « la veille » créés à l'affichage : les crons Vercel ne tournent qu'en Production.
    if ((await ensureReminders(db, { userId: profile.userId })) > 0) scheduleEmailDelivery();
    unread = await countUnread(db, profile.userId);
  }
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
              <Link href="/notifications" className="relative" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}>
                {/* Icône SVG plutôt qu'un emoji : certains appareils n'ont pas de police emoji. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-2 -top-1 rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
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
