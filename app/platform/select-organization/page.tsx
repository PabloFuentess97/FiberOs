import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema/tenancy";
import { getCurrentSession } from "@/lib/auth/session";

export default async function SelectOrganizationPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const memberships = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, session.user.id));

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  const port = process.env.NODE_ENV === "production" ? "" : ":3000";

  if (memberships.length === 0) {
    redirect("/create-organization");
  }

  if (memberships.length === 1) {
    const m = memberships[0]!;
    redirect(`${scheme}://${m.slug}.${root}${port}/`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Elige organización</h1>
      <ul className="flex flex-col gap-2">
        {memberships.map((m) => (
          <li key={m.id}>
            <a
              href={`${scheme}://${m.slug}.${root}${port}/`}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-4 hover:bg-[var(--color-surface)]"
            >
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-[var(--color-muted)]">{m.slug}.{root}</div>
              </div>
              <span className="rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs uppercase tracking-wide">
                {m.role}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
