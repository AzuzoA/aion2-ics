import { readJson, requireString, withUser } from "@/lib/api";
import { listMemberTrees, setUserAlias } from "@/lib/members";

// 내 정보 + 계정/캐릭터 트리
export async function GET() {
  return withUser((user) =>
    Response.json({
      user: { id: user.id, name: user.name, onboarded: user.onboarded_at !== null },
      tree: listMemberTrees(user.id)[0],
    }),
  );
}

// body: { name }  메인 별칭 설정 (최초 설정 시 온보딩 완료)
export async function PATCH(req: Request) {
  return withUser(async (user) => {
    const body = await readJson(req);
    const updated = setUserAlias(user.id, user.id, requireString(body.name, "별칭", 20));
    return Response.json({ user: { id: updated.id, name: updated.name, onboarded: true } });
  });
}
