import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentUser } from "@/lib/auth";
import { DevLoginForm, DiscordLoginButton } from "@/components/AuthButtons";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboarded_at ? "/me" : "/onboarding");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">AION2 레기온 레이드 스케줄러</h1>
      <DiscordLoginButton />
      {devLoginEnabled && <DevLoginForm />}
    </main>
  );
}
