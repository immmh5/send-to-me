import { isAuthed } from "@/lib/auth";
import { clearItems, listItems } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const items = await listItems();
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const count = await clearItems();
  return Response.json({ ok: true, deleted: count });
}
