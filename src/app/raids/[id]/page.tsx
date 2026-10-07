import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/guards";
import { getRaidDetail } from "@/lib/raids";
import AppHeader from "@/components/AppHeader";
import RaidRoom from "@/components/RaidRoom";

export default async function RaidPage(props: PageProps<"/raids/[id]">) {
  const user = await requireOnboardedUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id) || !getRaidDetail(id)) notFound();
  return (
    <main className="mx-auto flex w-full min-w-[1100px] max-w-[1600px] flex-1 flex-col gap-6 px-10 py-6">
      <AppHeader userName={user.name} />
      <RaidRoom raidId={id} currentUserId={user.id} />
    </main>
  );
}
