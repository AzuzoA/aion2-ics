import { parseId, readJson, requireString, withUser } from "@/lib/api";
import { createAccount } from "@/lib/members";

// body: { label, userId? }  userId 생략 시 본인
export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await readJson(req);
    const label = requireString(body.label, "계정 이름");
    const userId = body.userId === undefined ? user.id : parseId(String(body.userId));
    const account = createAccount(user.id, userId, label);
    return Response.json({ account }, { status: 201 });
  });
}
