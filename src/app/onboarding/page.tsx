import { redirect } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import AliasForm from "@/components/AliasForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.onboarded_at) redirect("/me");

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        {user.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element -- Discord CDN 아바타
          <img src={user.avatar_url} alt="" className="h-16 w-16 rounded-full" />
        )}
        <h1 className="text-2xl font-bold">환영합니다!</h1>
        <p className="text-sm text-zinc-500">
          레기온에서 사용할 메인 별칭을 정해주세요. Discord 이름을 가져왔어요.
        </p>
      </div>
      <AliasForm initialName={user.name} />
    </main>
  );
}
