import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";

async function main() {
  const storage = createNeonStorage(storageConfigFromEnv());
  const key = `checks/${Date.now()}.txt`;
  const body = new TextEncoder().encode("ocleans");
  await storage.put(key, body, "text/plain");
  const url = await storage.signedUrl(key, 60);
  const fetched = await (await fetch(url)).text();
  await storage.delete(key);
  const afterDelete = (await fetch(url)).status;
  console.log(`lecture: ${fetched === "ocleans" ? "OK" : "KO"} ; après suppression: HTTP ${afterDelete}`);
  if (fetched !== "ocleans" || afterDelete < 400) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
