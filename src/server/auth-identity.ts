import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Tx } from "@/server/meals/service";

// Source de vérité de la vérification email : la table Neon Auth, jamais le cache de session (5 min).
export async function getAuthIdentity(db: Db | Tx, userId: string): Promise<{ email: string; emailVerified: boolean } | null> {
  const result = await db.execute(
    sql`select email, "emailVerified" as "emailVerified" from neon_auth."user" where id::text = ${userId} limit 1`,
  );
  const row = result.rows[0] as { email: string; emailVerified: boolean } | undefined;
  return row ? { email: row.email, emailVerified: Boolean(row.emailVerified) } : null;
}
