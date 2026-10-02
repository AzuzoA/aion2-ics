import { requireOnboardedUser } from "@/lib/guards";
import AppHeader from "@/components/AppHeader";
import MemberTree from "@/components/MemberTree";

export default async function MembersPage() {
  const user = await requireOnboardedUser();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <AppHeader userName={user.name} />
      <h1 className="text-xl font-bold">레기온원 캐릭터 현황</h1>
      <MemberTree currentUserId={user.id} />
    </main>
  );
}
