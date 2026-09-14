import { getConfig, isAuthed } from "@/lib/auth";
import type { SessionInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cfg = await getConfig();
  const info: SessionInfo = {
    authed: await isAuthed(req),
    isDefault: !cfg.passwordChanged,
  };
  return Response.json(info, {
    headers: { "Cache-Control": "no-store" },
  });
}
