import type { NextRequest } from "next/server";
import { optionalBoolean, parseId, readJson, withUser } from "@/lib/api";
import { deleteCharacter, updateCharacter } from "@/lib/members";

// body: { isMain?, accountId? }
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/characters/[id]">) {
  return withUser(async (user) => {
    const id = parseId((await ctx.params).id);
    const body = await readJson(req);
    const character = updateCharacter(user.id, id, {
      isMain: optionalBoolean(body.isMain, "isMain"),
      accountId: body.accountId === undefined ? undefined : parseId(body.accountId),
    });
    return Response.json({ character });
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/characters/[id]">) {
  return withUser(async (user) => {
    deleteCharacter(user.id, parseId((await ctx.params).id));
    return new Response(null, { status: 204 });
  });
}
