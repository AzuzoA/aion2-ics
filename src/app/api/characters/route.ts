import { optionalBoolean, parseId, readJson, requireClass, requireNonNegativeInt, requireString, withUser } from "@/lib/api";
import { registerCharacter } from "@/lib/members";

// body: { accountId, name, class, combatPower, isMain? }
// NC API를 쓸 수 없어 직업·남툴은 직접 입력받는다.
export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await readJson(req);
    const accountId = parseId(body.accountId);
    const character = registerCharacter(
      user.id,
      accountId,
      {
        name: requireString(body.name, "캐릭터명", 20),
        class: requireClass(body.class),
        combatPower: requireNonNegativeInt(body.combatPower, "남툴"),
      },
      optionalBoolean(body.isMain, "isMain") ?? false,
    );
    return Response.json({ character }, { status: 201 });
  });
}
