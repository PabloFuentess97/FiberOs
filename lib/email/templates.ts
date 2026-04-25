/**
 * Plantillas de email HTML simples (sin react-email para mantener dependencias
 * ligeras en el MVP). Cuando el cliente aporte diseño definitivo migramos.
 */

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function renderInvitation(params: {
  inviterName: string;
  tenantName: string;
  acceptUrl: string;
  brand: { primary: string; displayName: string };
}): EmailContent {
  const { inviterName, tenantName, acceptUrl, brand } = params;
  return {
    subject: `${inviterName} te invita a ${tenantName} en FibraOS`,
    text: `Acepta la invitación: ${acceptUrl}`,
    html: `
<!doctype html><html><body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto">
  <div style="height:6px;background:${brand.primary};border-radius:3px;margin-bottom:16px"></div>
  <h2 style="margin:0 0 8px">${brand.displayName}</h2>
  <p>${inviterName} te invita a unirte a <strong>${tenantName}</strong>.</p>
  <p><a href="${acceptUrl}" style="display:inline-block;background:${brand.primary};color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Aceptar invitación</a></p>
  <p style="color:#64748B;font-size:12px">Si no esperabas este mensaje, ignóralo.</p>
</body></html>`.trim(),
  };
}

export function renderDomainActive(params: { hostname: string; brand: { primary: string; displayName: string } }): EmailContent {
  return {
    subject: `Tu dominio ${params.hostname} ya está activo`,
    text: `El dominio ${params.hostname} ya sirve tu tenant con HTTPS válido.`,
    html: `
<!doctype html><html><body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto">
  <div style="height:6px;background:${params.brand.primary};border-radius:3px;margin-bottom:16px"></div>
  <h2>Dominio activo</h2>
  <p><code>${params.hostname}</code> sirve tu tenant con HTTPS válido emitido por Let's Encrypt.</p>
  <p style="color:#64748B;font-size:12px">Renovación automática cada 90 días.</p>
</body></html>`.trim(),
  };
}

export function renderDomainFailed(params: { hostname: string; error: string; brand: { primary: string; displayName: string } }): EmailContent {
  return {
    subject: `No pudimos verificar ${params.hostname}`,
    text: `Error: ${params.error}. Revisa la configuración DNS en tus ajustes.`,
    html: `
<!doctype html><html><body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto">
  <div style="height:6px;background:#DC2626;border-radius:3px;margin-bottom:16px"></div>
  <h2>Verificación de dominio fallida</h2>
  <p>Tras varios reintentos no hemos podido verificar <code>${params.hostname}</code>.</p>
  <p><strong>Error:</strong> ${params.error}</p>
  <p>Revisa tu DNS y reintenta desde <a href="https://app.fibraos.com/settings/domains">Ajustes → Dominios</a>.</p>
</body></html>`.trim(),
  };
}

export function renderImpersonationNotice(params: {
  adminEmail: string;
  reason: string;
  endsAt: Date;
}): EmailContent {
  return {
    subject: `Acceso de soporte activo en tu cuenta (FibraOS)`,
    text: `${params.adminEmail} está accediendo a tu cuenta hasta ${params.endsAt.toISOString()}. Motivo: ${params.reason}`,
    html: `
<!doctype html><html><body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto">
  <h2>Acceso de soporte activo</h2>
  <p>Un miembro del equipo FibraOS (<strong>${params.adminEmail}</strong>) está accediendo a tu cuenta como parte de una investigación de soporte.</p>
  <p><strong>Motivo:</strong> ${params.reason}</p>
  <p><strong>Expira:</strong> ${params.endsAt.toLocaleString("es-ES")}</p>
  <p style="color:#64748B;font-size:12px">Si no esperabas este acceso, responde a este email o escribe a soporte inmediatamente.</p>
</body></html>`.trim(),
  };
}
