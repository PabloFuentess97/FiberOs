import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware Edge: SOLO regex + env vars. Cero BD/Redis (no compatible con Edge runtime).
 *
 * - Identifica el host y reescribe al segment correcto.
 * - Para subdominios tenant (`<slug>.fibraos.com`), reescribe a `/t/<slug>/...`
 *   y setea `x-tenant-slug`. El layout `app/t/[tenantSlug]/layout.tsx` resuelve
 *   slug → organization_id consultando BD desde Node runtime.
 * - Para dominios custom (`red.tmdigital.es`), reescribe a `/t/__by_host__/...`
 *   con header `x-tenant-host`. El layout hace lookup en `tenant_domains`.
 *
 * Orden (§12.4 blueprint):
 *   1. Tenant resolver (rewrites por hostname).
 *   2. Auth guard (delega a layouts).
 *   3. i18n (delega a layouts).
 */

const RESERVED = new Set([
  "app", "www", "api", "admin", "docs", "status", "blog", "mail", "ftp",
  "cdn", "static", "assets", "help", "support", "marketing", "platform",
  "super-admin", "auth", "dashboard", "billing", "settings", "onboarding",
]);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
  const url = req.nextUrl;

  // Excluir rutas de API y assets internos
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  // Hosts especiales (estáticos)
  if (host === root || host === `www.${root}`) {
    return NextResponse.rewrite(new URL(`/marketing${url.pathname}`, req.url));
  }
  if (host === `app.${root}`) {
    return NextResponse.rewrite(new URL(`/platform${url.pathname}`, req.url));
  }
  if (host === `admin.${root}`) {
    return NextResponse.rewrite(new URL(`/super-admin${url.pathname}`, req.url));
  }

  // Subdominio de root: extrae slug directamente del host
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -1 - root.length);
    if (RESERVED.has(sub)) {
      return NextResponse.next();
    }
    const res = NextResponse.rewrite(new URL(`/t/${sub}${url.pathname}`, req.url));
    res.headers.set("x-tenant-slug", sub);
    res.headers.set("x-host-kind", "subdomain");
    return res;
  }

  // Dominio custom externo (red.tmdigital.es, etc.)
  // Reescribimos a un slug placeholder; el layout resolverá vía tenant_domains.
  const res = NextResponse.rewrite(new URL(`/t/__by_host__${url.pathname}`, req.url));
  res.headers.set("x-tenant-host", host);
  res.headers.set("x-host-kind", "custom");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json).*)"],
};
