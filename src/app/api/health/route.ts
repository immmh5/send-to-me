import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getDriver } from "@/lib/storage";
import { megaStatus } from "@/lib/storage/mega";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Uptime + storage status (no secrets, no auth needed).
 * Also the right target for a keep-warm ping service (cron-job.org …):
 * every hit keeps the host awake → fewer MEGA cold-start logins.
 */
export async function GET() {
  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = false;
  }

  const driver = getDriver();
  const storage: Record<string, unknown> = { kind: driver.kind };
  if (driver.kind === "mega") {
    const s = megaStatus();
    storage.state = s.state;
    storage.message = s.message;
    storage.cooldownSec = s.cooldownSec;
  }

  return Response.json(
    { ok: dbOk, db: dbOk ? "up" : "down", storage },
    { status: dbOk ? 200 : 500 },
  );
}
