import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
  const appUrl = process.env.NODE_ENV === "production" ? `https://app.${root}` : `http://app.${root}:3000`;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-[var(--color-border)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-6 w-6 rounded bg-[var(--brand-primary)]" />
            FibraOS
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/precios" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]">
              Precios
            </Link>
            <Link href="/blog" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]">
              Blog
            </Link>
            <a
              href={`${appUrl}/login`}
              className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            >
              Entrar
            </a>
            <a
              href={`${appUrl}/register`}
              className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Probar gratis
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-[var(--color-muted)]">
          © {new Date().getFullYear()} FibraOS · Plataforma SaaS FTTH
        </div>
      </footer>
    </div>
  );
}
