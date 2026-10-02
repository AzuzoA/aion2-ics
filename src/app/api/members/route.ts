import { withUser } from "@/lib/api";
import { listMemberTrees } from "@/lib/members";

// 전체 레기온원의 유저 → 계정 → 캐릭터 트리
export async function GET() {
  return withUser(() => Response.json({ members: listMemberTrees() }));
}
