/**
 * Genera `docs/api.md` escaneando `app/api/** /route.ts` y detectando los
 * verbos HTTP exportados + leyendo el comentario JSDoc (`/**..*\/`) al inicio
 * de cada función para la descripción.
 *
 * Ejecutar: `pnpm docs:gen`
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const API_DIR = join(ROOT, "app", "api");
const OUT = join(ROOT, "docs", "api.md");

const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type Verb = (typeof VERBS)[number];

interface Endpoint {
  path: string;
  file: string;
  verb: Verb;
  description: string | null;
}

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walkFiles(p);
    else if (entry === "route.ts" || entry === "route.tsx") yield p;
  }
}

function routePathFromFile(file: string): string {
  const rel = relative(API_DIR, file).replace(/[\\/]route\.[tj]sx?$/, "");
  // Convertimos [param] a :param para rutas más legibles en docs; pero mantenemos [] para coincidir con Next
  return "/api/" + rel.replace(/\\/g, "/");
}

function extractDescription(source: string, verb: Verb): string | null {
  // Buscamos `export async function ${verb}(` o `export function ${verb}(`
  const re = new RegExp(
    `(?:/\\*\\*([\\s\\S]*?)\\*/\\s*)?export\\s+(?:async\\s+)?function\\s+${verb}\\s*\\(`,
    "m",
  );
  const m = re.exec(source);
  if (!m) return null;
  if (!m[1]) return null;
  // Limpiar * del jsdoc
  return m[1]
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
}

function describeEndpoints(): Endpoint[] {
  const endpoints: Endpoint[] = [];
  for (const file of walkFiles(API_DIR)) {
    const source = readFileSync(file, "utf8");
    const path = routePathFromFile(file);
    for (const verb of VERBS) {
      if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${verb}\\s*\\(`).test(source)) {
        endpoints.push({
          path,
          file: relative(ROOT, file),
          verb,
          description: extractDescription(source, verb),
        });
      }
    }
  }
  return endpoints.sort((a, b) => a.path.localeCompare(b.path));
}

function groupByPrefix(endpoints: Endpoint[]): Map<string, Endpoint[]> {
  const groups = new Map<string, Endpoint[]>();
  for (const e of endpoints) {
    const parts = e.path.split("/").filter(Boolean); // ['api', 'field', ...]
    const key = parts.slice(0, 2).join("/") || "api";
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  return groups;
}

function renderMarkdown(endpoints: Endpoint[]): string {
  const now = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];
  parts.push("# API · FibraOS");
  parts.push("");
  parts.push(`> Autogenerado desde \`app/api/**/route.ts\` con \`pnpm docs:gen\`. Fecha: ${now}.`);
  parts.push("");
  parts.push("## Convenciones");
  parts.push("");
  parts.push("- Respuesta estándar: `{ ok: true, data }` o `{ ok: false, error }`.");
  parts.push("- Auth: cookie de sesión del tenant (HttpOnly, Secure) salvo webhooks (firma HMAC) o endpoints internos (`X-Internal-Secret`).");
  parts.push("- Rate limit por plan (`rate-limiter-flexible` contra Redis).");
  parts.push("");

  const groups = groupByPrefix(endpoints);
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const key of sortedKeys) {
    parts.push(`## \`/${key}\``);
    parts.push("");
    parts.push("| Verbo | Ruta | Descripción | Fuente |");
    parts.push("|---|---|---|---|");
    for (const e of groups.get(key) ?? []) {
      const desc = (e.description ?? "—").replace(/\|/g, "\\|").slice(0, 180);
      parts.push(`| ${e.verb} | \`${e.path}\` | ${desc} | \`${e.file}\` |`);
    }
    parts.push("");
  }

  parts.push(`---`);
  parts.push(`Total: ${endpoints.length} endpoints en ${groups.size} grupos.`);
  return parts.join("\n");
}

function main() {
  const eps = describeEndpoints();
  const md = renderMarkdown(eps);
  writeFileSync(OUT, md);
  console.log(`✓ ${OUT} (${eps.length} endpoints)`);
}

main();
