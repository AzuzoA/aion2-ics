import type { NextRequest } from "next/server";
import { requireString, withUser } from "@/lib/api";
import { registeredNames } from "@/lib/members";
import { ncClient } from "@/lib/nc";

// GET /api/nc/search?server=...&name=...
// 결과마다 이미 등록된 캐릭터인지(registered) 함께 내려준다.
export async function GET(req: NextRequest) {
  return withUser(async () => {
    const params = req.nextUrl.searchParams;
    const server = requireString(params.get("server"), "서버");
    const name = requireString(params.get("name"), "캐릭터명", 20);
    const results = await ncClient.searchCharacters(server, name);
    const registered = registeredNames(server);
    return Response.json({
      results: results.map((r) => ({ ...r, registered: registered.has(r.name) })),
    });
  });
}
