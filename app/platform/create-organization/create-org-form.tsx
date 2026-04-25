"use client";

import { useActionState } from "react";
import { createOrganizationAction, type CreateOrgState } from "./actions";

const INITIAL: CreateOrgState = {};

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, INITIAL);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Nombre de la organización</span>
        <input
          name="name"
          required
          minLength={2}
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
        />
        {state.fieldErrors?.name?.[0] ? (
          <span className="text-xs text-[var(--color-destructive)]">{state.fieldErrors.name[0]}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Subdominio</span>
        <div className="flex items-center rounded-md border border-[var(--color-border)] focus-within:border-[var(--brand-primary)]">
          <input
            name="slug"
            required
            minLength={3}
            pattern="^[a-z0-9][a-z0-9-]{2,29}$"
            placeholder="tmdigital"
            className="flex-1 rounded-l-md px-3 py-2 text-sm focus:outline-none"
          />
          <span className="px-3 py-2 text-sm text-[var(--color-muted)]">.{root}</span>
        </div>
        {state.fieldErrors?.slug?.[0] ? (
          <span className="text-xs text-[var(--color-destructive)]">{state.fieldErrors.slug[0]}</span>
        ) : null}
        <span className="text-xs text-[var(--color-muted)]">
          Minúsculas, números y guiones. Entre 3 y 30 caracteres.
        </span>
      </label>

      {state.error && state.error !== "validation_error" ? (
        <p className="text-sm text-[var(--color-destructive)]">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear organización"}
      </button>
    </form>
  );
}
