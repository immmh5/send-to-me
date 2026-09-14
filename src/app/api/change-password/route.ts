import { changePassword, isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const { current, next } = (body ?? {}) as { current?: unknown; next?: unknown };
  if (typeof current !== "string" || typeof next !== "string") {
    return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const result = await changePassword(current, next);
  switch (result) {
    case "ok":
      return Response.json({ ok: true });
    case "wrong-current":
      return Response.json(
        { error: "كلمة المرور الحالية غير صحيحة" },
        { status: 403 },
      );
    default:
      return Response.json(
        { error: "كلمة المرور الجديدة يجب أن تكون بين ٤ و١٢٨ حرفًا" },
        { status: 400 },
      );
  }
}
