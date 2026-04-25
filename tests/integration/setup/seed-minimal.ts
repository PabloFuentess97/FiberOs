import { sql } from "drizzle-orm";
import type { TestStack } from "./containers";

/**
 * Topología sintética para tests de impacto:
 *
 *   OLT ── CBL-TRUNK (96f) ── MT-HUB
 *                               │
 *                     CBL-INPUT-TO-SPL ── SPL-A (1x8)
 *                                           │
 *                                  ┌────────┴────────┐
 *                                  ... 8 outputs ...
 *                                  │ │ │ │ │ │ │ │
 *                               CBL-OUT-1..8 (drop 2f)
 *                               │ │ │ │ │ │ │ │
 *                              CTO-1..CTO-8
 *                               │ (1 cliente cada)
 *
 * Esperado:
 *   - cortar CBL-TRUNK → 8 clientes.
 *   - cortar CBL-OUT-3 → 1 cliente.
 *   - cortar SPL-A input fiber → 8 clientes.
 */

export interface MinimalSeed {
  organizationId: string;
  userId: string;
  cableTrunkId: string;
  cableInputToSplId: string;
  splitterAId: string;
  splInputPortId: string;
  outputFiberIds: string[]; // 8 fibras output (una por CBL-OUT-N)
  clientIds: string[]; // 8 clientes
}

