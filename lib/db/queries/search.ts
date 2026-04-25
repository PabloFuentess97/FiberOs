import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type SearchEntityKind = "box" | "cable" | "client" | "fiber";

export interface SearchHit {
  kind: SearchEntityKind;
  id: string;
  title: string;
  subtitle: string | null;
  rank: number;
  url: string;
}

/**
 * Búsqueda global para cmd+K. Usa ts_vector sobre `search_tsv` más fallback ILIKE
 * cuando el query es corto (<3 chars) donde websearch_to_tsquery no es efectivo.
 * Devuelve hasta `limit` resultados combinados entre boxes, cables, clients y
 * fibras con referencia `cable:N` (p.ej. "CBL-0001:12").
 *
 * Requiere `SET LOCAL app.organization_id` para RLS.
 */
export async function searchEntities(query: string, limit = 20): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  // Detecta formato `cable_code:N` → fibra directa
  const fiberRef = /^([A-Za-z0-9-]+):(\d{1,3})$/.exec(q);
  if (fiberRef?.[1] && fiberRef[2]) {
    const code = fiberRef[1];
    const number = Number(fiberRef[2]);
    const rows = await db.execute<{
      id: string;
      number: number;
      cable_id: string;
      cable_code: string;
    }>(sql`
      SELECT f.id, f.number, f.cable_id, c.code AS cable_code
        FROM fibers f
        INNER JOIN cables c ON c.id = f.cable_id
        WHERE c.code = ${code} AND f.number = ${number} AND c.deleted_at IS NULL
        LIMIT 1;
    `);
    return rows.map((r) => ({
      kind: "fiber",
      id: r.id,
      title: `${r.cable_code}:${String(r.number).padStart(2, "0")}`,
      subtitle: `Fibra · cable ${r.cable_code}`,
      rank: 1,
      url: `/cables/${r.cable_id}#fiber-${r.number}`,
    }));
  }

  const useTsquery = q.length >= 3;
  // websearch_to_tsquery tolera comillas y operadores; para queries cortos usamos prefix
  const tsquery = useTsquery ? sql`websearch_to_tsquery('simple', ${q})` : sql`NULL`;
  const like = `%${q}%`;

  const boxes = await db.execute<{
    id: string;
    code: string;
    short_id: string;
    address: string | null;
    rank: number;
  }>(sql`
    SELECT b.id, b.code, b.short_id, b.address,
           ${useTsquery ? sql`ts_rank_cd(b.search_tsv, ${tsquery})` : sql`0.1`} AS rank
      FROM boxes b
      WHERE b.deleted_at IS NULL
        AND (
          ${useTsquery ? sql`b.search_tsv @@ ${tsquery}` : sql`false`}
          OR b.code ILIKE ${like}
          OR b.short_id ILIKE ${like}
          OR b.address ILIKE ${like}
        )
      ORDER BY rank DESC
      LIMIT ${limit};
  `);

  const cables = await db.execute<{
    id: string;
    code: string;
    type: string;
    rank: number;
  }>(sql`
    SELECT c.id, c.code, c.type::text AS type,
           ${useTsquery ? sql`ts_rank_cd(c.search_tsv, ${tsquery})` : sql`0.1`} AS rank
      FROM cables c
      WHERE c.deleted_at IS NULL
        AND (
          ${useTsquery ? sql`c.search_tsv @@ ${tsquery}` : sql`false`}
          OR c.code ILIKE ${like}
        )
      ORDER BY rank DESC
      LIMIT ${limit};
  `);

  const clients = await db.execute<{
    id: string;
    name: string;
    address: string;
    external_code: string | null;
    rank: number;
  }>(sql`
    SELECT cl.id, cl.name, cl.address, cl.external_code,
           ${useTsquery ? sql`ts_rank_cd(cl.search_tsv, ${tsquery})` : sql`0.1`} AS rank
      FROM clients cl
      WHERE cl.deleted_at IS NULL
        AND (
          ${useTsquery ? sql`cl.search_tsv @@ ${tsquery}` : sql`false`}
          OR cl.name ILIKE ${like}
          OR cl.external_code ILIKE ${like}
          OR cl.phone ILIKE ${like}
        )
      ORDER BY rank DESC
      LIMIT ${limit};
  `);

  const hits: SearchHit[] = [
    ...boxes.map<SearchHit>((b) => ({
      kind: "box",
      id: b.id,
      title: b.code,
      subtitle: b.address ?? `short_id ${b.short_id}`,
      rank: Number(b.rank) + 0.1,
      url: `/boxes/${b.id}`,
    })),
    ...cables.map<SearchHit>((c) => ({
      kind: "cable",
      id: c.id,
      title: c.code,
      subtitle: `Cable · ${c.type}`,
      rank: Number(c.rank),
      url: `/cables/${c.id}`,
    })),
    ...clients.map<SearchHit>((cl) => ({
      kind: "client",
      id: cl.id,
      title: cl.name,
      subtitle: cl.externalCode
        ? `Cliente · ${cl.externalCode} · ${cl.address}`
        : `Cliente · ${cl.address}`,
      rank: Number(cl.rank),
      url: `/clients/${cl.id}`,
    })),
  ];

  hits.sort((a, b) => b.rank - a.rank);
  return hits.slice(0, limit);
}
