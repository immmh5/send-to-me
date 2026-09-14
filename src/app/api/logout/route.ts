import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(req));
  return res;
}
