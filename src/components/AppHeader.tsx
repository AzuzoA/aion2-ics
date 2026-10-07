import Link from "next/link";
import { SignOutButton } from "./AuthButtons";
import ThemeToggle from "./ThemeToggle";

export default function AppHeader({ userName }: { userName: string }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
      <nav className="flex items-center gap-4 text-sm">
        <span className="font-bold">AION2 레이드</span>
        <Link href="/me" className="hover:underline">
          내 캐릭터
        </Link>
        <Link href="/members" className="hover:underline">
          레기온원
        </Link>
        <Link href="/raids" className="hover:underline">
          성역
        </Link>
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <ThemeToggle />
        <span>{userName}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
