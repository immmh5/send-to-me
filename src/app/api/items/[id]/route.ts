import { isAuthed } from "@/lib/auth";
import { deleteItem } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const removed = await deleteItem(id);
  if (!removed) {
    return Response.json({ error: "العنصر غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
