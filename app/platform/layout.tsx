export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[var(--color-surface)]">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <span className="inline-block h-7 w-7 rounded bg-[var(--brand-primary)]" />
          FibraOS
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
