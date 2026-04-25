/**
 * Abstracción DomainProvider. MVP solo tiene `CaddyOnDemandProvider` (§12.3).
 * Interfaz preparada para añadir `CloudflareForSaaSProvider` si migramos.
 */

export interface DnsInstruction {
  kind: "CNAME" | "A" | "AAAA" | "TXT";
  name: string;
  value: string;
  ttl?: number;
  required: boolean;
}

export interface RegisterResult {
  verificationToken: string;
  dns: DnsInstruction[];
}

export interface DomainProvider {
  registerDomain(hostname: string, orgId: string): Promise<RegisterResult>;
  unregisterDomain(hostname: string): Promise<void>;
  /** Retorna true si el DNS público resuelve correctamente al servidor. */
  verifyDns(hostname: string, token: string): Promise<{ ok: boolean; error?: string }>;
}

export class CaddyOnDemandProvider implements DomainProvider {
  constructor(
    private readonly publicHostname: string, // saas.fibraos.com → CNAME target
    private readonly publicIPv4: string,
    private readonly publicIPv6: string | null,
  ) {}

  async registerDomain(hostname: string, _orgId: string): Promise<RegisterResult> {
    const verificationToken = crypto.randomUUID().replace(/-/g, "");

    const dns: DnsInstruction[] = [
      {
        kind: "CNAME",
        name: hostname,
        value: this.publicHostname,
        ttl: 300,
        required: true,
      },
      {
        kind: "A",
        name: hostname,
        value: this.publicIPv4,
        ttl: 300,
        required: false, // opcional: apex sin CNAME
      },
    ];
    if (this.publicIPv6) {
      dns.push({ kind: "AAAA", name: hostname, value: this.publicIPv6, ttl: 300, required: false });
    }
    dns.push({
      kind: "TXT",
      name: `_fibraos-verify.${hostname}`,
      value: verificationToken,
      ttl: 300,
      required: false, // opcional pero recomendado
    });

    return { verificationToken, dns };
  }

  async unregisterDomain(_hostname: string): Promise<void> {
    // No-op: Caddy borra cert del storage automáticamente al expirar; alternativamente
    // podríamos llamar a Caddy admin API para forzar borrado inmediato.
  }

  async verifyDns(hostname: string, _token: string): Promise<{ ok: boolean; error?: string }> {
    // DNS resolution se delega a lib/domains/verifier.ts para poder usar dns/promises
    // y distinguir entre "sin CNAME", "CNAME incorrecto", "TXT faltante".
    // Aquí solo exponemos la interfaz; el worker llama directo al helper.
    return { ok: false, error: "delegated_to_verifier" };
  }
}

let _provider: DomainProvider | null = null;
export function domainProvider(): DomainProvider {
  if (_provider) return _provider;
  const pub = process.env.PUBLIC_HOSTNAME ?? `saas.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.com"}`;
  const ipv4 = process.env.PUBLIC_IPV4 ?? "";
  const ipv6 = process.env.PUBLIC_IPV6 || null;
  _provider = new CaddyOnDemandProvider(pub, ipv4, ipv6);
  return _provider;
}
