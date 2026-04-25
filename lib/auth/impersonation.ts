import { cookies } from "next/headers";

export const IMPERSONATION_COOKIE = "fibraos_impersonation";

export interface ImpersonationPayload {
  impersonationId: string;
  actorUserId: string;
  targetUserId: string;
  organizationId: string;
  endsAt: number; // epoch ms
}

/** Lee la cookie de impersonación y devuelve el payload si no ha expirado. */
export async function readImpersonation(): Promise<ImpersonationPayload | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE);
  if (!raw?.value) return null;
  try {
    const data = JSON.parse(
      Buffer.from(raw.value, "base64url").toString("utf8"),
    ) as ImpersonationPayload;
    if (data.endsAt < Date.now()) {
      store.delete(IMPERSONATION_COOKIE);
      return null;
    }
    return data;
  } catch {
    store.delete(IMPERSONATION_COOKIE);
    return null;
  }
}

export function encodeImpersonation(p: ImpersonationPayload): string {
  return Buffer.from(JSON.stringify(p)).toString("base64url");
}
