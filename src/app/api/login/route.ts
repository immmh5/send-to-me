import {
  clearAttempts,
  getConfig,
  makeToken,
  sessionCookie,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (tooManyAttempts(ip)) {
    return Response.json(
      { error: "محاولات كثيرة — جرّب مرة أخرى بعد قليل" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const password =
    typeof body === "object" && body !== null
      ? (body as { password?: unknown }).password
      : null;
  if (typeof password !== "string" || password.length === 0) {
    return Response.json({ error: "اكتب كلمة المرور" }, { status: 400 });
  }

  if (!(await verifyPassword(password))) {
    return Response.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }

  clearAttempts(ip);
  const cfg = await getConfig();
  const token = makeToken(cfg.secret);
  const res = Response.json({ ok: true, isDefault: !cfg.passwordChanged });
  res.headers.append("Set-Cookie", sessionCookie(token, req));
  return res;
}
