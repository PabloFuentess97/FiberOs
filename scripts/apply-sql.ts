/**
 * Aplica los ficheros SQL manuales de `lib/db/migrations/sql/*.sql` en orden.
 * Complementa las migraciones de drizzle-kit para cosas que Drizzle no expresa
 * de forma ergonómica (triggers, RLS, extensiones, funciones plpgsql).
 *
 * Uso: `pnpm tsx scripts/apply-sql.ts`
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");

  const dir = path.join(process.cwd(), "lib", "db", "migrations", "sql");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  const sql = postgres(url, { max: 1, prepare: false });
  for (const file of files) {
    const content = await readFile(path.join(dir, file), "utf8");
    console.log(`→ Aplicando ${file}`);
    await sql.unsafe(content);
    console.log(`  ✓ ${file}`);
  }
  await sql.end();
  console.log("✓ Todas las migraciones SQL aplicadas.");
}

main().catch((err) => {
  console.error("✗ apply-sql falló:", err);
  process.exit(1);
});
