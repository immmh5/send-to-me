import crypto from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { broadcast } from "@/lib/events";
import { getDriver, thumbKey } from "@/lib/storage";
import type { Item, StoredFile } from "@/lib/types";

function toClient(row: typeof items.$inferSelect): Item {
  return {
    id: row.id,
    text: row.text,
    files: row.files,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listItems(): Promise<Item[]> {
  const rows = await db.select().from(items).orderBy(desc(items.createdAt));
  return rows.map(toClient);
}

export async function createItem(
  text: string | null,
  files: StoredFile[],
): Promise<Item> {
  const row: typeof items.$inferInsert = {
    id: crypto.randomUUID(),
    text: text && text.trim().length > 0 ? text.trim() : null,
    files,
  };
  const inserted = await db.insert(items).values(row).returning();
  broadcast({ type: "changed" });
  return toClient(inserted[0]);
}

async function deleteBlobs(fileIds: string[]): Promise<void> {
  const driver = getDriver();
  await Promise.all(
    fileIds.flatMap((id) => [driver.delete(id), driver.delete(thumbKey(id))]),
  );
}

export async function deleteItem(id: string): Promise<boolean> {
  const rows = await db.select().from(items).where(eq(items.id, id)).limit(1);
  const row = rows[0];
  if (!row) return false;
  await db.delete(items).where(eq(items.id, id));
  broadcast({ type: "changed" });
  await deleteBlobs(row.files.map((f) => f.id));
  return true;
}

export async function clearItems(): Promise<number> {
  const rows = await db.select().from(items);
  await db.delete(items);
  broadcast({ type: "changed" });
  await deleteBlobs(rows.flatMap((r) => r.files.map((f) => f.id)));
  return rows.length;
}

/** Finds a stored file + its owning item by file id (jsonb containment lookup). */
export async function findFile(
  fileId: string,
): Promise<{ file: StoredFile; itemId: string } | null> {
  const rows = await db
    .select()
    .from(items)
    .where(sql`${items.files} @> ${JSON.stringify([{ id: fileId }])}::jsonb`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const file = row.files.find((f) => f.id === fileId);
  return file ? { file, itemId: row.id } : null;
}
