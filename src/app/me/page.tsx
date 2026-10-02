import { requireOnboardedUser } from "@/lib/guards";
import AppHeader from "@/components/AppHeader";
import MyCharacters from "@/components/MyCharacters";

export default async function MyPage() {
  const user = await requireOnboardedUser();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <AppHeader userName={user.name} />
      <MyCharacters />
    </main>
  );
}
