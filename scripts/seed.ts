/**
 * Seed de desarrollo: org demo + 4 users + topología realista de Granada.
 *
 * Ejecutar: `pnpm seed`
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/auth";
import {
  organizations,
  organizationMembers,
  tenantBranding,
  tenantDomains,
} from "@/lib/db/schema/tenancy";
import { boxes, cables, fibers } from "@/lib/db/schema/network";
import { splitters, splitterPorts, fusions } from "@/lib/db/schema/fusion";
import { clients } from "@/lib/db/schema/clients";
import { auth } from "@/lib/auth/server";
import { pointSQL, lineStringSQL } from "@/lib/geo/postgis";
import { colorForFiber } from "@/lib/geo/colors";

const DEMO_SLUG = "demo";
const DEMO_USERS = [
  { email: "admin@demo.test", password: "Demo1234!", name: "Ana Admin", role: "admin" as const },
  { email: "manager@demo.test", password: "Demo1234!", name: "Marta Manager", role: "manager" as const },
  { email: "tech@demo.test", password: "Demo1234!", name: "Tomás Técnico", role: "technician" as const },
  { email: "viewer@demo.test", password: "Demo1234!", name: "Vera Viewer", role: "viewer" as const },
];

interface BoxSeed {
  code: string;
  type: "olt_headend" | "main_trunk" | "trunk" | "subtrunk" | "cto";
  lat: number;
  lng: number;
  address: string;
}

// Coordenadas aproximadas de Granada
const BOX_SEED: BoxSeed[] = [
  { code: "OLT-GRA-01", type: "olt_headend", lat: 37.17727, lng: -3.59881, address: "Recogidas 10, Granada" },
  // Troncales
  { code: "MT-CENTRO-01", type: "main_trunk", lat: 37.17633, lng: -3.59547, address: "Gran Vía 22, Granada" },
  { code: "MT-REALEJO-01", type: "main_trunk", lat: 37.17210, lng: -3.59250, address: "Realejo, Granada" },
  { code: "MT-ALBAICIN-01", type: "main_trunk", lat: 37.18010, lng: -3.59520, address: "Albaicín bajo, Granada" },
  { code: "MT-ZAIDIN-01", type: "main_trunk", lat: 37.16100, lng: -3.60800, address: "Zaidín, Granada" },
  // Subtroncales
  { code: "ST-ALB-001", type: "subtrunk", lat: 37.18121, lng: -3.59300, address: "Cuesta del Chapiz, Albaicín" },
  { code: "ST-ALB-002", type: "subtrunk", lat: 37.18310, lng: -3.59110, address: "Plaza Larga, Albaicín" },
  { code: "ST-REAL-001", type: "subtrunk", lat: 37.17050, lng: -3.59100, address: "Campo del Príncipe, Realejo" },
  { code: "ST-ZAI-001", type: "subtrunk", lat: 37.15910, lng: -3.60500, address: "Arabial, Zaidín" },
  // CTOs (solo unos cuantos para el MVP; el blueprint pide 50)
  { code: "CTO-ALB-001", type: "cto", lat: 37.18150, lng: -3.59200, address: "Albaicín A1" },
  { code: "CTO-ALB-002", type: "cto", lat: 37.18200, lng: -3.59350, address: "Albaicín A2" },
  { code: "CTO-ALB-003", type: "cto", lat: 37.18400, lng: -3.59050, address: "Albaicín A3" },
  { code: "CTO-REAL-001", type: "cto", lat: 37.17000, lng: -3.59150, address: "Realejo R1" },
  { code: "CTO-REAL-002", type: "cto", lat: 37.16900, lng: -3.59300, address: "Realejo R2" },
  { code: "CTO-ZAI-001", type: "cto", lat: 37.15850, lng: -3.60350, address: "Zaidín Z1" },
  { code: "CTO-ZAI-002", type: "cto", lat: 37.15750, lng: -3.60600, address: "Zaidín Z2" },
];

interface CableSeed {
  code: string;
  type: "main_trunk" | "trunk" | "subtrunk" | "drop";
  fiberCount: number;
  fromCode: string;
  toCode: string;
  lengthM?: number;
}

const CABLE_SEED: CableSeed[] = [
  { code: "CBL-MAIN-01", type: "main_trunk", fiberCount: 96, fromCode: "OLT-GRA-01", toCode: "MT-CENTRO-01", lengthM: 420 },
  { code: "CBL-MT-ALB", type: "trunk", fiberCount: 48, fromCode: "MT-CENTRO-01", toCode: "MT-ALBAICIN-01", lengthM: 550 },
  { code: "CBL-MT-REAL", type: "trunk", fiberCount: 48, fromCode: "MT-CENTRO-01", toCode: "MT-REALEJO-01", lengthM: 480 },
  { code: "CBL-MT-ZAI", type: "trunk", fiberCount: 48, fromCode: "MT-CENTRO-01", toCode: "MT-ZAIDIN-01", lengthM: 1800 },
  { code: "CBL-ST-ALB-01", type: "subtrunk", fiberCount: 24, fromCode: "MT-ALBAICIN-01", toCode: "ST-ALB-001", lengthM: 210 },
  { code: "CBL-ST-ALB-02", type: "subtrunk", fiberCount: 24, fromCode: "MT-ALBAICIN-01", toCode: "ST-ALB-002", lengthM: 320 },
  { code: "CBL-ST-REAL-01", type: "subtrunk", fiberCount: 24, fromCode: "MT-REALEJO-01", toCode: "ST-REAL-001", lengthM: 180 },
  { code: "CBL-ST-ZAI-01", type: "subtrunk", fiberCount: 24, fromCode: "MT-ZAIDIN-01", toCode: "ST-ZAI-001", lengthM: 600 },
  { code: "CBL-DROP-ALB-001", type: "drop", fiberCount: 2, fromCode: "ST-ALB-001", toCode: "CTO-ALB-001", lengthM: 60 },
  { code: "CBL-DROP-ALB-002", type: "drop", fiberCount: 2, fromCode: "ST-ALB-001", toCode: "CTO-ALB-002", lengthM: 80 },
  { code: "CBL-DROP-ALB-003", type: "drop", fiberCount: 2, fromCode: "ST-ALB-002", toCode: "CTO-ALB-003", lengthM: 100 },
  { code: "CBL-DROP-REAL-001", type: "drop", fiberCount: 2, fromCode: "ST-REAL-001", toCode: "CTO-REAL-001", lengthM: 50 },
  { code: "CBL-DROP-REAL-002", type: "drop", fiberCount: 2, fromCode: "ST-REAL-001", toCode: "CTO-REAL-002", lengthM: 70 },
  { code: "CBL-DROP-ZAI-001", type: "drop", fiberCount: 2, fromCode: "ST-ZAI-001", toCode: "CTO-ZAI-001", lengthM: 55 },
  { code: "CBL-DROP-ZAI-002", type: "drop", fiberCount: 2, fromCode: "ST-ZAI-001", toCode: "CTO-ZAI-002", lengthM: 90 },
];

async function main() {
  console.log("→ Sembrando datos de demo…");
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";

  // 1. Organización
  let [org] = await db.select().from(organizations).where(sql`${organizations.slug} = ${DEMO_SLUG}`).limit(1);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "TMDigital (demo)", slug: DEMO_SLUG, country: "ES" })
      .returning();
    console.log(`  ✓ Organización creada: ${org!.slug}`);
  } else {
    console.log(`  = Organización ya existe: ${org.slug}`);
  }
  if (!org) throw new Error("org is null after seed");

  // 2. Usuarios
  for (const u of DEMO_USERS) {
    let [row] = await db.select().from(users).where(sql`${users.email} = ${u.email}`).limit(1);
    if (!row) {
      await auth.api.signUpEmail({ body: { email: u.email, password: u.password, name: u.name } });
      [row] = await db.select().from(users).where(sql`${users.email} = ${u.email}`).limit(1);
      console.log(`  ✓ Usuario creado: ${u.email} (${u.role})`);
    }
    if (!row) continue;
    await db
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: row.id, role: u.role })
      .onConflictDoNothing();
  }

  // 3. Branding + dominio
  await db
    .insert(tenantBranding)
    .values({
      organizationId: org.id,
      displayName: "TMDigital",
      primaryColor: "#1E5FFF",
      accentColor: "#0EA5E9",
    })
    .onConflictDoNothing();
  await db
    .insert(tenantDomains)
    .values({
      organizationId: org.id,
      hostname: `${DEMO_SLUG}.${rootDomain}`,
      isPrimary: true,
      isSubdomain: true,
      status: "active",
    })
    .onConflictDoNothing();

  // 4. Set tenant context para que audit trigger funcione + poder insertar bajo RLS
  const adminUser = (await db.select().from(users).where(sql`${users.email} = ${DEMO_USERS[0]!.email}`).limit(1))[0]!;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${adminUser.id}, true)`);
    await tx.execute(sql`SELECT set_config('app.organization_id', ${org.id}, true)`);

    // Cajas
    const boxIdByCode = new Map<string, string>();
    for (const b of BOX_SEED) {
      const existing = await tx
        .select({ id: boxes.id })
        .from(boxes)
        .where(sql`${boxes.organizationId} = ${org.id} AND ${boxes.code} = ${b.code}`)
        .limit(1);
      if (existing.length > 0 && existing[0]) {
        boxIdByCode.set(b.code, existing[0].id);
        continue;
      }
      const [row] = await tx
        .insert(boxes)
        .values({
          organizationId: org.id,
          code: b.code,
          shortId: "",
          type: b.type,
          status: "active",
          address: b.address,
          location: pointSQL({ lat: b.lat, lng: b.lng }) as unknown as string,
          createdBy: adminUser.id,
          updatedBy: adminUser.id,
        })
        .returning({ id: boxes.id });
      if (row) boxIdByCode.set(b.code, row.id);
    }
    console.log(`  ✓ ${boxIdByCode.size} cajas`);

    // Cables + fibras
    let cableCount = 0;
    let fiberCount = 0;
    for (const c of CABLE_SEED) {
      const exists = await tx
        .select({ id: cables.id })
        .from(cables)
        .where(sql`${cables.organizationId} = ${org.id} AND ${cables.code} = ${c.code}`)
        .limit(1);
      if (exists.length > 0) continue;

      const fromBox = BOX_SEED.find((b) => b.code === c.fromCode);
      const toBox = BOX_SEED.find((b) => b.code === c.toCode);
      if (!fromBox || !toBox) continue;

      const [cable] = await tx
        .insert(cables)
        .values({
          organizationId: org.id,
          code: c.code,
          type: c.type,
          standard: "G657A2",
          fiberCount: c.fiberCount,
          lengthM: c.lengthM ? String(c.lengthM) : null,
          sourceBoxId: boxIdByCode.get(c.fromCode) ?? null,
          targetBoxId: boxIdByCode.get(c.toCode) ?? null,
          path: lineStringSQL([
            { lat: fromBox.lat, lng: fromBox.lng },
            { lat: toBox.lat, lng: toBox.lng },
          ]) as unknown as string,
          createdBy: adminUser.id,
          updatedBy: adminUser.id,
        })
        .returning({ id: cables.id });

      if (!cable) continue;
      cableCount++;

      const rows = Array.from({ length: c.fiberCount }, (_, i) => ({
        organizationId: org.id,
        cableId: cable.id,
        number: i + 1,
        color: colorForFiber(i + 1),
      }));
      await tx.insert(fibers).values(rows);
      fiberCount += rows.length;
    }
    console.log(`  ✓ ${cableCount} cables · ${fiberCount} fibras`);

    // ============ Splitters en MT-ALBAICIN-01 ============
    const mtAlbId = boxIdByCode.get("MT-ALBAICIN-01");
    if (mtAlbId) {
      const splitterSeeds = [
        { code: "SPL-ALB-A", ratio: "1x8" as const, insertionLossDb: "10.50" },
        { code: "SPL-ALB-B", ratio: "1x8" as const, insertionLossDb: "10.60" },
      ];
      const splitterIdByCode = new Map<string, string>();
      for (const s of splitterSeeds) {
        const existing = await tx
          .select({ id: splitters.id })
          .from(splitters)
          .where(sql`${splitters.organizationId} = ${org.id} AND ${splitters.code} = ${s.code}`)
          .limit(1);
        if (existing.length > 0 && existing[0]) {
          splitterIdByCode.set(s.code, existing[0].id);
          continue;
        }
        const [row] = await tx
          .insert(splitters)
          .values({
            organizationId: org.id,
            boxId: mtAlbId,
            code: s.code,
            ratio: s.ratio,
            insertionLossDb: s.insertionLossDb,
            createdBy: adminUser.id,
            updatedBy: adminUser.id,
          })
          .returning({ id: splitters.id });
        if (row) splitterIdByCode.set(s.code, row.id);
      }
      console.log(`  ✓ ${splitterIdByCode.size} splitters en MT-ALBAICIN-01`);

      // Fusiones: 16 fibras de CBL-MT-ALB (troncal) → inputs y outputs de los 2 splitters.
      // Estrategia sencilla:
      //   - Fibras 1-2 del cable troncal → inputs de splitter A y B (fusión entrada).
      //   - Outputs 1-8 de cada splitter → fibras 1-8 de dos subtroncales.
      // Conectamos 2 splitters completos: 2 inputs + 16 outputs = 18 fusiones. Si la tabla no lo
      // permite por UNIQUE (p.ej. se re-ejecuta el seed), saltamos la fila.

      const cableTrunkAlb = await tx
        .select({ id: cables.id })
        .from(cables)
        .where(sql`${cables.organizationId} = ${org.id} AND ${cables.code} = 'CBL-MT-ALB'`)
        .limit(1);
      const cableStAlb01 = await tx
        .select({ id: cables.id })
        .from(cables)
        .where(sql`${cables.organizationId} = ${org.id} AND ${cables.code} = 'CBL-ST-ALB-01'`)
        .limit(1);
      const cableStAlb02 = await tx
        .select({ id: cables.id })
        .from(cables)
        .where(sql`${cables.organizationId} = ${org.id} AND ${cables.code} = 'CBL-ST-ALB-02'`)
        .limit(1);

      if (cableTrunkAlb[0] && cableStAlb01[0] && cableStAlb02[0]) {
        const fibersTrunk = await tx
          .select({ id: fibers.id, number: fibers.number })
          .from(fibers)
          .where(sql`${fibers.cableId} = ${cableTrunkAlb[0].id}`)
          .orderBy(fibers.number);
        const fibersStA = await tx
          .select({ id: fibers.id, number: fibers.number })
          .from(fibers)
          .where(sql`${fibers.cableId} = ${cableStAlb01[0].id}`)
          .orderBy(fibers.number);
        const fibersStB = await tx
          .select({ id: fibers.id, number: fibers.number })
          .from(fibers)
          .where(sql`${fibers.cableId} = ${cableStAlb02[0].id}`)
          .orderBy(fibers.number);

        const splitterA = splitterIdByCode.get("SPL-ALB-A");
        const splitterB = splitterIdByCode.get("SPL-ALB-B");
        if (splitterA && splitterB) {
          const portsA = await tx
            .select({ id: splitterPorts.id, kind: splitterPorts.kind, portNumber: splitterPorts.portNumber })
            .from(splitterPorts)
            .where(sql`${splitterPorts.splitterId} = ${splitterA}`)
            .orderBy(splitterPorts.kind, splitterPorts.portNumber);
          const portsB = await tx
            .select({ id: splitterPorts.id, kind: splitterPorts.kind, portNumber: splitterPorts.portNumber })
            .from(splitterPorts)
            .where(sql`${splitterPorts.splitterId} = ${splitterB}`)
            .orderBy(splitterPorts.kind, splitterPorts.portNumber);

          const inA = portsA.find((p) => p.kind === "input");
          const inB = portsB.find((p) => p.kind === "input");
          const outsA = portsA.filter((p) => p.kind === "output").sort((a, b) => a.portNumber - b.portNumber);
          const outsB = portsB.filter((p) => p.kind === "output").sort((a, b) => a.portNumber - b.portNumber);

          async function safeInsertFusion(values: Parameters<typeof tx.insert<typeof fusions>>) {
            // no-op helper; uses generic form indirect
            void values;
          }
          void safeInsertFusion;

          // 2 inputs
          if (inA && fibersTrunk[0]) {
            await tx
              .insert(fusions)
              .values({
                organizationId: org.id,
                boxId: mtAlbId,
                endpointAKind: "fiber",
                endpointAFiberId: fibersTrunk[0].id,
                endpointBKind: "splitter_port",
                endpointBSplitterPortId: inA.id,
                lossDb: "0.15",
                technicianId: adminUser.id,
              })
              .onConflictDoNothing();
          }
          if (inB && fibersTrunk[1]) {
            await tx
              .insert(fusions)
              .values({
                organizationId: org.id,
                boxId: mtAlbId,
                endpointAKind: "fiber",
                endpointAFiberId: fibersTrunk[1].id,
                endpointBKind: "splitter_port",
                endpointBSplitterPortId: inB.id,
                lossDb: "0.18",
                technicianId: adminUser.id,
              })
              .onConflictDoNothing();
          }
          // 8 outputs A → fibras 1-8 de ST-ALB-01
          for (let i = 0; i < 8; i++) {
            const port = outsA[i];
            const fib = fibersStA[i];
            if (!port || !fib) continue;
            await tx
              .insert(fusions)
              .values({
                organizationId: org.id,
                boxId: mtAlbId,
                endpointAKind: "splitter_port",
                endpointASplitterPortId: port.id,
                endpointBKind: "fiber",
                endpointBFiberId: fib.id,
                lossDb: "0.12",
                technicianId: adminUser.id,
              })
              .onConflictDoNothing();
          }
          // 8 outputs B → fibras 1-8 de ST-ALB-02
          for (let i = 0; i < 8; i++) {
            const port = outsB[i];
            const fib = fibersStB[i];
            if (!port || !fib) continue;
            await tx
              .insert(fusions)
              .values({
                organizationId: org.id,
                boxId: mtAlbId,
                endpointAKind: "splitter_port",
                endpointASplitterPortId: port.id,
                endpointBKind: "fiber",
                endpointBFiberId: fib.id,
                lossDb: "0.14",
                technicianId: adminUser.id,
              })
              .onConflictDoNothing();
          }
          console.log(`  ✓ Fusiones demo en MT-ALBAICIN-01 (2 inputs + 16 outputs)`);
        }
      }
    }

    // ============ Clientes ============
    // Asignamos 1-3 clientes por CTO, usando fibras de sus cables drop.
    const dropCableCodes = CABLE_SEED.filter((c) => c.type === "drop");
    const CLIENT_FIRST_NAMES = ["Carmen", "Javier", "Lucía", "Pablo", "Ana", "Miguel", "Sara", "David", "Laura", "Raúl", "María", "Alberto", "Noelia", "Pedro", "Isabel"];
    const CLIENT_LAST_NAMES = ["López", "García", "Martínez", "Sánchez", "Pérez", "Gómez", "Fernández", "Ruiz", "Díaz", "Moreno", "Muñoz", "Alonso", "Castro", "Torres", "Vega"];

    let clientCount = 0;
    for (let i = 0; i < dropCableCodes.length; i++) {
      const dropCable = dropCableCodes[i]!;
      const targetBox = BOX_SEED.find((b) => b.code === dropCable.toCode);
      if (!targetBox) continue;

      // Fibras disponibles de este cable drop (normalmente 2)
      const rows = await tx
        .select({ id: fibers.id, number: fibers.number })
        .from(fibers)
        .innerJoin(cables, sql`${cables.id} = ${fibers.cableId}`)
        .where(sql`${cables.code} = ${dropCable.code} AND ${cables.organizationId} = ${org.id}`)
        .orderBy(fibers.number);

      // 1-2 clientes por CTO (en lugar de 3 para no saturar 2-fiber drops)
      const clientsHere = Math.min(rows.length, 2);
      for (let k = 0; k < clientsHere; k++) {
        const fib = rows[k];
        if (!fib) continue;
        const firstName = CLIENT_FIRST_NAMES[(i * 3 + k) % CLIENT_FIRST_NAMES.length]!;
        const lastName = CLIENT_LAST_NAMES[(i * 5 + k) % CLIENT_LAST_NAMES.length]!;
        const externalCode = `CLI-${String(i * 10 + k + 1).padStart(4, "0")}`;

        const exists = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(sql`${clients.organizationId} = ${org.id} AND ${clients.externalCode} = ${externalCode}`)
          .limit(1);
        if (exists.length > 0) continue;

        // Location ligeramente distinta a la CTO para dispersar en el mapa
        const jitter = (n: number) => n + (Math.random() - 0.5) * 0.0008;
        await tx.insert(clients).values({
          organizationId: org.id,
          externalCode,
          name: `${firstName} ${lastName}`,
          documentId: `${String(30000000 + i * 10 + k)}A`,
          phone: `+346${String(10000000 + i * 100 + k * 17).slice(-8)}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.test`,
          address: `${targetBox.address} · Portal ${k + 1}`,
          location: pointSQL({ lat: jitter(targetBox.lat), lng: jitter(targetBox.lng) }) as unknown as string,
          ontSerial: `HWTC${String(1000000 + i * 100 + k * 7).slice(-7)}`,
          ontModel: "Huawei EG8145V5",
          dropFiberId: fib.id,
          status: k === 0 ? "active" : Math.random() > 0.3 ? "active" : "pending",
          installedAt: `2025-${String(((i + 1) % 12) + 1).padStart(2, "0")}-15`,
          createdBy: adminUser.id,
          updatedBy: adminUser.id,
        });
        clientCount++;
      }
    }
    console.log(`  ✓ ${clientCount} clientes`);
  });

  console.log("✓ Seed completada.");
  console.log(`  Login: admin@demo.test / Demo1234!`);
  console.log(`  Tenant: http://${DEMO_SLUG}.${rootDomain}:3000/`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed falló:", err);
  process.exit(1);
});
