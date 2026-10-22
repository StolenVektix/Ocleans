import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const url =
  process.env.DB_TARGET === "test" ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) throw new Error("Chaîne de connexion manquante dans .env.local");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
