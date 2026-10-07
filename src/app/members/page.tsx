import { requireOnboardedUser } from "@/lib/guards";
import AppHeader from "@/components/AppHeader";
import MemberTree from "@/components/MemberTree";

export default async function MembersPage() {
  const user = await requireOnboardedUser();
  return (
    <main className="mx-auto flex w-full min-w-[1100px] max-w-[1600px] flex-1 flex-col gap-6 px-10 py-6">
      <AppHeader userName={user.name} />
      <h1 className="text-xl font-bold">레기온원 캐릭터 현황</h1>
      <MemberTree currentUserId={user.id} />
    </main>
  );
}
