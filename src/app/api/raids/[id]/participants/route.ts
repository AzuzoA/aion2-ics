import type { NextRequest } from "next/server";
import { parseId, readJson, withUser } from "@/lib/api";
import { addParticipant } from "@/lib/raids";

// body: { characterId }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/raids/[id]/participants">) {
  return withUser(async (user) => {
    const body = await readJson(req);
    addParticipant(user.id, parseId((await ctx.params).id), parseId(body.characterId));
    return new Response(null, { status: 201 });
  });
}
