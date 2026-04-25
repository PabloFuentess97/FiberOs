import "dotenv/config";
import { sql } from "drizzle-orm";
import { directClient } from "@/lib/db";
import { drizzle } from "drizzle-orm/postgres-js";

async function main() {
  const client = directClient();
  const db = drizzle(client);
  console.log("→ Drop schema public…");
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO public`);
  await client.end();
  console.log("✓ Schema reseteado. Ahora ejecuta `pnpm db:push` y `pnpm seed`.");
}

main().catch((err) => {
  console.error("✗ Reset falló:", err);
  process.exit(1);
});
