import type { NextRequest } from "next/server";
import { parseId, readJson, withUser } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/members";
import { isRaidType } from "@/lib/raid/tactics";
import { deleteRaid, getRaidDetail, setRaidType } from "@/lib/raids";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/raids/[id]">) {
  return withUser(async () => {
    const raid = getRaidDetail(parseId((await ctx.params).id));
    if (!raid) throw new NotFoundError("성역 방을 찾을 수 없습니다.");
    return Response.json({ raid });
  });
}

// body: { raidType }  성역 종류 변경
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/raids/[id]">) {
  return withUser(async (user) => {
    const body = await readJson(req);
    if (!isRaidType(body.raidType)) throw new ValidationError("성역 종류가 올바르지 않습니다.");
    setRaidType(user.id, parseId((await ctx.params).id), body.raidType);
    return new Response(null, { status: 204 });
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/raids/[id]">) {
  return withUser(async (user) => {
    deleteRaid(user.id, parseId((await ctx.params).id));
    return new Response(null, { status: 204 });
  });
}
