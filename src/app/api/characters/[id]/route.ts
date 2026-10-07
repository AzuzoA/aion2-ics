import type { NextRequest } from "next/server";
import { optionalBoolean, parseId, readJson, requireClass, requireNonNegativeInt, withUser } from "@/lib/api";
import { deleteCharacter, updateCharacter } from "@/lib/members";

// body: { isMain?, accountId?, class?, combatPower? }
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/characters/[id]">) {
  return withUser(async (user) => {
    const id = parseId((await ctx.params).id);
    const body = await readJson(req);
    const character = updateCharacter(user.id, id, {
      isMain: optionalBoolean(body.isMain, "isMain"),
      accountId: body.accountId === undefined ? undefined : parseId(body.accountId),
      class: body.class === undefined ? undefined : requireClass(body.class),
      combatPower: body.combatPower === undefined ? undefined : requireNonNegativeInt(body.combatPower, "남툴"),
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
