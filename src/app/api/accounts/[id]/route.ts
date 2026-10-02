import type { NextRequest } from "next/server";
import { parseId, readJson, requireString, withUser } from "@/lib/api";
import { deleteAccount, renameAccount } from "@/lib/members";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/accounts/[id]">) {
  return withUser(async (user) => {
    const id = parseId((await ctx.params).id);
    const body = await readJson(req);
    const account = renameAccount(user.id, id, requireString(body.label, "계정 이름"));
    return Response.json({ account });
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/accounts/[id]">) {
  return withUser(async (user) => {
    deleteAccount(user.id, parseId((await ctx.params).id));
    return new Response(null, { status: 204 });
  });
}
