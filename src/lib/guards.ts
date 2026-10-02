import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import type { UserRow } from "./members";

/** 로그인 + 별칭 설정까지 마친 유저만 통과. 아니면 알맞은 페이지로 보낸다. */
export async function requireOnboardedUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.onboarded_at) redirect("/onboarding");
  return user;
}
