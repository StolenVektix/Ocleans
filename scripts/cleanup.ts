import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createDb } from "../src/db/client";
import { cleanupStaleCards } from "../src/server/cleanup";
import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";

const db = createDb(process.env.DATABASE_URL!);
cleanupStaleCards(db, createNeonStorage(storageConfigFromEnv()))
  .then((r) => console.log(`Nettoyage : ${r.expired} demande(s) expirée(s), ${r.orphansDeleted} photo(s) orpheline(s) supprimée(s).`))
  .finally(() => db.$client.end());
