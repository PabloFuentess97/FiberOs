import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({
      ok: true,
      version: process.env.IMAGE_TAG ?? "dev",
      now: Date.now(),
    });
  } catch {
    return Response.json({ ok: false, error: "db" }, { status: 503 });
  }
}
