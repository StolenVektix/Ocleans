import Link from "next/link";
import { getCurrentProfile } from "@/server/session";

export async function SiteFooter() {
  const profile = await getCurrentProfile();
  return (
    <footer className="mx-auto mt-10 flex max-w-2xl flex-wrap gap-4 border-t border-stone-200 px-4 py-6 text-sm text-stone-500">
      <Link href="/donnees-personnelles" className="underline">Données personnelles</Link>
      {profile && <Link href="/compte" className="underline">Mon compte</Link>}
      <span>Ocleans · prototype · Bordeaux</span>
    </footer>
  );
}
