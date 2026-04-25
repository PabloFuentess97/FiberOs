"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Etiqueta la sesión de Sentry con el tenant actual. Se monta desde el
 * layout (dashboard) tras resolver `requireTenantContext`. Los errores
 * subsiguientes llevan `organization_slug` y `user_email` como tags,
 * haciendo trivial filtrar incidencias por tenant en el UI de Sentry.
 */
export function TenantSentryScope({
  organizationSlug,
  organizationId,
  userEmail,
  role,
}: {
  organizationSlug: string;
  organizationId: string;
  userEmail: string;
  role: string;
}) {
  useEffect(() => {
    Sentry.setTags({
      organization_slug: organizationSlug,
      organization_id: organizationId,
      role,
    });
    Sentry.setUser({ email: userEmail });
    return () => {
      Sentry.setUser(null);
    };
  }, [organizationSlug, organizationId, userEmail, role]);
  return null;
}
