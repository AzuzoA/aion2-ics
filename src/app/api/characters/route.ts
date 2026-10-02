import { optionalBoolean, parseId, readJson, requireString, withUser } from "@/lib/api";
import { NotFoundError, registerCharacter } from "@/lib/members";
import { ncClient } from "@/lib/nc";

// body: { accountId, server, name, isMain? }
// 직업/레벨/전투력은 클라이언트 입력이 아닌 NC API 조회 결과로 저장한다.
export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await readJson(req);
    const accountId = parseId(body.accountId);
    const server = requireString(body.server, "서버");
    const name = requireString(body.name, "캐릭터명", 20);
    const isMain = optionalBoolean(body.isMain, "isMain") ?? false;

    const nc = await ncClient.getCharacter(server, name);
    if (!nc) throw new NotFoundError("NC API에서 캐릭터를 찾을 수 없습니다.");
    const character = registerCharacter(user.id, accountId, nc, isMain);
    return Response.json({ character }, { status: 201 });
  });
}
