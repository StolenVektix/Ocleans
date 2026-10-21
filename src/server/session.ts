import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";
import type { Role } from "@/domain/types";
import { auth } from "@/lib/auth/server";

export async function getSessionUser(): Promise<{ id: string; name: string; email: string } | null> {
  const { data } = await auth.getSession();
  const user = data?.user;
  return user ? { id: user.id, name: user.name ?? "", email: user.email } : null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  return profile ?? null;
}

export function homeFor(role: Role): string {
  if (role === "host") return "/hote/offres";
  return "/repas";
}

export async function requireProfile(role?: Role): Promise<Profile> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!profile) redirect("/bienvenue");
  if (profile.suspended) redirect("/compte-suspendu");
  if (role && profile.role !== role) redirect(homeFor(profile.role));
  return profile;
}
