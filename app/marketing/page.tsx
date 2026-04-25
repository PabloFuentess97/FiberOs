export default function MarketingHome() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight text-[var(--color-foreground)]">
        Gestión de red FTTH para operadores que crecen
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--color-muted)]">
        Inventario, mapa, diagrama interior de caja y app de campo offline. Todo en una sola
        plataforma diseñada para operadores locales.
      </p>
      <div className="mt-10 flex justify-center gap-4">
        <a
          href="/precios"
          className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-surface)]"
        >
          Ver precios
        </a>
        <a
          href="#"
          className="rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Empezar prueba gratuita
        </a>
      </div>
    </section>
  );
}
