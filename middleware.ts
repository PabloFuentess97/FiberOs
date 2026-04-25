import { type NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/tenancy/resolve";

export const runtime = "nodejs";

const RESERVED = new Set([
  "app",
  "www",
  "api",
  "admin",
  "docs",
  "status",
  "blog",
  "mail",
  "ftp",
  "cdn",
  "static",
  "assets",
  "help",
  "support",
  "marketing",
  "platform",
  "super-admin",
  "auth",
  "dashboard",
  "billing",
  "settings",
  "onboarding",
]);

/**
 * Orden (§12.4 blueprint):
 *   1. Tenant resolver (rewrites por hostname)
 *   2. Auth guard (Sprint 1 delega a layouts)
 *   3. i18n (Sprint 1 solo es, preparado next-intl)
 */
export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
  const url = req.nextUrl;

  // Excluir rutas internas
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

  // Subdominio de root: intentar match directo por slug, luego resolver por BD.
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -1 - root.length);
    if (RESERVED.has(sub)) {
      return NextResponse.next();
    }
    const tenant = await resolveTenantByHost(host);
    if (!tenant) {
      return NextResponse.redirect(
        `${url.protocol}//${root}${url.port ? ":" + url.port : ""}/?reason=unknown_host`,
      );
    }
    const res = NextResponse.rewrite(new URL(`/t/${tenant.slug}${url.pathname}`, req.url));
    res.headers.set("x-tenant-id", tenant.id);
    res.headers.set("x-tenant-slug", tenant.slug);
    res.headers.set("x-host-kind", "subdomain");
    return res;
  }

  // Dominio custom (red.tmdigital.es, etc.)
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.redirect(
      `${url.protocol}//${root}${url.port ? ":" + url.port : ""}/?reason=unknown_host`,
    );
  }
  const res = NextResponse.rewrite(new URL(`/t/${tenant.slug}${url.pathname}`, req.url));
  res.headers.set("x-tenant-id", tenant.id);
  res.headers.set("x-tenant-slug", tenant.slug);
  res.headers.set("x-host-kind", "custom");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json).*)"],
};
