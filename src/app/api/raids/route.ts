import { readJson, requireString, withUser } from "@/lib/api";
import { ValidationError } from "@/lib/members";
import { isRaidType } from "@/lib/raid/tactics";
import { createRaid, listRaids } from "@/lib/raids";

export async function GET() {
  return withUser(() => Response.json({ raids: listRaids() }));
}

// body: { title?, raidDate: "YYYY-MM-DDTHH:mm", raidType, mode: "multi" | "single" }  title 생략 시 성역 이름
export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await readJson(req);
    const title = typeof body.title === "string" && body.title.trim() ? requireString(body.title, "방 이름") : null;
    const raidDate = requireString(body.raidDate, "일시");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raidDate)) throw new ValidationError("일시 형식이 올바르지 않습니다.");
    if (!isRaidType(body.raidType)) throw new ValidationError("성역 종류를 선택하세요.");
    if (body.mode !== "multi" && body.mode !== "single") throw new ValidationError("방식을 선택하세요.");
    const raid = createRaid(user.id, { title, raidDate, raidType: body.raidType, mode: body.mode });
    return Response.json({ raid }, { status: 201 });
  });
}