export async function seedImpactTopology(stack: TestStack): Promise<MinimalSeed> {
  const { client } = stack;

  // Org + user
  const [org] = await client<{ id: string }[]>`
    INSERT INTO organizations (name, slug, country) VALUES ('Test Org', 'test', 'ES')
    RETURNING id
  `;
  const organizationId = org!.id;

  const [user] = await client<{ id: string }[]>`
    INSERT INTO users (email, name, email_verified_at)
    VALUES ('seed@test.local', 'Seed', now())
    RETURNING id
  `;
  const userId = user!.id;

  await client`INSERT INTO organization_members (organization_id, user_id, role)
               VALUES (${organizationId}, ${userId}, 'admin')`;

  await client`INSERT INTO subscriptions (organization_id, plan, status)
               VALUES (${organizationId}, 'pro', 'active')`;

  // Set session para triggers de audit/version
  await client`SELECT set_config('app.organization_id', ${organizationId}, false)`;
  await client`SELECT set_config('app.user_id', ${userId}, false)`;

  // 10 cajas: OLT + MT-HUB + 8 CTOs
  const boxInserts = [
    { code: "OLT-01", type: "olt_headend", lat: 37.18, lng: -3.6 },
    { code: "MT-HUB", type: "main_trunk", lat: 37.17, lng: -3.59 },
    ...Array.from({ length: 8 }, (_, i) => ({
      code: `CTO-${i + 1}`,
      type: "cto",
      lat: 37.17 + (i - 4) * 0.001,
      lng: -3.59 + i * 0.001,
    })),
  ];

  const boxIds: Record<string, string> = {};
  for (const b of boxInserts) {
    const [row] = await client<{ id: string }[]>`
      INSERT INTO boxes (organization_id, code, short_id, type, location, created_by, updated_by)
      VALUES (
        ${organizationId}, ${b.code}, '', ${b.type}::box_type,
        ST_GeographyFromText('SRID=4326;POINT(' || ${b.lng} || ' ' || ${b.lat} || ')'),
        ${userId}, ${userId}
      )
      RETURNING id
    `;
    boxIds[b.code] = row!.id;
  }

  // Cables
  async function insertCable(code: string, type: string, fiberCount: number, fromCode: string, toCode: string): Promise<string> {
    const [c] = await client<{ id: string }[]>`
      INSERT INTO cables (organization_id, code, type, standard, fiber_count, source_box_id, target_box_id, path, created_by, updated_by)
      VALUES (
        ${organizationId}, ${code}, ${type}::cable_type, 'G657A2', ${fiberCount},
        ${boxIds[fromCode]!}, ${boxIds[toCode]!},
        ST_GeographyFromText('SRID=4326;LINESTRING(-3.6 37.18, -3.59 37.17)'),
        ${userId}, ${userId}
      )
      RETURNING id
    `;
    // Fibers
    const colors = ["blue","orange","green","brown","slate","white","red","black","yellow","violet","rose","aqua"];
    for (let n = 1; n <= fiberCount; n++) {
      const color = colors[(n - 1) % 12];
      await client`INSERT INTO fibers (organization_id, cable_id, number, color)
                   VALUES (${organizationId}, ${c!.id}, ${n}, ${color}::fiber_color)`;
    }
    return c!.id;
  }

  const cableTrunkId = await insertCable("CBL-TRUNK", "main_trunk", 96, "OLT-01", "MT-HUB");
  const cableInputToSplId = await insertCable("CBL-INPUT-TO-SPL", "trunk", 2, "OLT-01", "MT-HUB");

  // Splitter 1x8
  const [spl] = await client<{ id: string }[]>`
    INSERT INTO splitters (organization_id, box_id, code, ratio, created_by, updated_by)
    VALUES (${organizationId}, ${boxIds["MT-HUB"]!}, 'SPL-A', '1x8'::splitter_ratio, ${userId}, ${userId})
    RETURNING id
  `;
  const splitterAId = spl!.id;

  // Puertos se generan por trigger fn_generate_splitter_ports
  const ports = await client<{ id: string; kind: string; port_number: number }[]>`
    SELECT id, kind::text, port_number FROM splitter_ports WHERE splitter_id = ${splitterAId}
  `;
  const inputPort = ports.find((p) => p.kind === "input")!;
  const outputPorts = ports.filter((p) => p.kind === "output").sort((a, b) => a.port_number - b.port_number);

  // Input: fusión fibra1 de CBL-INPUT-TO-SPL ↔ splitter input
  const inputFibers = await client<{ id: string; number: number }[]>`
    SELECT id, number FROM fibers WHERE cable_id = ${cableInputToSplId} ORDER BY number
  `;
  await client`
    INSERT INTO fusions (organization_id, box_id, endpoint_a_kind, endpoint_a_fiber_id, endpoint_b_kind, endpoint_b_splitter_port_id, technician_id)
    VALUES (${organizationId}, ${boxIds["MT-HUB"]!},
      'fiber', ${inputFibers[0]!.id},
      'splitter_port', ${inputPort.id},
      ${userId})
  `;

  // 8 CBL-OUT-N (drop, 2f cada) de MT-HUB a CTO-N
  const outputFiberIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const cableOutId = await insertCable(`CBL-OUT-${i + 1}`, "drop", 2, "MT-HUB", `CTO-${i + 1}`);
    const [fiber1] = await client<{ id: string }[]>`
      SELECT id FROM fibers WHERE cable_id = ${cableOutId} AND number = 1
    `;
    outputFiberIds.push(fiber1!.id);
    // Fusión splitter.output[i+1] ↔ CBL-OUT.fibra1
    await client`
      INSERT INTO fusions (organization_id, box_id, endpoint_a_kind, endpoint_a_splitter_port_id, endpoint_b_kind, endpoint_b_fiber_id, technician_id)
      VALUES (${organizationId}, ${boxIds["MT-HUB"]!},
        'splitter_port', ${outputPorts[i]!.id},
        'fiber', ${fiber1!.id},
        ${userId})
    `;
  }

  // 8 clientes, uno por CTO, drop_fiber_id = fibra 2 del CBL-OUT correspondiente
  // (en realidad el drop está en fibra 1 arriba; usamos fibra 2 de CBL-OUT para "acometida final")
  // Para simplificar: drop_fiber_id = la misma fibra de output (fibra 1)
  const clientIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const [cl] = await client<{ id: string }[]>`
      INSERT INTO clients (organization_id, name, address, drop_fiber_id, status, created_by, updated_by)
      VALUES (
        ${organizationId}, ${`Cliente ${i + 1}`}, ${`Calle ${i + 1}, Granada`},
        ${outputFiberIds[i]!}, 'active'::client_status, ${userId}, ${userId}
      )
      RETURNING id
    `;
    clientIds.push(cl!.id);
  }

  return {
    organizationId,
    userId,
    cableTrunkId,
    cableInputToSplId,
    splitterAId,
    splInputPortId: inputPort.id,
    outputFiberIds,
    clientIds,
  };
}
