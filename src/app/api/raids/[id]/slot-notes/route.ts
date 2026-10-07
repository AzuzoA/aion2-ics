import type { NextRequest } from "next/server";
import { parseId, readJson, withUser } from "@/lib/api";
import { ValidationError } from "@/lib/members";
import { setSlotNote } from "@/lib/raids";

// body: { round, party, slot, text, kind? }  빈자리에 이름 직접 입력 (text가 빈 문자열이면 삭제)
//   kind: "melee" | "ranged" | null  근접/원거리 (공략 자동 배정에 사용)
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/raids/[id]/slot-notes">) {
  return withUser(async (user) => {
    const body = await readJson(req);
    if (typeof body.text !== "string" || body.text.trim().length > 20) throw new ValidationError("이름은 20자 이하로 입력하세요.");
    const kind = body.kind ?? null;
    if (kind !== null && kind !== "melee" && kind !== "ranged") throw new ValidationError("근접/원거리가 올바르지 않습니다.");
    setSlotNote(
      user.id,
      parseId((await ctx.params).id),
      { round: Number(body.round), party: Number(body.party), slot: Number(body.slot) },
      body.text.trim(),
      kind,
    );
    return new Response(null, { status: 204 });
  });
}
