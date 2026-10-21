import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  // Sans écouteur, une connexion inactive fermée par Neon émet une erreur non gérée et fait planter le processus.
  pool.on("error", (error: Error) => console.warn("[db] connexion inactive en erreur", error));
  return drizzle({ client: pool });
}

export type Db = ReturnType<typeof createDb>;

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquant");
    cached = createDb(url);
  }
  return cached;
}
