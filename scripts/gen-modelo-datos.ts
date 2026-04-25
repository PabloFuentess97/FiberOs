/**
 * Genera `docs/modelo-datos.md` a partir de los schemas Drizzle.
 *
 * Enfoque: introspección del `getTableConfig()` de Drizzle (pgTable) para
 * extraer nombre, columnas (name, type, notNull, pk, fk), índices, unique,
 * checks y foreign keys. Incluye además los enums exportados.
 *
 * Ejecutar: `pnpm docs:gen`
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, PgEnumColumn } from "drizzle-orm/pg-core";
import { PgEnum } from "drizzle-orm/pg-core";
import { isPgEnum } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "docs", "modelo-datos.md");

interface TableDoc {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    notNull: boolean;
    isPk: boolean;
    hasDefault: boolean;
    references?: string;
  }>;
  indexes: string[];
  uniqueConstraints: string[];
  checks: string[];
}

function describeTable(table: unknown): TableDoc | null {
  try {
    const cfg = getTableConfig(table as never);
    return {
      name: cfg.name,
      columns: cfg.columns.map((c) => ({
        name: c.name,
        type: (c as { dataType?: string; columnType?: string }).dataType
          ?? (c as { columnType?: string }).columnType ?? "unknown",
        notNull: c.notNull,
        isPk: c.primary ?? false,
        hasDefault: c.hasDefault,
        references: referenceTarget(c as never),
      })),
      indexes: cfg.indexes.map((i) => i.config.name ?? "idx"),
      uniqueConstraints: cfg.uniqueConstraints.map((u) => u.name ?? "unique"),
      checks: cfg.checks.map((c) => c.name ?? "check"),
    };
  } catch {
    return null;
  }
}

function referenceTarget(col: { foreignKeyConfigs?: unknown[] }): string | undefined {
  const fks = (col as unknown as { foreignKeyConfigs?: { columns: { name: string }[]; foreignTable: { _: { name: string } } }[] }).foreignKeyConfigs;
  if (!fks || fks.length === 0) return undefined;
  const fk = fks[0]!;
  const table = fk.foreignTable?._?.name ?? "?";
  const col0 = fk.columns?.[0]?.name ?? "?";
  return `→ ${table}.${col0}`;
}

function describeEnums(): Array<{ name: string; values: string[] }> {
  const out: Array<{ name: string; values: string[] }> = [];
  for (const [key, value] of Object.entries(schema)) {
    if (isPgEnum(value)) {
      out.push({
        name: (value as PgEnum<string[]>).enumName,
        values: [...(value as PgEnum<string[]>).enumValues],
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function renderMarkdown(tables: TableDoc[], enums: ReturnType<typeof describeEnums>): string {
  const now = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];

  parts.push("# Modelo de datos · FibraOS");
  parts.push("");
  parts.push(`> Autogenerado desde \`lib/db/schema/**\` con \`pnpm docs:gen\`. Fecha: ${now}.`);
  parts.push(
    "> No editar a mano. Las tablas y columnas reflejan el código fuente; triggers, RLS y funciones SQL viven en \`lib/db/migrations/sql/*\` (no se reflejan aquí).",
  );
  parts.push("");

  // Índice
  parts.push("## Tablas");
  parts.push("");
  for (const t of tables) {
    parts.push(`- [\`${t.name}\`](#${t.name})`);
  }
  parts.push("");

  parts.push("## Enums");
  parts.push("");
  for (const e of enums) {
    parts.push(`- \`${e.name}\`: ${e.values.map((v) => `\`${v}\``).join(", ")}`);
  }
  parts.push("");

  for (const t of tables) {
    parts.push(`## ${t.name}`);
    parts.push("");
    parts.push("| Columna | Tipo | Null | PK | Default | Referencias |");
    parts.push("|---|---|---|---|---|---|");
    for (const c of t.columns) {
      parts.push(
        `| ${c.name} | \`${c.type}\` | ${c.notNull ? "NO" : "SÍ"} | ${c.isPk ? "✓" : ""} | ${c.hasDefault ? "✓" : ""} | ${c.references ?? ""} |`,
      );
    }
    parts.push("");
    if (t.indexes.length > 0) {
      parts.push(`**Índices:** ${t.indexes.map((i) => `\`${i}\``).join(", ")}`);
      parts.push("");
    }
    if (t.uniqueConstraints.length > 0) {
      parts.push(`**Únicos:** ${t.uniqueConstraints.map((u) => `\`${u}\``).join(", ")}`);
      parts.push("");
    }
    if (t.checks.length > 0) {
      parts.push(`**Checks:** ${t.checks.map((c) => `\`${c}\``).join(", ")}`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

function main() {
  const tables: TableDoc[] = [];
  for (const [key, value] of Object.entries(schema)) {
    const doc = describeTable(value);
    if (doc) tables.push(doc);
  }
  tables.sort((a, b) => a.name.localeCompare(b.name));

  const md = renderMarkdown(tables, describeEnums());
  writeFileSync(OUT, md);
  console.log(`✓ ${OUT} (${tables.length} tablas)`);
}

main();
