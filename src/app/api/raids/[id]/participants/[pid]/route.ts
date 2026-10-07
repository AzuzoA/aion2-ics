import type { NextRequest } from "next/server";
import { parseId, readJson, withUser } from "@/lib/api";
import { ValidationError } from "@/lib/members";
import { removeParticipant, setParticipantRound, setParticipantSlot, swapParticipants } from "@/lib/raids";

// body: { round: number | null, party?: number, slot?: number }  수동 회차·파티(·빈자리) 이동 (round null = 대기)
//    또는 { slot: number }  같은 파티 안 자리 지정 (있던 사람과 맞바꿈)
//    또는 { swapWith: 참가 ID }  두 사람의 회차·파티·자리 맞바꿈 (드래그 앤 드롭)
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/raids/[id]/participants/[pid]">) {
  return withUser(async (user) => {
    const { id, pid } = await ctx.params;
    const body = await readJson(req);
    if (body.swapWith !== undefined) {
      swapParticipants(user.id, parseId(id), parseId(pid), parseId(body.swapWith));
      return new Response(null, { status: 204 });
    }
    if (body.slot !== undefined && typeof body.slot !== "number") throw new ValidationError("자리가 올바르지 않습니다.");
    if (body.round === undefined && typeof body.slot === "number") {
      setParticipantSlot(user.id, parseId(id), parseId(pid), body.slot);
      return new Response(null, { status: 204 });
    }
    if (body.round !== null && typeof body.round !== "number") throw new ValidationError("회차가 올바르지 않습니다.");
    if (body.party !== undefined && typeof body.party !== "number") throw new ValidationError("파티가 올바르지 않습니다.");
    setParticipantRound(user.id, parseId(id), parseId(pid), body.round as number | null, body.party, body.slot as number | undefined);
    return new Response(null, { status: 204 });
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/raids/[id]/participants/[pid]">) {
  return withUser(async (user) => {
    const { id, pid } = await ctx.params;
    removeParticipant(user.id, parseId(id), parseId(pid));
    return new Response(null, { status: 204 });
  });
}
