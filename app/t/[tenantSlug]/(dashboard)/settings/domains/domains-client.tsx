"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";
import { addDomainAction, type AddDomainState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const INITIAL: AddDomainState = {};

export function DomainsClient() {
  const [state, action, pending] = useActionState(addDomainAction, INITIAL);

  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <form action={action} className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="hostname" className="sr-only">
            Hostname
          </Label>
          <Input
            id="hostname"
            name="hostname"
            placeholder="red.tuoperador.es"
            required
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Añadiendo…" : "Añadir dominio"}
        </Button>
      </form>

      {state.error ? (
        <p className="text-sm text-[var(--color-destructive)]">{state.error}</p>
      ) : null}

      {state.dns && state.dns.length > 0 ? (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-sm font-medium">Configura estos registros en tu DNS</h3>
          <ol className="space-y-2 text-sm">
            {state.dns.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-white p-2">
                <div className="font-mono text-xs">
                  <span className="inline-block w-12 text-[var(--color-muted)]">{r.kind}</span>
                  <span className="mr-2">{r.name}</span>
                  <span>→ {r.value}</span>
                  {!r.required ? (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">(opcional)</span>
                  ) : null}
                </div>
                <Button size="sm" variant="ghost" onClick={() => copy(r.value)}>
                  <Copy size={12} />
                </Button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Propagación DNS típica: 1–10 minutos. El sistema reintenta automáticamente.
            Una vez verificado, emitiremos el certificado SSL con Let's Encrypt.
          </p>
        </div>
      ) : null}
    </div>
  );
}
