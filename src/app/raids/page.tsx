import { requireOnboardedUser } from "@/lib/guards";
import AppHeader from "@/components/AppHeader";
import RaidList from "@/components/RaidList";

export default async function RaidsPage() {
  const user = await requireOnboardedUser();
  return (
    <main className="mx-auto flex w-full min-w-[1100px] max-w-[1600px] flex-1 flex-col gap-6 px-10 py-6">
      <AppHeader userName={user.name} />
      <h1 className="text-xl font-bold">성역</h1>
      <RaidList />
    </main>
  );
}
