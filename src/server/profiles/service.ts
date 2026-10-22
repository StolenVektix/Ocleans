import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";

const profileSchema = z
  .object({
    role: z.enum(["student", "host"], { error: "Choisissez votre profil" }),
    firstName: z.string().trim().min(1, "Indiquez votre prénom").max(40, "40 caractères maximum"),
    school: z.string().trim().max(80, "80 caractères maximum").default(""),
  })
  .refine((v) => v.role !== "student" || v.school.length > 0, {
    path: ["school"],
    message: "Indiquez votre établissement",
  });

export async function createProfile(db: Db, userId: string, raw: unknown): Promise<Profile> {
  const input = profileSchema.parse(raw);
  await db
    .insert(profiles)
    .values({
      userId,
      role: input.role,
      firstName: input.firstName,
      school: input.role === "student" ? input.school : null,
    })
    .onConflictDoNothing();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return profile;
}
