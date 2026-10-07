import type { NextRequest } from "next/server";
import { parseId, withUser } from "@/lib/api";
import { composeRaid } from "@/lib/raids";

// 자동 조합: 모든 참가자의 회차를 다시 계산한다 (수동 조정 내용은 덮어씀)
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/raids/[id]/compose">) {
  return withUser(async (user) => {
    composeRaid(user.id, parseId((await ctx.params).id));
    return new Response(null, { status: 204 });
  });
}
