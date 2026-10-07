import { requireOnboardedUser } from "@/lib/guards";
import AppHeader from "@/components/AppHeader";
import MyCharacters from "@/components/MyCharacters";

export default async function MyPage() {
  const user = await requireOnboardedUser();
  return (
    <main className="mx-auto flex w-full min-w-[1100px] max-w-[1600px] flex-1 flex-col gap-6 px-10 py-6">
      <AppHeader userName={user.name} />
      <MyCharacters />
    </main>
  );
}
