import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { isE2eEmail } from "../src/server/e2e-accounts";
import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const storage = createNeonStorage(storageConfigFromEnv());
  const users = (await db.execute(sql`select id::text as id, email from neon_auth."user" where email like 'e2e+%@example.com'`)).rows as { id: string; email: string }[];
  const targets = users.filter((u) => isE2eEmail(u.email));
  for (const u of targets) {
    const cards = (await db.execute(sql`select card_object_key from verifications where user_id = ${u.id} and card_object_key is not null`)).rows as { card_object_key: string }[];
    for (const c of cards) await storage.delete(c.card_object_key).catch(() => undefined);
    // La suppression du profil efface en cascade repas, demandes, messages, avis, signalements et notifications.
    await db.execute(sql`delete from profiles where user_id = ${u.id}`);
    await db.execute(sql`delete from neon_auth."user" where id::text = ${u.id}`);
  }
  // Les pierres tombales du scénario de suppression de compte restent : elles sont déjà anonymes, et rien ne permet
  // de les distinguer sans risque de celles de vrais utilisateurs.
  console.log(`Nettoyage e2e : ${targets.length} compte(s) supprimé(s).`);
  await db.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
